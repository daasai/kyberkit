import type { MessageContent } from '../types/model.js';

type Msg = { role: string; content: Array<MessageContent> | string };

/**
 * Extract the latest natural-language user text (skips tool_result-only user messages).
 */
export function extractLatestNaturalUserText(messages: readonly Msg[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'user') continue;
    const c = m.content;
    if (typeof c === 'string') return c;
    const texts = c.filter((b): b is { type: 'text'; text: string } => b.type === 'text');
    if (texts.length > 0) return texts.map((t) => t.text).join('\n');
  }
  return '';
}
