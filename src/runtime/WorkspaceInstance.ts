import { WorkspaceConfig } from '../types/workspace.js';
import { ModelProvider } from '../types/model.js';
import { AssetRegistry, DefaultAssetRegistry } from '../assets/AssetRegistry.js';
import { PromptAssembler } from '../prompt/PromptAssembler.js';
import { CommandRegistry } from '../commands/CommandRegistry.js';
import type { LongTermMemory } from '../memory/LongTermMemory.js';

// Providers
import { IdentityProvider } from '../prompt/providers/IdentityProvider.js';
import { ToolSchemaProvider } from '../prompt/providers/ToolSchemaProvider.js';
import { UserDirectiveProvider } from '../prompt/providers/UserDirectiveProvider.js';
import { MemoryProvider } from '../prompt/providers/MemoryProvider.js';
import { EnvironmentProvider } from '../prompt/providers/EnvironmentProvider.js';
import { ActiveSkillsProvider } from '../prompt/providers/ActiveSkillsProvider.js';
import { PlanningHintProvider } from '../prompt/providers/PlanningHintProvider.js';

// Builtin Commands
import { HelpCommand } from '../commands/builtin/HelpCommand.js';
import { CostCommand } from '../commands/builtin/CostCommand.js';
import { MemoryCommand } from '../commands/builtin/MemoryCommand.js';
import { CompactCommand } from '../commands/builtin/CompactCommand.js';
import { StatsCommand } from '../commands/builtin/StatsCommand.js';
import { PermitCommand } from '../commands/builtin/PermitCommand.js';
import { AssetsCommand } from '../commands/builtin/AssetsCommand.js';
import type { PermitStore } from '../permission/PermitStore.js';

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

  /**
   * Session-scoped supplier for the long-term memory instance. Populated by
   * `KyberRuntime.createSession` after reliability layer is built so that
   * `/memory add` and `/memory remove` can write to the same store used by
   * the extractor.
   */
  private longTermSupplier: () => LongTermMemory | undefined = () => undefined;

  /** Lazy accessor for the shared PermitStore (installed by KyberRuntime). */
  private permitStoreSupplier: () => PermitStore | undefined = () => undefined;

  constructor(
    readonly config: WorkspaceConfig
  ) {
    // 1. Initialize Asset Registry
    this.assets = new DefaultAssetRegistry();

    // 2. Initialize Prompt Assembler with standard providers
    this.promptAssembler = new PromptAssembler()
      .register(new IdentityProvider(config.identityPrompt || 'Professional AI Assistant'))
      .register(new ToolSchemaProvider())
      .register(new ActiveSkillsProvider())
      .register(new UserDirectiveProvider(() => this.assets.getMergedKKMd()))
      .register(new PlanningHintProvider())
      .register(new MemoryProvider(() => this.getLongTermMemory()))
      .register(new EnvironmentProvider());


    // 3. Initialize Command Registry with builtin commands
    this.commandRegistry = new CommandRegistry()
      .register(new HelpCommand(() => this.commandRegistry.list()))
      .register(new CostCommand())
      .register(
        new MemoryCommand(
          () => this.assets.getMemories(),
          () => this.longTermSupplier(),
        ),
      )
      .register(new CompactCommand())
      .register(new StatsCommand())
      .register(new PermitCommand(() => this.permitStoreSupplier()))
      .register(
        new AssetsCommand(() => this.assets.getManifest()?.entries ?? []),
      );
  }

  /** Install a lazy accessor for the shared PermitStore. */
  attachPermitStore(getter: () => PermitStore | undefined): void {
    this.permitStoreSupplier = getter;
  }

  /**
   * Install a lazy accessor for the session-scoped long-term memory. Called
   * from `KyberRuntime.createSession` once reliability is wired.
   */
  attachLongTermMemory(getter: () => LongTermMemory | undefined): void {
    this.longTermSupplier = getter;
  }

  /** Public accessor — used by `/assets`, MemoryToast Ctrl+Z revert, etc. */
  getLongTermMemory(): LongTermMemory | undefined {
    return this.longTermSupplier();
  }

  /** Bootstrap the workspace by scanning assets. */
  async bootstrap(): Promise<void> {
    await this.assets.scan(this.config.assetPaths);
  }
}
