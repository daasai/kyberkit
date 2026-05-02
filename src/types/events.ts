import type { AgentStatus, AgentDefinition } from './agent.js';
import type { PermissionTag } from './permission.js';
import type { StopReason } from './model.js';
import type { MemoryCategory } from './memory.js';
import type { ToolPermissionAudit } from './agent-events.js';

export type KyberEvents = {
  // Agent lifecycle events
  'agent.status_changed': { agentId: string; from: AgentStatus; to: AgentStatus };
  'agent.created': { agentId: string; definition: AgentDefinition };
  'agent.killed': { agentId: string; reason: string };
  'agent.error': { agentId: string; error: Error };

  // Tool events
  'tool.registered': { toolName: string; layer: 'shell' | 'mcp' | 'skill' };
  'tool.unregistered': { toolName: string };
  'tool.call_start': {
    toolName: string;
    agentId: string;
    input: unknown;
    audit?: ToolPermissionAudit;
  };
  'tool.call_end': {
    toolName: string;
    agentId: string;
    duration: number;
    success: boolean;
    audit?: ToolPermissionAudit;
  };
  'tool.error': { toolName: string; agentId: string; error: Error };

  // Permission events
  'permission.denied': { toolName: string; agentId: string; tag: PermissionTag };
  'permission.granted': { toolName: string; agentId: string; tag: PermissionTag };
  /** A persistent grant was added and written to `permit.yaml` (Track B). */
  'permit.persistent_recorded': { toolName: string; maxLevel: 'L0' | 'L1' | 'L2' | 'L3' };

  // MCP events
  'mcp.connected': { serverName: string };
  'mcp.disconnected': { serverName: string; reason: string };
  'mcp.error': { serverName: string; error: Error };

  // Skill events
  'skill.loaded': { skillName: string; source: string };
  'skill.activated': { skillName: string; trigger: string };
  /** Track B — draft ready for user review (fires async after task_complete). */
  'skill.suggested': import('./skill-suggestion.js').SkillSuggestionPayload;
  /** User saved the draft to `.kyberkit/skills/<slug>/SKILL.md`. */
  'skill.adopted': { slug: string; path: string; taskId?: string };
  /** User dismissed the draft without saving. */
  'skill.discarded': { draftId: string; taskId?: string };

  // --- Phase 1: Reliability Layer Events ---

  // Memory events
  // Sprint 3.5 §6.1 — the "已记住" toast + `/assets` feed read the optional
  // fields below. They are populated whenever the writer knows them (i.e. by
  // MarkdownMemoryStore); older publishers that only know entryId remain
  // wire-compatible.
  'memory.written': {
    tierId: string;
    entryId: string;
    category?: MemoryCategory;
    title?: string;
    path?: string;
    source?: 'auto' | 'manual';
  };
  'memory.evicted': { tierId: string; count: number; policy: string };
  // [C1] Session memory flush triggered by token threshold
  'memory.session_flushed': { tokenCount: number; toolCallCount: number };
  // Sprint 4: Context compression
  'context.compacted': {
    strategy: 'session_memory' | 'llm_summary' | 'noop';
    tokensBefore: number;
    tokensAfter: number;
    saved: number;
  };
  // Sprint 4: Memory auto-extraction
  'memory.extracted': {
    tier: 'session' | 'long_term';
    entryCount: number;
    basedOnMessages: number;
  };
  'memory.extraction_skipped': {
    tier: 'session' | 'long_term';
    reason: string;
  };

  // Checkpoint events
  'checkpoint.saved': { agentId: string; checkpointId: string };
  'checkpoint.restored': { agentId: string; checkpointId: string };
  'checkpoint.pruned': { count: number };
  // [C4] Auto-continuation after interrupted restore
  'checkpoint.auto_continued': { agentId: string; checkpointId: string; reason: 'interrupted_turn' | 'interrupted_prompt' };

  // Verification events
  'verification.started': { agentId: string };
  'verification.completed': { agentId: string; passed: boolean; token: string };
  // [I4] Step result now uses VerificationOutcome (success/blocking_failed/warning/timeout)
  'verification.step_result': { agentId: string; stepName: string; outcome: string };

  // Exception events
  'exception.handling': { error: Error; strategy: string };
  'exception.retry': { error: Error; attempt: number; maxAttempts: number };
  'exception.recovered': { error: Error; strategy: string };
  'exception.escalated': { error: Error; message: string };
  // [C6] Circuit breaker events
  'exception.circuit_breaker_tripped': { category: string; consecutiveFailures: number };
  'exception.circuit_breaker_open': { category: string };
  // [I5] Background query dropped event
  'exception.background_dropped': { error: Error; category: string };

  // --- Sprint 1: Streaming Events ---

  // Stream lifecycle
  'stream.started': { agentId: string; turnNumber: number };
  'stream.completed': { agentId: string; turnNumber: number; stopReason: StopReason };
  'stream.error': { agentId: string; turnNumber: number; error: Error };

  /** User submitted a natural-language turn (before agent loop). */
  'user.turn_sent': { agentId: string; turnId: string; userTextLen: number };
  /** User cancelled or interrupted the current turn. */
  'user.interrupted': { agentId: string; turnId?: string };

  // Middleware
  'middleware.registered': { name: string };
  'middleware.error': { name: string; error: Error };

  // OutputGuard events (3.0 P0.5)
  /** Fired when a prompt-injection pattern is detected in a tool input or output. */
  'output_guard.blocked': {
    direction: 'input' | 'output';
    toolName: string;
    ruleId: string;
    reason: string;
    taskId?: string;
    agentId?: string;
  };

  // LearningLoop events (3.0 P0.5)
  /** Fired after each qualifying task_complete: changelog written, skill suggested. */
  'learning_loop.evolved': {
    taskId: string;
    mission: string;
    rollbackCheckpointId?: string;
    changelogPath: string;
    toolCalls: number;
    skillSuggested: boolean;
  };
}
