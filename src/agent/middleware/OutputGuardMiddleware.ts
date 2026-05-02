import type { AgentEvent } from '../../types/agent-events.js';
import type { StreamMiddleware, MiddlewareContext } from '../StreamMiddleware.js';
import type { TypedEventBus } from '../../events/EventBus.js';
import type { KyberEvents } from '../../types/events.js';

// ─── Rule definitions ─────────────────────────────────────────────────────────

export interface OutputGuardPatternRule {
  /** Unique, stable identifier (used in audit + events). */
  readonly id: string;
  readonly pattern: RegExp;
  readonly description: string;
}

/**
 * Default injection-pattern rules applied to both tool inputs and outputs.
 * Additional rules can be injected via OutputGuardChecker constructor.
 */
export const DEFAULT_OUTPUT_GUARD_RULES: readonly OutputGuardPatternRule[] = [
  {
    id: 'ignore_instructions',
    pattern: /ignore\s+(all\s+)?previous\s+instructions?/i,
    description: 'Classic prompt-injection: ignore previous instructions',
  },
  {
    id: 'self_grant',
    pattern: /you\s+(must\s*now|are\s*now)\s+(authorized|allowed|permitted)/i,
    description: 'Self-authorization injection',
  },
  {
    id: 'role_override',
    pattern:
      /act\s+as\s+(?:if\s+you\s+(?:have|had)\s+|a\s+)?(?:root|admin|sudo|unrestricted)\b/i,
    description: 'Role-override injection',
  },
  {
    id: 'system_override',
    pattern: /<\s*SYSTEM\s*OVERRIDE\s*>/i,
    description: 'System-override marker in tool payload',
  },
  {
    id: 'system_tag_inject',
    pattern: /\[SYSTEM\]:\s*ignore/i,
    description: 'System-tag injection',
  },
  {
    id: 'kyberkit_bypass',
    pattern: /kyberkit[- ](bypass|disable|override)/i,
    description: 'KyberKit permission-bypass attempt',
  },
];

// ─── OutputGuardChecker ───────────────────────────────────────────────────────

export interface GuardViolation {
  readonly ruleId: string;
  readonly reason: string;
}

/**
 * Stateless checker used by both ToolDispatcherMiddleware (input side)
 * and OutputGuardMiddleware (output side).
 */
export class OutputGuardChecker {
  private readonly rules: readonly OutputGuardPatternRule[];

  constructor(extraRules: readonly OutputGuardPatternRule[] = []) {
    this.rules = [...DEFAULT_OUTPUT_GUARD_RULES, ...extraRules];
  }

  /**
   * Scan a serialised tool-input (tool name + JSON args) for injection patterns.
   * Returns the first matching violation, or `null` if clean.
   */
  checkInput(toolName: string, input: unknown): GuardViolation | null {
    const text = `${toolName} ${safeStringify(input)}`;
    return this.scan(text);
  }

  /**
   * Scan a tool-result string for injection patterns.
   * Returns the first matching violation, or `null` if clean.
   */
  checkOutput(result: string): GuardViolation | null {
    return this.scan(result);
  }

  private scan(text: string): GuardViolation | null {
    for (const rule of this.rules) {
      if (rule.pattern.test(text)) {
        return { ruleId: rule.id, reason: rule.description };
      }
    }
    return null;
  }
}

// ─── OutputGuardMiddleware ────────────────────────────────────────────────────

export interface OutputGuardMiddlewareDeps {
  readonly checker: OutputGuardChecker;
  readonly eventBus?: TypedEventBus<KyberEvents>;
  readonly agentId?: string;
  /** Current task ID provider (read at check time). */
  readonly getTaskId?: () => string | undefined;
}

/**
 * OutputGuardMiddleware — 3.0 P0.5
 *
 * Scans tool **outputs** (`tool_result` events) for prompt-injection patterns.
 * When a violation is found the result is prefixed with a visible `[OutputGuard]`
 * warning (hard-kill left for P1) and a `output_guard.blocked` event is emitted.
 *
 * Input-side injection detection is handled inside ToolDispatcherMiddleware via
 * {@link OutputGuardChecker.checkInput}, wired through the `outputGuardChecker`
 * option — see that file for details.
 */
export class OutputGuardMiddleware implements StreamMiddleware {
  readonly name = 'output_guard';

  constructor(private readonly deps: OutputGuardMiddlewareDeps) {}

  process(event: AgentEvent, _ctx: MiddlewareContext): AgentEvent | AgentEvent[] | null {
    if (event.type !== 'tool_result') return event;

    const violation = this.deps.checker.checkOutput(event.result);
    if (!violation) return event;

    const taskId = this.deps.getTaskId?.();

    this.deps.eventBus?.emit('output_guard.blocked', {
      direction: 'output',
      toolName: event.toolName,
      ruleId: violation.ruleId,
      reason: violation.reason,
      taskId,
      agentId: this.deps.agentId,
    });

    const guardedResult =
      `[OutputGuard] 检测到可疑输出，规则: ${violation.ruleId} — ${violation.reason}\n` +
      `以下为原始工具输出（已标记），请谨慎使用：\n\n${event.result}`;

    return { ...event, result: guardedResult };
  }
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? '';
  } catch {
    return String(value);
  }
}
