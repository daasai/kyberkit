import type { ChatMessage, ModelProvider } from '../../types/model.js';

/**
 * SessionMemoryExtractor — Sprint 4 §4.3
 *
 * Reads the current conversation and produces a STRUCTURED Markdown note
 * suitable for L2 session memory. The extractor itself is stateless; it
 * receives `previousNotes` as an explicit argument so it can merge rather
 * than duplicate information across turns.
 *
 * Runs via `chatStream()` on a lightweight model (`compactModel`, typically
 * `claude-haiku-4-5`). Falls back to the main model if the compact model
 * rejects the request.
 */
export interface SessionMemoryExtractorDeps {
  model: ModelProvider;
  /** Preferred small model, e.g. `claude-haiku-4-5`. */
  compactModel?: string;
  /** Main model used as fallback when `compactModel` fails. */
  fallbackModel: string;
  /** Max tokens for the extractor's output. Default 2048. */
  maxTokens?: number;
}

export interface SessionMemoryExtractionResult {
  /** The Markdown body (with the 7 standard sections). */
  markdown: string;
  /** Approximate token count of `markdown`. */
  tokenCount: number;
}

const SYSTEM_PROMPT = `You are a session note-taking assistant.
Read the conversation messages and produce a STRUCTURED Markdown note with
these exact sections (in order, omit a section only if truly empty):

## Goal
## Progress
## Decisions
## Findings
## Open Questions
## Errors
## Next Steps

Rules:
- Output only the Markdown body, no preface.
- Bullet points under each section (except Goal, which is 1-3 prose lines).
- Be specific: include file paths, error messages, decision rationale.
- If a previous note is provided, MERGE new information rather than duplicate.
- Target length: <= 600 words.`.trim();

export class SessionMemoryExtractor {
  constructor(private readonly deps: SessionMemoryExtractorDeps) {}

  async extract(
    messages: ChatMessage[],
    previousNotes: string | null,
  ): Promise<SessionMemoryExtractionResult> {
    if (messages.length === 0) {
      return { markdown: '', tokenCount: 0 };
    }

    const userPrefix = previousNotes && previousNotes.trim().length > 0
      ? `Previous note:\n\n${previousNotes.trim()}\n\n---\n\nUpdate it based on the following new conversation.`
      : `Produce a fresh session note based on the following conversation.`;

    const extractionMessages: ChatMessage[] = [
      { role: 'user', content: userPrefix },
      ...messages,
    ];

    const maxTokens = this.deps.maxTokens ?? 2048;
    const primary = this.deps.compactModel ?? this.deps.fallbackModel;

    let markdown: string;
    try {
      markdown = await this.runStream(primary, extractionMessages, maxTokens);
    } catch (err) {
      if (primary === this.deps.fallbackModel) throw err;
      markdown = await this.runStream(this.deps.fallbackModel, extractionMessages, maxTokens);
    }

    return {
      markdown,
      tokenCount: Math.ceil(markdown.length / 4),
    };
  }

  private async runStream(
    model: string,
    messages: ChatMessage[],
    maxTokens: number,
  ): Promise<string> {
    const chunks: string[] = [];
    for await (const ev of this.deps.model.chatStream({
      model,
      systemPrompt: SYSTEM_PROMPT,
      messages,
      tools: [],
      maxTokens,
    })) {
      if (ev.type === 'text_delta') chunks.push(ev.text);
    }
    return chunks.join('').trim();
  }
}
