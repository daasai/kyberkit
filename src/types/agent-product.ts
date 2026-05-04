/**
 * Product-level agent definition loaded by runtime bootstrap.
 * Distinct from WorkspaceConfig (user assets) and infra env config.
 */
export interface AgentProductDef {
  /** Stable agent id, e.g. "kevin". */
  readonly id: string;
  /** Display name surfaced to users. */
  readonly name: string;
  /** Platform directive injected into PromptAssembler. */
  readonly platformDirective: string;
  /** Optional agent-level permission policy override. */
  readonly permissions?: {
    readonly allowed?: string[];
    readonly denied?: string[];
    readonly allowedPaths?: string[];
    readonly allowedDomains?: string[];
  };
}

