import { WorkspaceConfig } from '../types/workspace.js';
import { WorkspaceInstance } from './WorkspaceInstance.js';

/**
 * WorkspaceRegistry — manages multiple WorkspaceInstances.
 * Sprint 2, Step 6 Integration.
 */
export class WorkspaceRegistry {
  private workspaces = new Map<string, WorkspaceInstance>();

  /**
   * Create and register a new workspace instance.
   */
  async createWorkspace(
    config: WorkspaceConfig
  ): Promise<WorkspaceInstance> {
    const instance = new WorkspaceInstance(config);

    await instance.bootstrap();
    this.workspaces.set(config.workspaceId, instance);
    return instance;
  }

  /** Retrieve a workspace by ID. */
  get(id: string): WorkspaceInstance | undefined {
    return this.workspaces.get(id);
  }

  /** List all registered workspaces. */
  list(): WorkspaceInstance[] {
    return Array.from(this.workspaces.values());
  }

  /** Remove a workspace from the registry. */
  remove(id: string): boolean {
    const instance = this.workspaces.get(id);
    if (instance) {
      // In future: cleanup assets watch, etc.
      return this.workspaces.delete(id);
    }
    return false;
  }
}
