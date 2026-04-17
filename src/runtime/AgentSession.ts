import { join } from 'path';
import { tmpdir } from 'os';
import { mkdir, rm } from 'fs/promises';
import { randomUUID } from 'crypto';

import type { DefaultAgentInstance } from '../agent/AgentInstance.js';
import { agentLoop } from '../agent/AgentLoop.js';
import type { ReliabilityLayer, AgentLoopDeps } from '../agent/AgentLoop.js';
import type { AgentEvent, CumulativeUsage } from '../types/agent-events.js';
import { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';
import { MemoryStore } from '../memory/MemoryStore.js';
import { JsonCheckpointProvider } from '../checkpoint/JsonCheckpointProvider.js';
import { CheckpointManager } from '../checkpoint/CheckpointManager.js';
import { ExceptionHandler } from '../exception/ExceptionHandler.js';
import { VerificationPipeline } from '../validation/VerificationPipeline.js';
import type { MiddlewarePipeline } from '../agent/StreamMiddleware.js';

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
}

export interface ReliabilityBuildConfig {
  /** Base directory for runtime data files. */
  rootDir: string;
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
 * Both modes use the same implementations (MemoryStore/SQLite, JsonCheckpointProvider,
 * ExceptionHandler, VerificationPipeline) — the only difference is where files live.
 */
export async function buildReliability(
  mode: 'real' | 'inmemory',
  config: ReliabilityBuildConfig,
): Promise<{ reliability: ReliabilityLayer; cleanup?: () => Promise<void> }> {
  let rootDir = config.rootDir;
  let cleanup: (() => Promise<void>) | undefined;

  if (mode === 'inmemory') {
    rootDir = join(tmpdir(), `kyber-inmem-${randomUUID()}`);
    cleanup = async () => {
      await rm(rootDir, { recursive: true, force: true });
    };
  }

  await mkdir(rootDir, { recursive: true });

  const bus = new TypedEventBus<KyberEvents>();

  const memory = new MemoryStore({
    sessionFile: join(rootDir, `${config.agentId}.session.json`),
    dbFile: join(rootDir, `${config.agentId}.sqlite`),
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

  return { reliability: { memory, checkpoint, exceptionHandler, verification }, cleanup };
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
  ) {
    this.id = id;
    this.agent = agent;
    this.deps = deps;
    this.reliability = reliability;
    this.cleanup = cleanup;
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
      });
      yield { type: 'text_delta', text: result.output };
      yield {
        type: 'turn_complete',
        turnNumber: ++this._cmdTurnCount,
        stopReason: 'end_turn',
        content: [],
      };
      return;
    }

    // Natural language path — add to agent history and run the loop.
    this.agent.addMessage('user', input);

    // Multi-turn reset: agentLoop exits after each verified turn leaving status
    // as 'completed' (terminal). Reset to 'running' for the next send().
    if (this.agent.status === 'completed' || this.agent.status === 'completing') {
      this.agent.status = 'running';
    }

    for await (const event of agentLoop(this.deps)) {
      if (opts?.signal?.aborted) break;
      // Track cumulative usage for /cost command context
      if (event.type === 'usage') {
        this._cumulative = { ...event.cumulative };
      }
      yield event;
    }
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
    await this.cleanup?.();
  }
}
