import { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';
import type { MCPToolRegistry, ToolIntegrationFacade } from '../types/tool.js';
import type { ModelProvider } from '../types/model.js';
import { PermissionSandbox } from '../permission/PermissionSandbox.js';
import type { KyberConfig, MCPServerConfig } from '../types/config.js';
import { loadConfig } from '../config/ConfigLoader.js';
import { DefaultShellExecutor } from '../tools/shell/ShellExecutor.js';
import { DefaultMCPToolRegistry } from '../tools/mcp/MCPToolRegistry.js';
import { DefaultSkillRegistry } from '../tools/skills/SkillRegistry.js';
import { DefaultToolIntegrationFacade } from '../tools/facade/ToolIntegrationFacade.js';
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
import { ensureWorkspaceSeed, resolveWorkspacePaths } from './WorkspaceBootstrap.js';
import { mkdir } from 'fs/promises';
import { randomUUID } from 'crypto';
import { AgentSession, buildReliability } from './AgentSession.js';
import type { CreateSessionOptions } from './AgentSession.js';

export class KyberRuntime {
  private bus!: TypedEventBus<KyberEvents>;
  private tools!: ToolIntegrationFacade;
  private model!: ModelProvider;
  private sandbox!: PermissionSandbox;
  private config!: KyberConfig;
  private workspaceRegistry!: WorkspaceRegistry;
  private activeWorkspaceId: string = 'default';


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

    this.tools = new DefaultToolIntegrationFacade(shell, mcp as unknown as MCPToolRegistry, skills);

    // 6. Init Workspaces
    const pathInfo = resolveWorkspacePaths({
      cwd: process.cwd(),
      userName: process.env.KYBER_USER_NAME ?? 'default',
      workspaceId: process.env.KYBER_WORKSPACE_ID ?? 'default',
      spacesRoot: process.env.KYBER_SPACES_ROOT,
    });
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

    // 7. Ready
    console.log(`[KyberKit] Runtime bootstrapped. Loaded ${this.tools.listAll().length} total tools.`);
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

  /** Returns the CommandRegistry for the given workspace (or active). Used by TUI autocomplete. */
  getCommandRegistry(workspaceId?: string): import('../commands/CommandRegistry.js').CommandRegistry | undefined {
    try {
      return this.workspaceRegistry.get(workspaceId ?? this.activeWorkspaceId)?.commandRegistry;
    } catch {
      return undefined;
    }
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
      .use(new ContentAccumulatorMiddleware());
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

    if (opts.reliability && typeof opts.reliability === 'object') {
      reliability = opts.reliability as ReliabilityLayer;
    } else {
      const mode = (opts.reliability as string | undefined) ??
        (process.env.KYBER_RELIABILITY === 'inmemory' ? 'inmemory' : 'real');
      const rootDir = join(process.cwd(), '.kyberkit', 'runtime');
      const result = await buildReliability(
        mode === 'inmemory' ? 'inmemory' : 'real',
        { rootDir, agentId: sessionId },
      );
      reliability = result.reliability;
      cleanup = result.cleanup;
    }

    const pipeline = opts.middleware ?? this.createMiddlewarePipeline();
    const deps = this.createAgentLoopDeps(agent, reliability, pipeline);

    return new AgentSession(sessionId, agent, deps, reliability, cleanup);
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
    
    return {
      agent,
      model: this.model,
      tools: this.tools,
      sandbox: this.sandbox,
      pipeline: pipeline ?? this.createMiddlewarePipeline(),
      reliability,
      promptAssembler: workspace.promptAssembler,
      commandRegistry: workspace.commandRegistry,
      workspace: workspace,
    };

  }
}

