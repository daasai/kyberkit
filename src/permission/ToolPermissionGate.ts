import type { ToolDefinition } from '../types/tool.js';
import type { PermissionLevel } from './PermissionPolicy.js';

export type ToolPermissionDecision = 'allow' | 'deny';

export type ToolRiskLevel = 'read' | 'write' | 'exec' | 'network';

export interface ToolPermissionPrompt {
  readonly toolName: string;
  readonly risk: ToolRiskLevel;
  readonly summary: string;
  readonly inputPreview: string;
  /** Sprint 3.5 §4.1 L0-L3 classification (optional; populated by PermissionPolicy). */
  readonly level?: PermissionLevel;
  /** True iff level === 'L3' — TUI should require a second confirmation keystroke. */
  readonly requiresSecondConfirm?: boolean;
}

export type CanUseToolFn = (
  prompt: ToolPermissionPrompt,
  ctx: { signal: AbortSignal },
) => Promise<ToolPermissionDecision>;

/**
 * Sprint 3.5 §4.2 — Batch authorization prompt.
 *
 * Shown once before a batch of L1/L2 tools is executed, letting the user
 * grant the whole group in a single gesture instead of one prompt per call.
 */
export interface BatchAuthPromptItem {
  readonly toolName: string;
  readonly level: PermissionLevel;
  readonly label: string;
  readonly reason: string;
  readonly inputPreview: string;
}

export interface BatchAuthPrompt {
  readonly items: readonly BatchAuthPromptItem[];
  /** Task id the grants should be scoped to (if "task" chosen). */
  readonly taskId?: string;
  /** Optional mission / task title for display. */
  readonly mission?: string;
}

export type BatchAuthDecision =
  | { kind: 'allow_task'; maxLevel: PermissionLevel }
  | { kind: 'allow_session'; maxLevel: PermissionLevel }
  | { kind: 'allow_persistent'; maxLevel: PermissionLevel }
  | { kind: 'review_each' }
  | { kind: 'deny_all' };

export type CanAuthorizeBatchFn = (
  prompt: BatchAuthPrompt,
  ctx: { signal: AbortSignal },
) => Promise<BatchAuthDecision>;

function preview(input: unknown, max = 200): string {
  try {
    const s = typeof input === 'string' ? input : JSON.stringify(input);
    return s.length > max ? s.slice(0, max) + '…' : s;
  } catch {
    return String(input);
  }
}

/**
 * Whether the tool call should go through interactive canUseTool (TUI / stdin).
 */
export function needsInteractiveGate(toolName: string, input: unknown, tool?: ToolDefinition): boolean {
  if (tool) {
    if (typeof tool.isDestructive === 'function' && tool.isDestructive(input as any)) {
      return true;
    }
    if (typeof tool.isReadOnly === 'function' && !tool.isReadOnly(input as any)) {
      if (['read_file', 'glob', 'grep'].includes(toolName)) return false;
      return true;
    }
  }

  switch (toolName) {
    case 'write_file':
    case 'edit_file':
    case 'bash':
    case 'python':
      return true;
    default:
      return false;
  }
}

export function buildPermissionPrompt(toolName: string, input: unknown): ToolPermissionPrompt {
  let risk: ToolRiskLevel = 'read';
  if (toolName === 'bash' || toolName === 'python') risk = 'exec';
  else if (toolName === 'write_file' || toolName === 'edit_file') risk = 'write';

  let summary = `Run ${toolName}`;
  if (toolName === 'bash' && input && typeof input === 'object' && 'command' in (input as object)) {
    summary = `Shell: ${String((input as { command: string }).command).slice(0, 80)}`;
  } else if (toolName === 'write_file' && input && typeof input === 'object' && 'path' in (input as object)) {
    summary = `Write file: ${String((input as { path: string }).path)}`;
  } else if (toolName === 'edit_file' && input && typeof input === 'object' && 'path' in (input as object)) {
    summary = `Edit file: ${String((input as { path: string }).path)}`;
  }

  return {
    toolName,
    risk,
    summary,
    inputPreview: preview(input),
  };
}

export const autoAllowCanUseTool: CanUseToolFn = async () => 'allow';
