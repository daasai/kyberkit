/**
 * Prompt assembly types and structures.
 * Sprint 2, Step 5.
 */

import type { AssetManifest } from './assets.js';
import type { WorkspaceConfig } from './workspace.js';

/** A single section of a system prompt */
export interface PromptSection {
  /** Unique identifier for the section (e.g., 'identity', 'tools') */
  readonly id: string;
  /** Final text content of the section */
  content: string;
  /** Whether this section is static enough to be cached (Sprint 5 focus) */
  readonly cacheable: boolean;
  /** Importance level: lower numbers are higher priority (1 is highest) */
  readonly priority: number;
  /** Source of the content */
  readonly source: 'system' | 'user' | 'workspace' | 'project' | 'dynamic';
}

/** The final result of the prompt assembly process */
export interface AssembledPrompt {
  /** Concatenated text from all accepted sections */
  text: string;
  /** Ordered list of sections that were included */
  sections: PromptSection[];
  /** Estimated token count */
  estimatedTokens: number;
  /** Logical breakpoints for caching (Sprint 5 focus) */
  cacheBreakpoints: number[];
}

/** Context provided to each section provider during assembly */
export interface AssemblyContext {
  /** Maximum token budget for the system prompt */
  budget: number;
  /** Product-level hard directives (e.g. artifact protocol). */
  platformDirective?: string;
  /** Current working directory */
  cwd?: string;
  /** List of available tools (for the Tools section) */
  tools?: Array<{ name: string; description: string; inputSchema: unknown }>;
  /** Discovered assets (for the User Directives/Memory sections) */
  assets?: AssetManifest;
  /** Active workspace configuration */
  workspaceConfig?: WorkspaceConfig;
  /** Per-agent memory context (optional) */
  memoryContext?: string;
  /** Full reliability layer for advanced providers */
  reliability?: import('../agent/AgentLoop.js').ReliabilityLayer;
  /** Latest user message text (natural language turn) for skill discovery. */
  userTurnText?: string;
  /** Pre-rendered active skill sections (from SkillDiscovery). */
  skillContext?: string;
}


/** Interface for components that contribute a section to the system prompt */
export interface PromptSectionProvider {
  /** Unique ID for registration and tracking */
  readonly id: string;
  /** Priority level (1 = highest importance) */
  readonly priority: number;
  /** Whether the resulting content is cacheable */
  readonly cacheable: boolean;
  /** Declared source */
  readonly source: PromptSection['source'];
  /** 
   * Asynchronously provide the content for this section.
   * Returns null if the section should be skipped for the current context.
   */
  provide(context: AssemblyContext): Promise<string | null>;
}
