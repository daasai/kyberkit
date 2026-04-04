import { TypedEventBus } from '../events/EventBus.js';
import { KyberEvents } from '../types/events.js';
import { ToolIntegrationFacade } from '../types/tool.js';
import { ModelProvider } from '../types/model.js';
import { PermissionSandbox } from '../permission/PermissionSandbox.js';
import { KyberConfig } from '../types/config.js';
import { loadConfig } from '../config/ConfigLoader.js';
import { DefaultShellExecutor } from '../tools/shell/ShellExecutor.js';
import { DefaultMCPToolRegistry } from '../tools/mcp/MCPToolRegistry.js';
import { DefaultSkillRegistry } from '../tools/skills/SkillRegistry.js';
import { DefaultToolIntegrationFacade } from '../tools/facade/ToolIntegrationFacade.js';
import { AnthropicProvider } from '../model/AnthropicProvider.js';
import { DefaultAgentInstance } from '../agent/AgentInstance.js';
import { ConfigError } from '../types/errors.js';
import { PermissionTag } from '../types/permission.js';

export class KyberRuntime {
  private bus!: TypedEventBus<KyberEvents>;
  private tools!: ToolIntegrationFacade;
  private model!: ModelProvider;
  private sandbox!: PermissionSandbox;
  private config!: KyberConfig;

  /**
   * Bootstraps the KyberKit runtime environment.
   */
  async bootstrap(configPath: string): Promise<void> {
    // 1. Load config
    this.config = await loadConfig(configPath);

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
          await mcp.connect(serverConfig as any);
          this.bus.emit('mcp.connected', { serverName: serverConfig.name });
        } catch (err: any) {
          console.warn(`[KyberRuntime] Failed to connect MCP server ${serverConfig.name}:`, err.message);
        }
      }
    }

    this.tools = new DefaultToolIntegrationFacade(shell, mcp as any, skills);

    // 6. Ready
    console.log(`[KyberKit] Runtime bootstrapped. Loaded ${this.tools.listAll().length} total tools.`);
  }

  /** Gets the global config. */
  getConfig(): KyberConfig { return this.config; }

  /** Gets the centralized tool facade. */
  getTools(): ToolIntegrationFacade { return this.tools; }

  /** Gets the model provider interface. */
  getModel(): ModelProvider { return this.model; }

  /** Gets the root permission sandbox. */
  getSandbox(): PermissionSandbox { return this.sandbox; }
  
  /** Gets the event bus. */
  getBus(): TypedEventBus<KyberEvents> { return this.bus; }

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
}
