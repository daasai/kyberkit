import type { ToolCallState } from '../state/sessionReducer.js';

export type ToolDisplayGroup =
  | { kind: 'single'; toolCall: ToolCallState }
  | {
      kind: 'error-run';
      toolName: string;
      errorCount: number;
      recoveredBy?: string;
    };

function isError(tc: ToolCallState): boolean {
  return tc.status === 'error' || tc.isError === true;
}

/**
 * In compact mode, merge consecutive failures of the same tool (e.g. python×3 → bash).
 */
export function buildToolDisplayGroups(toolCalls: ToolCallState[], compact: boolean): ToolDisplayGroup[] {
  if (!compact) {
    return toolCalls.map((tc) => ({ kind: 'single' as const, toolCall: tc }));
  }

  const out: ToolDisplayGroup[] = [];
  let i = 0;
  const n = toolCalls.length;

  while (i < n) {
    const tc = toolCalls[i]!;
    if (isError(tc)) {
      let j = i + 1;
      while (j < n && toolCalls[j]!.toolName === tc.toolName && isError(toolCalls[j]!)) {
        j++;
      }
      const errCount = j - i;
      const next = j < n ? toolCalls[j]! : undefined;

      let recoveredBy: string | undefined;
      if (next && !isError(next)) {
        if (next.toolName !== tc.toolName) {
          recoveredBy = next.toolName;
        } else if (next.toolName === tc.toolName) {
          recoveredBy = next.toolName;
        }
      }

      if (errCount >= 2) {
        out.push({ kind: 'error-run', toolName: tc.toolName, errorCount: errCount, recoveredBy });
        i = recoveredBy ? j + 1 : j;
        continue;
      }

      if (errCount === 1 && recoveredBy) {
        out.push({ kind: 'error-run', toolName: tc.toolName, errorCount: 1, recoveredBy });
        i = j + 1;
        continue;
      }
    }

    out.push({ kind: 'single', toolCall: tc });
    i++;
  }
  return out;
}
