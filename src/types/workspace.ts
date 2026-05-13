/**
 * Workspace configuration — defines an isolated user workspace.
 * Sprint 2, Step 4: Workspace-scoped multi-tenancy.
 */

import { AssetPaths } from './assets.js';

/** Configuration for a single workspace */
export interface WorkspaceConfig {
  /** Workspace unique identifier */
  readonly workspaceId: string;
  /** Display name */
  readonly name: string;
  /** Workspace-specific identity prompt (injected into PromptAssembler) */
  readonly identityPrompt?: string;
  /** Workspace asset paths */
  readonly assetPaths: AssetPaths;
  /** Model configuration override */
  readonly modelConfig?: {
    model?: string;
    apiKey?: string;
  };
  /** Resource quotas */
  readonly quotas?: {
    maxTokensPerSession?: number;
    maxSessionsPerDay?: number;
  };
}
