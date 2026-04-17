import { DefaultAgentInstance } from './AgentInstance.js';
import { isTerminal } from './AgentStateMachine.js';
import { ModelProvider, MessageContent, StreamEvent, StopReason } from '../types/model.js';
import { ToolIntegrationFacade, ToolDefinition } from '../types/tool.js';
import { PermissionSandbox } from '../permission/PermissionSandbox.js';
import { ToolValidationError, PermissionDeniedError, ToolExecutionError, ModelError } from '../types/errors.js';
import { MemoryStore } from '../memory/MemoryStore.js';
import { CheckpointManager } from '../checkpoint/CheckpointManager.js';
import { ExceptionHandler } from '../exception/ExceptionHandler.js';
import { VerificationPipeline } from '../validation/VerificationPipeline.js';
import { AgentEvent } from '../types/agent-events.js';
import { MiddlewarePipeline, MiddlewareContext, createMiddlewareContext } from './StreamMiddleware.js';
import { TokenCounterMiddleware } from './middleware/TokenCounterMiddleware.js';
import { ContentAccumulatorMiddleware } from './middleware/ContentAccumulatorMiddleware.js';
import { ToolDispatcherMiddleware } from './middleware/ToolDispatcherMiddleware.js';
import { StreamEventMapper } from './StreamEventMapper.js';

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
  const toolDispatcher = new ToolDispatcherMiddleware(tools, sandbox);
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

    // 2. Sense: memory context
    const memoryContext = reliability.memory.getContext();

    // 3. Assemble System Prompt
    let systemPrompt: string;
    if (deps.promptAssembler) {
      const assembled = await deps.promptAssembler.assemble({
        budget: 30000,
        cwd: process.cwd(),
        tools: tools.listAll().map(t => ({ 
          name: t.name, 
          description: t.description || '', 
          inputSchema: t.inputSchema 
        })),
        memoryContext,
        assets: deps.workspace?.assets?.getManifest?.() || undefined,
        workspaceConfig: deps.workspace?.config,
        reliability
      });
      systemPrompt = assembled.text;
    } else {
      systemPrompt = `${agent.definition.systemPrompt ?? ''}\n\n${memoryContext}`;
    }

    // [New Step] Intercept / commands
    if (deps.commandRegistry) {
      const lastMessage = agent.messages[agent.messages.length - 1];
      if (lastMessage && lastMessage.role === 'user' && typeof lastMessage.content === 'string' && deps.commandRegistry.isCommand(lastMessage.content)) {
        const cmdResult = await deps.commandRegistry.execute(lastMessage.content, {
          cumulative: context.cumulative,
          cwd: process.cwd(),
          assets: deps.workspace?.assets?.getManifest?.() || undefined,
        });



        yield { type: 'text_delta', text: cmdResult.output };
        
        if (!cmdResult.continueConversation) {
          agent.addMessage('assistant', [{ type: 'text', text: cmdResult.output }]);
          yield { 
            type: 'turn_complete', 
            turnNumber: context.turnNumber, 
            stopReason: 'end_turn', 
            content: [{ type: 'text', text: cmdResult.output }] 
          };
          context.cumulative.turnCount++;
          break; // End this local command turn without completing the agent lifecycle
        }
      }
    }

    try {
      // 4. Think: Stream LLM response
      let currentStopReason: StopReason = 'end_turn';

      const stream = model.chatStream({
        model: agent.definition.model,
        systemPrompt,
        messages: agent.messages as any,
        tools: tools.listAll(),
      });


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
          yield pe;
        }
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

        const toolResults: MessageContent[] = [];
        for await (const result of toolDispatcher.dispatchTools(
          context.pendingToolUses,
          agent.context,
        )) {
          yield result;
          toolResults.push({
            type: 'tool_result',
            tool_use_id: result.toolUseId,
            content: result.result,
            is_error: result.isError,
          });
        }

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

      // Yield final turn_complete to consumer
      for (const pe of tcProcessed) {
        yield pe;
      }

      context.cumulative.turnCount++;

    } catch (error: any) {
      // Error handling with circuit breaker
      if (error instanceof ModelError) {
        reliability.exceptionHandler.recordFailure('model');
      }

      yield {
        type: 'error',
        error,
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
