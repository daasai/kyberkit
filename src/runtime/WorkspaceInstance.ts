import { WorkspaceConfig } from '../types/workspace.js';
import { ModelProvider } from '../types/model.js';
import { AssetRegistry, DefaultAssetRegistry } from '../assets/AssetRegistry.js';
import { PromptAssembler } from '../prompt/PromptAssembler.js';
import { CommandRegistry } from '../commands/CommandRegistry.js';

// Providers
import { IdentityProvider } from '../prompt/providers/IdentityProvider.js';
import { ToolSchemaProvider } from '../prompt/providers/ToolSchemaProvider.js';
import { UserDirectiveProvider } from '../prompt/providers/UserDirectiveProvider.js';
import { MemoryProvider } from '../prompt/providers/MemoryProvider.js';
import { EnvironmentProvider } from '../prompt/providers/EnvironmentProvider.js';

// Builtin Commands
import { HelpCommand } from '../commands/builtin/HelpCommand.js';
import { CostCommand } from '../commands/builtin/CostCommand.js';
import { MemoryCommand } from '../commands/builtin/MemoryCommand.js';
import { CompactCommand } from '../commands/builtin/CompactCommand.js';

/**
 * WorkspaceInstance — a complete runtime instance for a specific workspace.
 * Holds independent AssetRegistry, PromptAssembler, and CommandRegistry.
 *
 * Sprint 2, Step 6 Integration.
 */
export class WorkspaceInstance {
  readonly assets: AssetRegistry;
  readonly promptAssembler: PromptAssembler;
  readonly commandRegistry: CommandRegistry;

  constructor(
    readonly config: WorkspaceConfig
  ) {
    // 1. Initialize Asset Registry
    this.assets = new DefaultAssetRegistry();

    // 2. Initialize Prompt Assembler with standard providers
    this.promptAssembler = new PromptAssembler()
      .register(new IdentityProvider(config.identityPrompt || 'Professional AI Assistant'))
      .register(new ToolSchemaProvider())
      .register(new UserDirectiveProvider(() => this.assets.getMergedKKMd()))
      .register(new MemoryProvider())
      .register(new EnvironmentProvider());


    // 3. Initialize Command Registry with builtin commands
    this.commandRegistry = new CommandRegistry()
      .register(new HelpCommand(() => this.commandRegistry.list()))
      .register(new CostCommand())
      .register(new MemoryCommand(() => this.assets.getMemories()))
      .register(new CompactCommand());
  }

  /** Bootstrap the workspace by scanning assets. */
  async bootstrap(): Promise<void> {
    await this.assets.scan(this.config.assetPaths);
  }
}
