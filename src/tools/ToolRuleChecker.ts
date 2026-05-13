/**
 * Deny rules: if tool name matches and input serializes matching pattern, deny (DeepCC-style rule layer).
 */
export class ToolRuleChecker {
  constructor(
    private readonly rules: ReadonlyArray<{ tool: string; pattern: string }>,
  ) {}

  /** Returns deny reason or null if allowed by rules. */
  checkDenied(toolName: string, input: unknown): string | null {
    const serialized = safeSerialize(input);
    for (const r of this.rules) {
      if (r.tool !== toolName && r.tool !== '*') continue;
      try {
        const re = new RegExp(r.pattern);
        if (re.test(serialized)) {
          return `Blocked by tool rule: ${r.tool} /${r.pattern}/`;
        }
      } catch {
        if (serialized.includes(r.pattern)) {
          return `Blocked by tool rule: ${r.tool} contains "${r.pattern}"`;
        }
      }
    }
    return null;
  }
}

function safeSerialize(input: unknown): string {
  if (input === null || input === undefined) return '';
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}
