/**
 * Request-scoped execution context for Kevin Rev3 (strategy A).
 * Sidecar constructs this after resolving space_id → library; passed into KyberRuntime.createSession.
 * See docs/specs/kevin1.5/kevin-v1.5-system-refactor-spec.md §8.1
 */

export interface AgentExecutionContext {
  spaceId: string
  libraryId: string
  /** User document root (absolute path). */
  libraryMountPath: string
  /** Technical assets root: ${KEVIN_NODE_ROOT}/lib-<libraryId>/ */
  libraryTechRoot: string
  /** Default cwd for builtins / shell when not overridden by tool input. */
  cwd: string
  /** Request-scoped sandbox roots used by builtin tools/shell. */
  allowedRoots: string[]
  /**
   * Request-scoped MCP filesystem roots. Empty means deferred/global MCP root mode.
   * Kevin Rev3 currently keeps MCP fs in deferred mode.
   */
  mcpRoots: string[]
  sessionId: string
}
