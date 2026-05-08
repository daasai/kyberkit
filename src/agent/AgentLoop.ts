import type { DefaultAgentInstance } from './AgentInstance.js';
import { isTerminal } from './AgentStateMachine.js';
import type { ModelProvider, MessageContent, StopReason } from '../types/model.js';
import type { ToolIntegrationFacade } from '../types/tool.js';
import type { PermissionSandbox } from '../permission/PermissionSandbox.js';
import { ModelError } from '../types/errors.js';
import type { MemoryStore } from '../memory/MemoryStore.js';
import type { CheckpointManager } from '../checkpoint/CheckpointManager.js';
import type { ExceptionHandler } from '../exception/ExceptionHandler.js';
import type { VerificationPipeline } from '../validation/VerificationPipeline.js';
import type { AgentEvent } from '../types/agent-events.js';
import { MiddlewarePipeline, createMiddlewareContext } from './StreamMiddleware.js';
import { TokenCounterMiddleware } from './middleware/TokenCounterMiddleware.js';
import { ContentAccumulatorMiddleware } from './middleware/ContentAccumulatorMiddleware.js';
import { ToolDispatcherMiddleware } from './middleware/ToolDispatcherMiddleware.js';
import { StreamEventMapper } from './StreamEventMapper.js';
import { resolveToolsForApi } from './resolveToolsForApi.js';
import { extractLatestNaturalUserText } from './userTurnText.js';
import { discoverActiveSkills } from '../prompt/SkillDiscoveryService.js';
import type { ToolRuleChecker } from '../tools/ToolRuleChecker.js';
import type { CanAuthorizeBatchFn, CanUseToolFn } from '../permission/ToolPermissionGate.js';
import { autoAllowCanUseTool } from '../permission/ToolPermissionGate.js';
import type { PermitStore } from '../permission/PermitStore.js';
import type { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';
import type { TaskPermissionContract } from '../permission/TaskPermissionContract.js';
import type { OutputGuardChecker } from './middleware/OutputGuardMiddleware.js';

export interface ReliabilityLayer {
  memory: MemoryStore;
  checkpoint: CheckpointManager;
  exceptionHandler: ExceptionHandler;
  verification: VerificationPipeline;
}

export interface AgentLoopDeps {
  agent: DefaultAgentInstance;
  model: ModelProvider;
  tools: ToolIntegrationFacade;
  sandbox: PermissionSandbox;
  pipeline: MiddlewarePipeline;
  reliability: ReliabilityLayer;
  // Sprint 2: Optional dynamic prompt assembly
  promptAssembler?: import('../prompt/PromptAssembler.js').PromptAssembler;
  // Sprint 2: Optional slash command system
  commandRegistry?: import('../commands/CommandRegistry.js').CommandRegistry;
  // Sprint 2: Workspace context
  workspace?: import('../runtime/WorkspaceInstance.js').WorkspaceInstance;
  /** Product-level hard directives injected into prompt assembly. */
  platformDirective?: string;
  // Sprint 4: Turn-begin context compaction guard
  compactionGuard?: import('./middleware/CompactionGuardMiddleware.js').CompactionGuardMiddleware;
  /** When set, agentLoop awaits this before reading L2 memory so async extraction has merged. */
  memoryTrigger?: import('./middleware/MemoryTriggerMiddleware.js').MemoryTriggerMiddleware;
  /** Single-turn model stream timeout (ms). */
  turnTimeoutMs?: number;
  /** Deny rules evaluated before tool execution. */
  toolRuleChecker?: ToolRuleChecker;
  /**
   * Mutable bag: runtime sets `canUseTool` for TUI prompts without recreating the session.
   * When absent, {@link autoAllowCanUseTool} is used. Sprint 3.5 adds `canAuthorizeBatch`
   * for the pre-dispatch batch authorization card.
   */
  toolPermission?: {
    canUseTool?: CanUseToolFn;
    canAuthorizeBatch?: CanAuthorizeBatchFn;
  };

  /** Sprint 3.5 §4.2 — shared task/session grant store (optional; enables batch + skip flow). */
  permitStore?: PermitStore;

  /** When set, tool dispatch emits `tool.call_start` / `tool.call_end` on this bus. */
  eventBus?: TypedEventBus<KyberEvents>;
  /** 3.0 P0: active task permission contract snapshot provider. */
  permissionContractProvider?: () => TaskPermissionContract | undefined;
  /** 3.0 P0.5: input-side prompt-injection checker for ToolDispatcherMiddleware. */
  outputGuardChecker?: OutputGuardChecker;
  /** Kevin Rev3: session-level logical cwd (Library mount). */
  executionCwd?: string;
}




/**
 * Core Agent Loop — async generator that yields AgentEvents.
 *
 * Architecture (per turn):
 *   1. [Checkpoint] Save state
 *   2. [Sense] Collect memory context
 *   3. [Think] Stream LLM response through middleware pipeline
 *   4. [Act] If tool_use → dispatch tools, add results to messages
 *   5. [Verify] If end_turn → run verification pipeline
 *   6. yield TurnCompleteEvent
 */
export async function* agentLoop(
  deps: AgentLoopDeps,
): AsyncGenerator<AgentEvent, void, void> {
  const { agent, model, tools, sandbox, pipeline, reliability } = deps;
  const canUseTool = deps.toolPermission?.canUseTool ?? autoAllowCanUseTool;
  const canAuthorizeBatch = deps.toolPermission?.canAuthorizeBatch;
  const permitStore = deps.permitStore;
  const toolObs =
    deps.eventBus != null
      ? { bus: deps.eventBus, getAgentId: () => agent.id }
      : undefined;
  const toolDispatcher = new ToolDispatcherMiddleware(tools, sandbox, {
    ruleChecker: deps.toolRuleChecker,
    canUseTool,
    canAuthorizeBatch,
    permitStore,
    observability: toolObs,
    permissionContractProvider: deps.permissionContractProvider,
    outputGuardChecker: deps.outputGuardChecker,
  });

  const observeTaskLifecycle = (ev: AgentEvent): void => {
    if (!permitStore) return;
    if (ev.type === 'task_plan' && ev.taskId) permitStore.setCurrentTask(ev.taskId);
    if (ev.type === 'task_complete') permitStore.onTaskComplete(ev.taskId);
  };
  const context = createMiddlewareContext(agent);
  const mapper = new StreamEventMapper();

  while (!isTerminal(agent.status) && agent.status === 'running') {
    context.turnNumber++;
    context.accumulatedContent = [];
    context.pendingToolUses = [];
    context.stopReason = null;
    mapper.reset();

    // 1. Checkpoint
    await reliability.checkpoint.save(agent as any, (reliability.memory as any).l2);

    // 1.5 Sprint 4: pre-turn compaction
    if (deps.compactionGuard) {
      try {
        const compaction = await deps.compactionGuard.evaluateAndCompact(agent);
        if (compaction.replacedMessages && compaction.replacedMessages.length > 0) {
          (agent as any).messages = compaction.replacedMessages as any;
          yield {
            type: 'status',
            status: 'compacted',
            message: 'Context compacted before turn.',
          };
        }
      } catch {
        // Compaction is best-effort; continue without interruption.
      }
    }

    // 1.75: prior turn's L2 extraction runs async on turn_complete; wait so getContext() sees merged notes.
    await deps.memoryTrigger?.waitIdle();

    context.latestUserTurnText = extractLatestNaturalUserText(agent.messages as any) ?? '';

    // 2. Sense: memory context
    const memoryContext = reliability.memory.getContext();

    const modelTools = tools.listAll();
    const resolvedTools = await resolveToolsForApi(modelTools, agent.context);
    const toolRowsForPrompt = resolvedTools.map((r) => ({
      name: r.name,
      description: r.description,
      inputSchema: r.inputSchema,
    }));

    const userTurnText = extractLatestNaturalUserText(agent.messages as any);
    const skillMetas = tools.listSkillMetas?.() ?? [];
    const effectiveCwd = deps.executionCwd ?? process.cwd();
    const active = discoverActiveSkills(skillMetas, {
      userText: userTurnText,
      cwd: effectiveCwd,
    });
    const skillContext = active.map((m) => `## ${m.name}\n${m.body}`).join('\n\n');

    // 3. Assemble System Prompt
    let systemPrompt: string;
    if (deps.promptAssembler) {
      const assembled = await deps.promptAssembler.assemble({
        budget: 30000,
        platformDirective: deps.platformDirective,
        cwd: effectiveCwd,
        tools: toolRowsForPrompt,
        memoryContext,
        assets: deps.workspace?.assets?.getManifest?.() || undefined,
        workspaceConfig: deps.workspace?.config,
        reliability,
        userTurnText,
        skillContext,
      });
      systemPrompt = assembled.text;
    } else {
      systemPrompt = `${agent.definition.systemPrompt ?? ''}\n\n${memoryContext}`;
    }

    try {
      // 4. Think: Stream LLM response
      let currentStopReason: StopReason = 'end_turn';

      const turnMs = deps.turnTimeoutMs ?? 120_000;
      const abortController = new AbortController();
      const turnTimer =
        turnMs > 0 ? setTimeout(() => abortController.abort(), turnMs) : undefined;

      yield { type: 'turn_phase', phase: 'model_stream' };

      const stream = model.chatStream({
        model: agent.definition.model,
        systemPrompt,
        messages: agent.messages as any,
        tools: modelTools,
        resolvedTools,
        abortSignal: abortController.signal,
      });

      try {
        for await (const streamEvent of stream) {
          // Capture stop reason from message_stop
          if (streamEvent.type === 'message_stop') {
            currentStopReason = streamEvent.stopReason;
            context.stopReason = currentStopReason;
            continue;
          }

          // D3 fix: Use StreamEventMapper for unified mapping + enrichment
          const agentEvent = mapper.mapEvent(streamEvent);
          if (!agentEvent) continue;

          // Process through middleware pipeline
          const processedEvents = pipeline.process(agentEvent, context);
          for (const pe of processedEvents) {
            observeTaskLifecycle(pe);
            yield pe;
          }
        }
      } catch (streamErr: any) {
        if (streamErr?.name === 'AbortError' && turnMs > 0) {
          yield {
            type: 'status',
            status: 'turn_timeout',
            message: `Turn timed out after ${turnMs} ms`,
          };
        }
        throw streamErr;
      } finally {
        if (turnTimer) clearTimeout(turnTimer);
      }

      // Record success
      reliability.exceptionHandler.recordSuccess('model');

      // Emit turn_complete through pipeline to trigger ContentAccumulator flush
      const turnCompleteEvent: AgentEvent = {
        type: 'turn_complete',
        turnNumber: context.turnNumber,
        stopReason: currentStopReason,
        content: [],
      };
      const tcProcessed = pipeline.process(turnCompleteEvent, context);

      // Record assistant message from accumulated content
      if (context.accumulatedContent.length > 0) {
        agent.addMessage('assistant', context.accumulatedContent);
      }

      // 5. Act: If tool_use, dispatch tools
      if (currentStopReason === 'tool_use' && context.pendingToolUses.length > 0) {
        reliability.memory.recordToolCall();

        yield { type: 'turn_phase', phase: 'tool_execution' };

        const toolResults: MessageContent[] = [];
        for await (const rawEv of toolDispatcher.dispatchTools(
          context.pendingToolUses,
          agent.context,
        )) {
          const processed = pipeline.process(rawEv, context);
          for (const ev of processed) {
            observeTaskLifecycle(ev);
            yield ev;
            if (ev.type === 'tool_result') {
              toolResults.push({
                type: 'tool_result',
                tool_use_id: ev.toolUseId,
                content: ev.result,
                is_error: ev.isError,
              });
            }
          }
        }

        yield { type: 'turn_phase', phase: 'idle' };

        if (toolResults.length > 0) {
          agent.addMessage('user', toolResults);
        }
      }

      // 6. Verify: If end_turn, run verification
      if (currentStopReason === 'end_turn') {
        agent.transition('task_done');

        const verifResult = await reliability.verification.execute({ agent, tools });

        if (verifResult.passed) {
          agent.transition('verified');
        } else {
          agent.addMessage('user',
            `Verification failed:\n${verifResult.summary}\nPlease fix the issues and try again.`
          );
          agent.transition('running');
        }
      }

      // Yield final turn_complete to consumer (NarratorMiddleware may synthesize
      // a trailing task_complete here — permit store must observe it before the
      // consumer sees turn_complete so any scoped grants are cleared).
      for (const pe of tcProcessed) {
        observeTaskLifecycle(pe);
        yield pe;
      }

      context.cumulative.turnCount++;

    } catch (error: any) {
      // Error handling with circuit breaker
      if (error instanceof ModelError) {
        reliability.exceptionHandler.recordFailure('model');
      }

      const turnMs = deps.turnTimeoutMs ?? 120_000;
      const errOut =
        error?.name === 'AbortError' && turnMs > 0
          ? new Error(`Turn timed out after ${turnMs} ms`)
          : error;

      yield {
        type: 'error',
        error: errOut,
        recoverable: !(error instanceof ModelError),
      };

      const action = await reliability.exceptionHandler.handle(error);
      if (action.strategy.type === 'abort') {
        agent.transition('error');
        yield { type: 'status', status: 'failed', message: error.message };
        break;
      }
    }
  }
}

/**
 * [Backward Compatible] Legacy wrapper — consumes the generator and discards events.
 * Preserves the existing API for callers that don't need streaming.
 */
export async function runAgentLoop(
  agent: DefaultAgentInstance,
  model: ModelProvider,
  tools: ToolIntegrationFacade,
  sandbox: PermissionSandbox,
  reliability: ReliabilityLayer,
): Promise<void> {
  const pipeline = new MiddlewarePipeline()
    .use(new TokenCounterMiddleware())
    .use(new ContentAccumulatorMiddleware());

  for await (const _event of agentLoop({
    agent, model, tools, sandbox, pipeline, reliability,
  })) {
    // Events discarded — legacy callers don't consume them
  }
}
