import type { ToolDefinition } from '../../types/tool.js';

/**
 * Registry for first-party builtin tools (Read / Write / Bash / Python / …).
 */
export class BuiltinToolRegistry {
  private byName = new Map<string, ToolDefinition>();

  constructor(tools: ToolDefinition[]) {
    for (const t of tools) {
      this.byName.set(t.name, t);
      for (const a of t.aliases ?? []) {
        this.byName.set(a, t);
      }
    }
  }

  findTool(name: string): ToolDefinition | undefined {
    return this.byName.get(name);
  }

  /** Unique tools (by canonical name). */
  listTools(): ToolDefinition[] {
    const seen = new Set<string>();
    const out: ToolDefinition[] = [];
    for (const t of this.byName.values()) {
      if (seen.has(t.name)) continue;
      seen.add(t.name);
      out.push(t);
    }
    return out;
  }
}
