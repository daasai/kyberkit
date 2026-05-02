import { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';
import type { MCPToolRegistry, ToolIntegrationFacade } from '../types/tool.js';
import { ToolRuleChecker } from '../tools/ToolRuleChecker.js';
import type { ModelProvider } from '../types/model.js';
import { PermissionSandbox } from '../permission/PermissionSandbox.js';
import type { KyberConfig, MCPServerConfig } from '../types/config.js';
import { loadConfig } from '../config/ConfigLoader.js';
import { DefaultShellExecutor } from '../tools/shell/ShellExecutor.js';
import { DefaultMCPToolRegistry } from '../tools/mcp/MCPToolRegistry.js';
import { DefaultSkillRegistry } from '../tools/skills/SkillRegistry.js';
import { DefaultToolIntegrationFacade } from '../tools/facade/ToolIntegrationFacade.js';
import { createBuiltinTools } from '../tools/builtin/createBuiltinTools.js';
import { BuiltinToolRegistry } from '../tools/builtin/BuiltinToolRegistry.js';
import { SkillInvokeCommand } from '../commands/builtin/SkillInvokeCommand.js';
import { DecomposeCommand } from '../commands/builtin/DecomposeCommand.js';
import { CapabilityDecomposer } from '../learning/CapabilityDecomposer.js';
import { ContractDraftStore } from '../learning/ContractDraftStore.js';
import { AnthropicProvider } from '../model/AnthropicProvider.js';
import { DefaultAgentInstance } from '../agent/AgentInstance.js';
import { ConfigError } from '../types/errors.js';
import type { PermissionTag } from '../types/permission.js';
import { MiddlewarePipeline } from '../agent/StreamMiddleware.js';
import { TokenCounterMiddleware } from '../agent/middleware/TokenCounterMiddleware.js';
import { ContentAccumulatorMiddleware } from '../agent/middleware/ContentAccumulatorMiddleware.js';
import type { AgentLoopDeps, ReliabilityLayer } from '../agent/AgentLoop.js';
import { WorkspaceRegistry } from './WorkspaceRegistry.js';
import type { WorkspaceInstance } from './WorkspaceInstance.js';
import { join } from 'path';
import { SkillSuggestionRunner } from '../skills/SkillSuggestionRunner.js';
import { WorkspaceGrowthStore } from '../observability/WorkspaceGrowthStore.js';
import { ensureWorkspaceSeed, resolveWorkspacePaths } from './WorkspaceBootstrap.js';
import { mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';
import { AgentSession, buildReliability } from './AgentSession.js';
import { TrajectoryRecorder } from '../observability/TrajectoryRecorder.js';
import type { CreateSessionOptions } from './AgentSession.js';
import { ContextCompressor } from '../compression/ContextCompressor.js';
import { CompactionGuardMiddleware } from '../agent/middleware/CompactionGuardMiddleware.js';
import { MemoryTriggerMiddleware } from '../agent/middleware/MemoryTriggerMiddleware.js';
import { NarratorMiddleware } from '../agent/middleware/NarratorMiddleware.js';
import { SessionMemoryExtractor } from '../memory/extractors/SessionMemoryExtractor.js';
import { LongTermMemoryExtractor } from '../memory/extractors/LongTermMemoryExtractor.js';
import type { CanAuthorizeBatchFn, CanUseToolFn } from '../permission/ToolPermissionGate.js';
import { PermitStore } from '../permission/PermitStore.js';
import { createDefaultAdHocContract, type PolicyPack } from '../permission/TaskPermissionContract.js';
import { OutputGuardChecker, OutputGuardMiddleware } from '../agent/middleware/OutputGuardMiddleware.js';
import { LearningLoopMiddleware } from '../learning/LearningLoopMiddleware.js';
import { EvolutionChangelog } from '../learning/EvolutionChangelog.js';
import { ContractRegistry } from '../scheduler/ContractRegistry.js';
import { DriftDetector } from '../scheduler/DriftDetector.js';
import { RecurringScheduler } from '../scheduler/RecurringScheduler.js';
import { TriggeredScheduler } from '../scheduler/TriggeredScheduler.js';
import { ContractCommand } from '../commands/builtin/ContractCommand.js';

export class KyberRuntime {
  private bus!: TypedEventBus<KyberEvents>;
  private tools!: ToolIntegrationFacade;
  private model!: ModelProvider;
  private sandbox!: PermissionSandbox;
  private config!: KyberConfig;
  private workspaceRegistry!: WorkspaceRegistry;
  private activeWorkspaceId: string = 'default';
  private workspaceGrowth: WorkspaceGrowthStore | null = null;
  private actorUserId: string = 'default';
  private policyPack: PolicyPack = 'development';
  /** Shared, stateless injection checker reused across sessions. */
  private outputGuardChecker!: OutputGuardChecker;

  /** Mutable reference shared by all `AgentLoopDeps` from this runtime (TUI tool prompts). */
  private readonly toolPermissionOutlet: {
    canUseTool?: CanUseToolFn;
    canAuthorizeBatch?: CanAuthorizeBatchFn;
  } = {};

  /** Sprint 3.5 §4.2 — runtime-scoped grant store shared across sessions. */
  private permitStore!: PermitStore;

  /** 3.0 P1 — contract lifecycle registry and schedulers. */
  private contractRegistry!: ContractRegistry;
  private recurringScheduler!: RecurringScheduler;
  private triggeredScheduler!: TriggeredScheduler;
  private driftDetector!: DriftDetector;


  /**
   * Bootstraps the KyberKit runtime environment.
   * Configuration is read from environment variables (via .env file).
   * Bun automatically loads .env before executing scripts.
   */
  async bootstrap(): Promise<void> {
    // 1. Load config from environment variables
    this.config = await loadConfig();

    // 2. Init event bus
    this.bus = new TypedEventBus<KyberEvents>();
    this.permitStore = new PermitStore({
      onPersistentChanged: (g) => {
        this.bus.emit('permit.persistent_recorded', {
          toolName: g.toolName,
          maxLevel: g.maxLevel,
        });
        this.workspaceGrowth?.record('permit', 1);
      },
    });

    // 3. Build permission sandbox
    this.sandbox = new PermissionSandbox({
      allowed: new Set(this.config.permissions.allowed as PermissionTag[]),
      denied: new Set(this.config.permissions.denied as PermissionTag[]),
      allowedPaths: this.config.permissions.allowedPaths,
      allowedDomains: this.config.permissions.allowedDomains,
    });

    // 4. Init Model Provider
    if (this.config.model.provider === 'anthropic') {
      if (!this.config.model.apiKey) {
        throw new ConfigError('Anthropic API key is required but not found in config or env vars.');
      }
      this.model = new AnthropicProvider({ 
        apiKey: this.config.model.apiKey, 
        baseUrl: this.config.model.baseUrl 
      });
    } else {
      throw new ConfigError(`Unknown model provider: ${this.config.model.provider}`);
    }

    // 5. Init Tool Integration Layer
    const shell = new DefaultShellExecutor();
    const mcp = new DefaultMCPToolRegistry();
    const skills = new DefaultSkillRegistry(this.config.skills.paths);

    // 5a: Load Skills
    await skills.scan();
    
    // 5b: Load MCP Servers
    if (this.config.mcp?.servers) {
      for (const serverConfig of this.config.mcp.servers) {
        try {
          // MCP setup can be deferred or handled lazily. 
          // For early Phase 0 testing without valid servers, we catch errors here.
          await mcp.connect(serverConfig as MCPServerConfig);
          this.bus.emit('mcp.connected', { serverName: serverConfig.name });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(`[KyberRuntime] Failed to connect MCP server ${serverConfig.name}:`, message);
        }
      }
    }

    const builtins = new BuiltinToolRegistry(createBuiltinTools(shell, this.sandbox));
    this.tools = new DefaultToolIntegrationFacade(shell, mcp as unknown as MCPToolRegistry, skills, builtins);

    // 6. Init Workspaces
    const pathInfo = resolveWorkspacePaths({
      cwd: process.cwd(),
      userName: process.env.KYBER_USER_NAME ?? 'default',
      workspaceId: process.env.KYBER_WORKSPACE_ID ?? 'default',
      spacesRoot: process.env.KYBER_SPACES_ROOT,
    });
    this.actorUserId = pathInfo.userName;
    const envPolicyPack = process.env.KYBER_POLICY_PACK;
    if (envPolicyPack === 'development' || envPolicyPack === 'balanced' || envPolicyPack === 'conservative') {
      this.policyPack = envPolicyPack;
    }
    await ensureWorkspaceSeed({
      userRoot: pathInfo.userRoot,
      projectKKPath: join(process.cwd(), 'KK.md'),
    });
    await mkdir(pathInfo.workspaceRoot, { recursive: true });

    this.workspaceRegistry = new WorkspaceRegistry();
    await this.workspaceRegistry.createWorkspace({
      workspaceId: pathInfo.workspaceId,
      name: 'Default Workspace',
      assetPaths: {
        user: pathInfo.userRoot,
        workspace: pathInfo.workspaceRoot,
        project: pathInfo.projectRoot,
      }
    });
    this.activeWorkspaceId = pathInfo.workspaceId;

    // Track B — cross-session growth counters + durable permits
    const kRoot = join(pathInfo.userRoot, '.kyberkit');
    const growthPath = join(kRoot, 'growth.sqlite');
    await WorkspaceGrowthStore.ensurePath(growthPath);
    this.workspaceGrowth = new WorkspaceGrowthStore(growthPath);
    this.permitStore.setPersistencePath(join(kRoot, 'permit.yaml'));
    this.permitStore.loadFromDisk();

    this.bus.on('memory.written', (p) => {
      if (p.source === 'auto') this.workspaceGrowth?.record('memory', 1);
    });
    this.bus.on('skill.adopted', () => {
      this.workspaceGrowth?.record('skill', 1);
    });

    // Sprint 3.5 §4.3 — make the runtime-scoped PermitStore visible to /permit.
    this.getActiveWorkspace().attachPermitStore(() => this.permitStore);

    for (const meta of this.tools.listSkillMetas?.() ?? []) {
      this.getActiveWorkspace().commandRegistry.register(
        new SkillInvokeCommand(meta.name, meta.description, meta.body),
      );
    }

    // 3.0 P0.5 — /decompose command: LLM-powered capability decomposition
    const draftStore = new ContractDraftStore(join(kRoot, 'contract-drafts'));
    const decomposer = new CapabilityDecomposer({
      model: this.model,
      compactModel: this.config.model.compactModel ?? this.config.model.name,
      fallbackModel: this.config.model.name,
      store: draftStore,
      eventBus: this.bus,
    });
    this.getActiveWorkspace().commandRegistry.register(
      new DecomposeCommand({
        decomposer,
        getContext: () => ({
          actorUserId: this.actorUserId,
          policyPack: this.policyPack,
        }),
        getSkills: () => this.tools.listSkillMetas?.() ?? [],
        draftsDir: join(kRoot, 'contract-drafts'),
      }),
    );

    // 3.0 P1 — contract registry + schedulers
    this.driftDetector = new DriftDetector();
    this.contractRegistry = new ContractRegistry({
      registryPath: join(kRoot, 'contracts', 'registry.json'),
      eventBus: this.bus,
    });
    await this.contractRegistry.load();

    this.recurringScheduler = new RecurringScheduler({
      registry: this.contractRegistry,
      driftDetector: this.driftDetector,
      eventBus: this.bus,
    });
    this.triggeredScheduler = new TriggeredScheduler({
      registry: this.contractRegistry,
      eventBus: this.bus,
    });
    this.recurringScheduler.start();
    this.triggeredScheduler.start();

    this.getActiveWorkspace().commandRegistry.register(
      new ContractCommand({
        registry: this.contractRegistry,
        draftStore,
      }),
    );

    // 7. Ready
    this.outputGuardChecker = new OutputGuardChecker();
    console.log(
      `[KyberKit] Runtime bootstrapped. Loaded ${this.tools.listAll().length} model tools; ${this.tools.listSkillMetas?.().length ?? 0} skills.`,
    );
  }

  /** Gets the active workspace instance. */
  getActiveWorkspace(): WorkspaceInstance {
    const ws = this.workspaceRegistry.get(this.activeWorkspaceId);
    if (!ws) throw new ConfigError(`Active workspace ${this.activeWorkspaceId} not found.`);
    return ws;
  }


  /** Gets the global config. */
  getConfig(): KyberConfig { return this.config; }

  /** Gets the centralized tool facade. */
  getTools(): ToolIntegrationFacade { return this.tools; }

  /** Gets the model provider interface. */
  getModel(): ModelProvider { return this.model; }

  /** Gets the root permission sandbox. */
  getSandbox(): PermissionSandbox { return this.sandbox; }

  /** Gets the event bus (named accessor for TUI consumers, D5 contract). */
  getBus(): TypedEventBus<KyberEvents> { return this.bus; }

  /** Alias for getBus() — preferred by TUI useSession hook (D5). */
  get eventBus(): TypedEventBus<KyberEvents> { return this.bus; }

  /**
   * Registers an interactive tool permission handler (e.g. Ink Y/N).
   * Pass `undefined` to clear. Wired into each session's `AgentLoopDeps.toolPermission`.
   */
  setToolPermissionHandler(handler?: CanUseToolFn): void {
    this.toolPermissionOutlet.canUseTool = handler;
  }

  /** Sprint 3.5 §4.2 — batch authorization handler (TUI card). */
  setBatchAuthHandler(handler?: CanAuthorizeBatchFn): void {
    this.toolPermissionOutlet.canAuthorizeBatch = handler;
  }

  /** Exposed for /permit command and IdentityBand. */
  getPermitStore(): PermitStore {
    return this.permitStore;
  }

  /** Last 7 days of asset growth (memories / skills / permits) for the workspace user root. */
  getAssetGrowth7d(): { memories: number; skills: number; permits: number } {
    if (!this.workspaceGrowth) {
      return { memories: 0, skills: 0, permits: 0 };
    }
    return this.workspaceGrowth.aggregateSince(Date.now() - 7 * 24 * 60 * 60 * 1000);
  }

  /** Returns the CommandRegistry for the given workspace (or active). Used by TUI autocomplete. */
  getCommandRegistry(workspaceId?: string): import('../commands/CommandRegistry.js').CommandRegistry | undefined {
    try {
      return this.workspaceRegistry.get(workspaceId ?? this.activeWorkspaceId)?.commandRegistry;
    } catch {
      return undefined;
    }
  }

  /** 3.0 P1 — contract lifecycle registry (activated/pause/revoke). */
  getContractRegistry(): ContractRegistry { return this.contractRegistry; }

  /** 3.0 P1 — drift detector (record run outcomes for contracts). */
  getDriftDetector(): DriftDetector { return this.driftDetector; }

  /**
   * Graceful shutdown: stops schedulers and flushes pending state.
   * Call this before process exit in production.
   */
  async shutdown(): Promise<void> {
    this.recurringScheduler?.stop();
    this.triggeredScheduler?.stop();
    await this.contractRegistry?.save().catch(() => undefined);
  }

  /**
   * Creates a new AgentInstance ready to be run loop.
   */
  createAgent(agentId: string = crypto.randomUUID()): DefaultAgentInstance {
    return new DefaultAgentInstance(agentId, {
      name: this.config.agent?.name ?? 'default-agent',
      model: this.config.model.name,
      systemPrompt: this.config.agent?.systemPrompt,
      initialContext: []
    }, this.bus);
  }

  /**
   * Creates the default middleware pipeline for streaming agent loop.
   * Override this method to customize the middleware stack.
   */
  createMiddlewarePipeline(): MiddlewarePipeline {
    return new MiddlewarePipeline()
      .use(new TokenCounterMiddleware())
      .use(new ContentAccumulatorMiddleware())
      .use(new NarratorMiddleware());
  }

  /**
   * Creates a fully-initialised AgentSession — the primary application-level entry point.
   *
   * Internally:
   *   1. Creates a new DefaultAgentInstance and transitions it to 'running'.
   *   2. Builds (or reuses) a ReliabilityLayer based on opts.reliability or
   *      the KYBER_RELIABILITY env var (default: 'real').
   *   3. Assembles AgentLoopDeps via createAgentLoopDeps().
   *
   * Usage:
   *   const session = await runtime.createSession();
   *   for await (const ev of session.send('hello')) { ... }
   *   await session.close();
   */
  async createSession(opts: CreateSessionOptions = {}): Promise<AgentSession> {
    const sessionId = opts.agentId ?? randomUUID();
    const agent = this.createAgent(sessionId);
    agent.transition('start');
    agent.transition('ready');

    let reliability: ReliabilityLayer;
    let cleanup: (() => Promise<void>) | undefined;
    let runtimeRootDir = join(process.cwd(), '.kyberkit', 'runtime');

    if (opts.reliability && typeof opts.reliability === 'object') {
      reliability = opts.reliability as ReliabilityLayer;
    } else {
      const mode = (opts.reliability as string | undefined) ??
        (process.env.KYBER_RELIABILITY === 'inmemory' ? 'inmemory' : 'real');
      const rootDir = join(process.cwd(), '.kyberkit', 'runtime');
      // Sprint 3.5 §2.3 — durable memories write to the workspace user root so that
      // AssetRegistry / PromptAssembler / future `/assets` surface them consistently.
      // `inmemory` mode intentionally omits this and uses the temp root for isolation.
      const activeWorkspace = this.getActiveWorkspace();
      const memoriesDir =
        mode === 'inmemory'
          ? undefined
          : join(activeWorkspace.config.assetPaths.user, 'memories');
      const result = await buildReliability(
        mode === 'inmemory' ? 'inmemory' : 'real',
        { rootDir, agentId: sessionId, memoriesDir },
      );
      reliability = result.reliability;
      cleanup = result.cleanup;
      runtimeRootDir = result.rootDir;
    }

    const pipeline = opts.middleware ?? this.createMiddlewarePipeline();
    this.getActiveWorkspace().attachLongTermMemory(() => {
      const mem = reliability.memory as any;
      return typeof mem?.getLongTermMemory === 'function' ? mem.getLongTermMemory() : undefined;
    });
    const deps = this.createAgentLoopDeps(agent, reliability, pipeline);

    const trajEnabled = this.config.telemetry.trajectory.enabled !== false;
    const trajectory =
      trajEnabled
        ? new TrajectoryRecorder(join(runtimeRootDir, `${sessionId}.trajectory.sqlite`), {
            includeContent: this.config.telemetry.trajectory.includeContent !== false,
            agentId: sessionId,
          })
        : undefined;

    const userRoot = this.getActiveWorkspace().config.assetPaths.user;
    const skillRunner = new SkillSuggestionRunner({
      model: this.model,
      compactModel: this.config.model.compactModel ?? this.config.model.name,
      fallbackModel: this.config.model.name,
      eventBus: this.bus,
      skillsDir: join(userRoot, 'skills'),
    });

    const learningLoop = new LearningLoopMiddleware({
      changelog: new EvolutionChangelog(join(userRoot, '.kyberkit', 'evolution-changelog.md')),
      eventBus: this.bus,
      skillRunner,
    });

    return new AgentSession(sessionId, agent, deps, reliability, cleanup, trajectory, {
      skillSuggestion: opts.skillSuggestion ?? skillRunner,
      learningLoop,
    });
  }

  /**
   * Creates a complete AgentLoopDeps bundle for running an agent with agentLoop().
   */
  createAgentLoopDeps(
    agent: DefaultAgentInstance,
    reliability: ReliabilityLayer,
    pipeline?: MiddlewarePipeline,
  ): AgentLoopDeps {
    const workspace = this.getActiveWorkspace();
    const hasSessionMemory =
      reliability.memory && typeof (reliability.memory as any).getSessionMemory === 'function';
    const sessionMemoryInstance = hasSessionMemory
      ? (reliability.memory as any).getSessionMemory()
      : null;

    const compactionGuard = sessionMemoryInstance
      ? new CompactionGuardMiddleware(
          new ContextCompressor({
            model: this.model,
            sessionMemory: sessionMemoryInstance,
            eventBus: this.bus,
            mainModelName: this.config.model.name,
            compactModelName: this.config.model.compactModel,
          }),
          {
            contextWindow: this.config.compaction.contextWindow,
            hardThreshold: this.config.compaction.hardThreshold,
            softThreshold: this.config.compaction.softThreshold,
            targetAfterCompact: this.config.compaction.targetAfterCompact,
          },
          {
            preferSessionMemory: this.config.compaction.preferSessionMemory,
            keepRecentRounds: this.config.compaction.keepRecentRounds,
            compactModel: this.config.model.compactModel,
          },
        )
      : undefined;

    const resolvedPipeline = pipeline ?? this.createMiddlewarePipeline();
    let memoryTrigger: MemoryTriggerMiddleware | undefined;
    if (sessionMemoryInstance) {
      const longTerm =
        typeof (reliability.memory as any).getLongTermMemory === 'function'
          ? (reliability.memory as any).getLongTermMemory()
          : undefined;
      const ltmExtractor = longTerm
        ? new LongTermMemoryExtractor({
            model: this.model,
            compactModel: this.config.model.compactModel,
            fallbackModel: this.config.model.name,
            longTerm,
            store: longTerm.getStore(),
          })
        : undefined;

      memoryTrigger = new MemoryTriggerMiddleware({
        sessionExtractor: new SessionMemoryExtractor({
          model: this.model,
          compactModel: this.config.model.compactModel,
          fallbackModel: this.config.model.name,
        }),
        sessionMemory: sessionMemoryInstance,
        ltmExtractor,
        eventBus: this.bus,
        config: {
          sessionTokenThreshold: this.config.memory.sessionTokenThreshold,
          sessionToolCallThreshold: this.config.memory.sessionToolCallThreshold,
          sessionTurnThreshold: this.config.memory.sessionTurnThreshold,
          ltmTurnCooldown: this.config.memory.ltmTurnCooldown,
          enabled: this.config.memory.enabled,
        },
      });
      resolvedPipeline.use(memoryTrigger);
    }

    // 3.0 P0.5 — output-side injection guard added to pipeline after tool results flow through
    resolvedPipeline.use(
      new OutputGuardMiddleware({
        checker: this.outputGuardChecker,
        eventBus: this.bus,
        agentId: agent.id,
        getTaskId: () => this.permitStore.getCurrentTaskId(),
      }),
    );

    return {
      agent,
      model: this.model,
      tools: this.tools,
      sandbox: this.sandbox,
      pipeline: resolvedPipeline,
      reliability,
      promptAssembler: workspace.promptAssembler,
      commandRegistry: workspace.commandRegistry,
      workspace: workspace,
      compactionGuard,
      memoryTrigger,
      turnTimeoutMs: this.config.agent.turnTimeoutMs,
      toolRuleChecker: new ToolRuleChecker(this.config.tools.deny),
      toolPermission: this.toolPermissionOutlet,
      permitStore: this.permitStore,
      eventBus: this.bus,
      permissionContractProvider: () =>
        createDefaultAdHocContract({
          taskId: this.permitStore.getCurrentTaskId() ?? `adhoc.${agent.id}`,
          actorUserId: this.actorUserId,
          agentSessionId: agent.id,
          policyPack: this.policyPack,
        }),
      outputGuardChecker: this.outputGuardChecker,
    };

  }
}

