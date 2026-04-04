import { AgentStatus, AgentDefinition } from './agent.js';
import { PermissionTag } from './permission.js';

export type KyberEvents = {
  // Agent lifecycle events
  'agent.status_changed': { agentId: string; from: AgentStatus; to: AgentStatus };
  'agent.created': { agentId: string; definition: AgentDefinition };
  'agent.killed': { agentId: string; reason: string };
  'agent.error': { agentId: string; error: Error };

  // Tool events
  'tool.registered': { toolName: string; layer: 'shell' | 'mcp' | 'skill' };
  'tool.unregistered': { toolName: string };
  'tool.call_start': { toolName: string; agentId: string; input: unknown };
  'tool.call_end': { toolName: string; agentId: string; duration: number; success: boolean };
  'tool.error': { toolName: string; agentId: string; error: Error };

  // Permission events
  'permission.denied': { toolName: string; agentId: string; tag: PermissionTag };
  'permission.granted': { toolName: string; agentId: string; tag: PermissionTag };

  // MCP events
  'mcp.connected': { serverName: string };
  'mcp.disconnected': { serverName: string; reason: string };
  'mcp.error': { serverName: string; error: Error };

  // Skill events
  'skill.loaded': { skillName: string; source: string };
  'skill.activated': { skillName: string; trigger: string };

  // --- Phase 1: Reliability Layer Events ---

  // Memory events
  'memory.written': { tierId: string; entryId: string };
  'memory.evicted': { tierId: string; count: number; policy: string };
  // [C1] Session memory flush triggered by token threshold
  'memory.session_flushed': { tokenCount: number; toolCallCount: number };

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
}
