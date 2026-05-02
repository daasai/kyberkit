import { join } from 'path';
import { tmpdir } from 'os';
import { mkdir, rm } from 'fs/promises';
import { randomUUID } from 'crypto';
import type { TrajectoryRecorder } from '../observability/TrajectoryRecorder.js';

import type { DefaultAgentInstance } from '../agent/AgentInstance.js';
import { agentLoop } from '../agent/AgentLoop.js';
import type { ReliabilityLayer, AgentLoopDeps } from '../agent/AgentLoop.js';
import type {
  AgentEvent,
  CumulativeUsage,
  TaskPlanStep,
} from '../types/agent-events.js';
import { TurnSummaryBuilder } from './TurnSummaryBuilder.js';
import { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';
import { MemoryStore } from '../memory/MemoryStore.js';
import { JsonCheckpointProvider } from '../checkpoint/JsonCheckpointProvider.js';
import { CheckpointManager } from '../checkpoint/CheckpointManager.js';
import { ExceptionHandler } from '../exception/ExceptionHandler.js';
import { VerificationPipeline } from '../validation/VerificationPipeline.js';
import type { MiddlewarePipeline } from '../agent/StreamMiddleware.js';
import type { SkillSuggestionRunner } from '../skills/SkillSuggestionRunner.js';
import type { LearningLoopMiddleware } from '../learning/LearningLoopMiddleware.js';
import type { AssetRecord } from '../types/turn-summary.js';

// ─── Public API Types ────────────────────────────────────────────────────────

export interface CreateSessionOptions {
  /**
   * The workspace ID to use. Defaults to the runtime's active workspace.
   */
  workspaceId?: string;

  /**
   * A specific agent ID to use. Defaults to a new random UUID.
   */
  agentId?: string;

  /**
   * Reliability layer configuration:
   * - 'real':    persistent files under <cwd>/.kyberkit/runtime/ (default)
   * - 'inmemory': temp directory, auto-cleaned on session.close()
   * - object:    pass an already-constructed ReliabilityLayer directly
   *
   * Can also be set via KYBER_RELIABILITY env var ('real' | 'inmemory').
   */
  reliability?: 'real' | 'inmemory' | ReliabilityLayer;

  /**
   * Override the middleware pipeline for this session.
   * Defaults to runtime.createMiddlewarePipeline().
   */
  middleware?: MiddlewarePipeline;
  /**
   * Track B — async Skill draft suggestion after tool-heavy tasks.
   */
  skillSuggestion?: SkillSuggestionRunner;
  /**
   * 3.0 P0.5 — LearningLoop orchestrates evolution changelog + skill suggestion.
   * When provided, supersedes `skillSuggestion` for post-task learning.
   */
  learningLoop?: LearningLoopMiddleware;
}

export interface ReliabilityBuildConfig {
  /**
   * Per-session runtime root (holds session.json, checkpoints, sqlite DBs).
   * Typically `<cwd>/.kyberkit/runtime/`.
   */
  rootDir: string;
  /**
   * Workspace-scoped root where durable Markdown memories live.
   * Shared across sessions and visible to AssetRegistry / PromptAssembler.
   * When omitted (legacy callers / tests), falls back to `<rootDir>/memories/`.
   * Sprint 3.5 §2.3 path unification.
   */
  memoriesDir?: string;
  /** Agent ID used to namespace session/sqlite filenames. */
  agentId: string;
}

// ─── buildReliability helper ─────────────────────────────────────────────────

/**
 * Constructs a fully-wired ReliabilityLayer backed by real implementations.
 *
 * - 'real':    persists to `config.rootDir`; caller owns cleanup.
 * - 'inmemory': allocates a unique OS temp dir; cleanup() removes it.
 *
 * Both modes use the same implementations (MemoryStore, JsonCheckpointProvider,
 * ExceptionHandler, VerificationPipeline) — the only difference is where files live.
 */
export async function buildReliability(
  mode: 'real' | 'inmemory',
  config: ReliabilityBuildConfig,
): Promise<{ reliability: ReliabilityLayer; cleanup?: () => Promise<void>; rootDir: string }> {
  let rootDir = config.rootDir;
  let cleanup: (() => Promise<void>) | undefined;

  if (mode === 'inmemory') {
    rootDir = join(tmpdir(), `kyber-inmem-${randomUUID()}`);
    cleanup = async () => {
      await rm(rootDir, { recursive: true, force: true });
    };
  }

  await mkdir(rootDir, { recursive: true });

  const memoriesDir = config.memoriesDir ?? join(rootDir, 'memories');
  await mkdir(memoriesDir, { recursive: true });

  const bus = new TypedEventBus<KyberEvents>();

  const memory = new MemoryStore({
    sessionFile: join(rootDir, `${config.agentId}.session.json`),
    memoriesDir,
    flushTrigger: { tokenThreshold: 1000, toolCallThreshold: 10, debounceMs: 100 },
    eventBus: bus,
  });
  await memory.init();

  const checkpoint = new CheckpointManager(
    new JsonCheckpointProvider(join(rootDir, 'checkpoints')),
    bus,
  );

  const exceptionHandler = new ExceptionHandler(bus);
  const verification = new VerificationPipeline(bus, config.agentId);

  return { reliability: { memory, checkpoint, exceptionHandler, verification }, cleanup, rootDir };
}

// ─── AgentSession class ──────────────────────────────────────────────────────

/**
 * AgentSession — L3 Session layer.
 *
 * Provides the unified "session contract" that all consumers (TUI, scripts, SDK)
 * use to interact with the agent. Owns:
 *   - The agent instance (stateful, accumulates multi-turn messages)
 *   - The ReliabilityLayer (memory / checkpoint / exception / verification)
 *   - The fully-wired AgentLoopDeps (model, tools, sandbox, pipeline, workspace)
 *
 * Use `runtime.createSession(opts)` — not the constructor directly — unless writing
 * unit tests that need to inject mock deps.
 *
 * Future Sprint hooks (Sprint 4 MemoryTrigger, Sprint 5 Hooks) are intended to be
 * added here without changing the `send()` / `close()` public contract.
 */
export class AgentSession {
  readonly id: string;
  readonly agent: DefaultAgentInstance;

  private readonly deps: AgentLoopDeps;
  private readonly reliability: ReliabilityLayer;
  private readonly cleanup?: () => Promise<void>;
  private readonly trajectory?: TrajectoryRecorder;
  private readonly skillRunner?: SkillSuggestionRunner;
  private readonly learningLoop?: LearningLoopMiddleware;

  private turnToolLog: Array<{ name: string; input: unknown }> = [];
  private lastUserText = '';

  /** Cumulative usage tracked from usage events yielded by agentLoop. */
  private _cumulative: CumulativeUsage = {
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCacheCreationTokens: 0,
    totalCacheReadTokens: 0,
    turnCount: 0,
  };

  /** Turn counter for command-only turns (not tracked by agentLoop). */
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: used via prefix-increment expression
  private _cmdTurnCount = 0;

  constructor(
    id: string,
    agent: DefaultAgentInstance,
    deps: AgentLoopDeps,
    reliability: ReliabilityLayer,
    cleanup?: () => Promise<void>,
    trajectory?: TrajectoryRecorder,
    extras?: { skillSuggestion?: SkillSuggestionRunner; learningLoop?: LearningLoopMiddleware },
  ) {
    this.id = id;
    this.agent = agent;
    this.deps = deps;
    this.reliability = reliability;
    this.cleanup = cleanup;
    this.trajectory = trajectory;
    this.skillRunner = extras?.skillSuggestion;
    this.learningLoop = extras?.learningLoop;
  }

  /** Returns a snapshot of the current cumulative usage. */
  getCumulative(): CumulativeUsage {
    return { ...this._cumulative };
  }

  /**
   * Send a user input and iterate over the resulting AgentEvents.
   *
   * Slash commands (e.g. /help, /cost) are intercepted at the session layer
   * before the user message is added to agent history. This keeps the LLM
   * conversation context clean — commands are never visible to the model.
   *
   * Natural language turns go through the full agentLoop. The agent instance
   * accumulates messages across calls, enabling multi-turn conversation.
   * Between turns the agent status is reset from 'completed' back to 'running'.
   */
  async *send(
    input: string,
    opts?: { signal?: AbortSignal },
  ): AsyncGenerator<AgentEvent> {
    if (opts?.signal?.aborted) return;

    // Command interception — intercept before addMessage so agent history stays clean.
    const cmdRegistry = this.deps.commandRegistry;
    if (cmdRegistry?.isCommand(input)) {
      const result = await cmdRegistry.execute(input, {
        cumulative: { ...this._cumulative },
        cwd: process.cwd(),
        assets: this.deps.workspace?.assets?.getManifest?.() ?? undefined,
        agentId: this.agent.id,
      });
      yield { type: 'text_delta', text: result.output };
      if (result.followUpWithAgent?.userText) {
        this.agent.addMessage('user', result.followUpWithAgent.userText);
        if (this.agent.status === 'completed' || this.agent.status === 'completing') {
          this.agent.status = 'running';
        }
        for await (const event of agentLoop(this.deps)) {
          if (opts?.signal?.aborted) break;
          if (event.type === 'usage') {
            this._cumulative = { ...event.cumulative };
          }
          yield event;
        }
        return;
      }
      yield {
        type: 'turn_complete',
        turnNumber: ++this._cmdTurnCount,
        stopReason: 'end_turn',
        content: [],
      };
      return;
    }

    // Natural language path — add to agent history and run the loop.
    this.lastUserText = input;
    this.turnToolLog = [];
    this.agent.addMessage('user', input);

    // Multi-turn reset: agentLoop exits after each verified turn leaving status
    // as 'completed' (terminal). Reset to 'running' for the next send().
    if (this.agent.status === 'completed' || this.agent.status === 'completing') {
      this.agent.status = 'running';
    }

    let turnId: string | undefined;
    let interrupted = false;
    const tokenBaseline = {
      input: this._cumulative.totalInputTokens,
      output: this._cumulative.totalOutputTokens,
    };

    // Sprint 3.5 §5 — accumulate plan state + token snapshots so the
    // TurnSummaryBuilder can compute per-task deltas without reading history.
    const summaryBuilder = new TurnSummaryBuilder(this.trajectory?.getDb?.());
    const taskTokenStart = new Map<
      string,
      { input: number; output: number }
    >();
    let latestPlanSteps: readonly TaskPlanStep[] | undefined;

    try {
      if (this.trajectory) {
        turnId = randomUUID();
        this.trajectory.beginNaturalTurn(turnId, input);
        this.deps.eventBus?.emit('user.turn_sent', {
          agentId: this.agent.id,
          turnId,
          userTextLen: input.length,
        });
      }

      for await (const event of agentLoop(this.deps)) {
        if (opts?.signal?.aborted) interrupted = true;
        this.trajectory?.onEvent(turnId, event);

        if (event.type === 'tool_use_complete') {
          this.turnToolLog.push({ name: event.toolName, input: event.input });
        }

        if (event.type === 'task_plan') {
          latestPlanSteps = event.steps;
          if (event.taskId && !taskTokenStart.has(event.taskId)) {
            taskTokenStart.set(event.taskId, {
              input: this._cumulative.totalInputTokens,
              output: this._cumulative.totalOutputTokens,
            });
          }
        }
        if (event.type === 'usage') {
          this._cumulative = { ...event.cumulative };
        }

        yield event;

        if (event.type === 'task_complete') {
          const start = taskTokenStart.get(event.taskId);
          // 3.0 P0.5: prefer LearningLoop (changelog + skill) over bare SkillSuggestionRunner
          if (this.learningLoop) {
            this.learningLoop.schedule(event, this.turnToolLog, this.lastUserText);
          } else {
            this.skillRunner?.schedule(event, this.turnToolLog, this.lastUserText);
          }
          let taskAssets: AssetRecord[] = [];
          try {
            if (this.deps.eventBus) {
              taskAssets = await this.gatherTaskAssets(this.deps.eventBus, opts?.signal, 2000);
            }
          } catch {
            // best-effort asset gather
          }
          try {
            const summary = summaryBuilder.build({
              task: event,
              trajectoryTurnId: turnId,
              planSteps: latestPlanSteps,
              assets: taskAssets,
              tokensInputAtStart: start?.input,
              tokensOutputAtStart: start?.output,
              tokensInputAtEnd: this._cumulative.totalInputTokens,
              tokensOutputAtEnd: this._cumulative.totalOutputTokens,
            });
            const summaryEvent: AgentEvent = { type: 'turn_summary', summary };
            this.trajectory?.onEvent(turnId, summaryEvent);
            yield summaryEvent;
          } catch {
            // builder failures must not interrupt the agent stream
          }
          taskTokenStart.delete(event.taskId);
        }
      }
    } finally {
      if (turnId && this.trajectory) {
        this.trajectory.finalizeTurn(turnId, {
          interrupted,
        });
        const db = this.trajectory.getDb?.();
        const totals = db?.getTurnTokenTotals(turnId);
        const deltaIn = this._cumulative.totalInputTokens - tokenBaseline.input;
        const deltaOut = this._cumulative.totalOutputTokens - tokenBaseline.output;
        if (
          totals &&
          (totals.in_tokens > 0 || totals.out_tokens > 0) &&
          deltaIn === 0 &&
          deltaOut === 0
        ) {
          const newCumulative: CumulativeUsage = {
            ...this._cumulative,
            totalInputTokens: tokenBaseline.input + totals.in_tokens,
            totalOutputTokens: tokenBaseline.output + totals.out_tokens,
          };
          this._cumulative = newCumulative;
          yield {
            type: 'usage',
            usage: {
              inputTokens: totals.in_tokens,
              outputTokens: totals.out_tokens,
            },
            cumulative: newCumulative,
          };
        }
      }
    }
  }

  /**
   * Best-effort wait for post-task asset signals (memory extract, skill draft, permit) up to `timeoutMs`.
   */
  private async gatherTaskAssets(
    bus: TypedEventBus<KyberEvents>,
    signal: AbortSignal | undefined,
    timeoutMs: number,
  ): Promise<AssetRecord[]> {
    const assets: AssetRecord[] = [];
    const disposables: Array<{ dispose: () => void }> = [];
    return new Promise<AssetRecord[]>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        for (const d of disposables) d.dispose();
        if (signal) signal.removeEventListener('abort', onAbort);
        resolve(assets);
      };
      const onAbort = () => {
        finish();
      };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      const timer = setTimeout(finish, timeoutMs);
      disposables.push(
        bus.on('memory.extracted', (p) => {
          assets.push({
            type: 'memory',
            title: `${p.tier} +${p.entryCount} 条`,
            revertible: false,
            suggested: false,
          });
        }),
      );
      disposables.push(
        bus.on('memory.written', (p) => {
          if (p.source && p.source !== 'auto') return;
          if (!p.title) return;
          assets.push({
            type: 'memory',
            title: p.title,
            sourcePath: p.path,
            revertible: true,
            suggested: false,
          });
        }),
      );
      disposables.push(
        bus.on('skill.suggested', (p) => {
          assets.push({
            type: 'skill',
            title: p.draft.title,
            sourcePath: undefined,
            revertible: false,
            suggested: true,
          });
        }),
      );
      disposables.push(
        bus.on('permit.persistent_recorded', (p) => {
          assets.push({
            type: 'permit',
            title: `${p.toolName} [${p.maxLevel}]`,
            revertible: false,
            suggested: false,
          });
        }),
      );
    });
  }

  /**
   * Flush session memory and release resources (SQLite connection, temp dir).
   * Should be called when the session is no longer needed.
   */
  async close(): Promise<void> {
    try {
      await this.reliability.memory.flush();
    } catch {
      // best-effort flush — don't throw on close
    }
    this.reliability.memory.close();
    this.trajectory?.close();
    await this.cleanup?.();
  }
}
