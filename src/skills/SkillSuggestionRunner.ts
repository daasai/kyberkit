import { randomUUID } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import type { ModelProvider } from '../types/model.js';
import type { TaskCompleteEvent } from '../types/agent-events.js';
import type { MessageContent } from '../types/model.js';
import type { SkillDraft, SkillSuggestionPayload } from '../types/skill-suggestion.js';
import type { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';

export interface SkillSuggestionRunnerDeps {
  model: ModelProvider;
  compactModel: string;
  fallbackModel: string;
  eventBus: TypedEventBus<KyberEvents>;
  /** e.g. `<user>/.kyberkit/skills` */
  skillsDir: string;
  /** Max drafts per session (default 3). */
  maxPerSession?: number;
}

type ToolLogEntry = { name: string; input: unknown };

/**
 * Fire-and-forget LLM draft for a reusable Skill after a tool-heavy task.
 * Emits `skill.suggested` on the bus; does not block the agent stream.
 */
export class SkillSuggestionRunner {
  private sessionCount = 0;
  private readonly maxPer: number;

  constructor(private readonly deps: SkillSuggestionRunnerDeps) {
    this.maxPer = deps.maxPerSession ?? 3;
  }

  /** Call when `task_complete` is observed (non-blocking). */
  schedule(
    task: TaskCompleteEvent,
    toolLog: readonly ToolLogEntry[],
    _userText: string,
  ): void {
    if (task.toolCalls < 3) return;
    if (this.sessionCount >= this.maxPer) return;
    if (toolLog.length < 3) return;

    const run = this.runInternal(task, toolLog).catch((err) => {
      console.error('[SkillSuggestionRunner]', err);
    });
    void run;
  }

  private async runInternal(
    task: TaskCompleteEvent,
    toolLog: readonly ToolLogEntry[],
  ): Promise<void> {
    this.sessionCount += 1;
    const model = this.deps.compactModel || this.deps.fallbackModel;
    const toolSummary = toolLog
      .map((t) => `- ${t.name}: ${trimJson(t.input, 300)}`)
      .join('\n');

    const system = `You write KyberKit Skill files: a single Markdown document with YAML front matter.
Output ONLY the markdown file content, no explanation.

Front matter keys:
- name: short title
- description: one line when to use this skill
- parameters: optional, brief list of parameters the user may fill in

After front matter, the body should be steps the agent should follow (numbered list), derived from the tool sequence.

Keep it under 800 words. Use language that matches the user's task (Chinese if the mission is Chinese).`.trim();

    const user = `Task mission: ${task.mission}
Tool calls in task (${task.toolCalls} total, sample log):
${toolSummary}

Write the SKILL.md content.`.trim();

    const res = await this.deps.model.chat({
      model,
      systemPrompt: system,
      messages: [{ role: 'user', content: user }],
      maxTokens: 2048,
    });

    const text = extractText(res.content);
    if (!text || text.trim().length < 40) return;

    const slug = slugifyFromMission(task.mission) || `skill-${task.taskId.slice(0, 8)}`;
    const draftId = randomUUID();
    const title = parseTitleFromMarkdown(text) ?? slug;

    const draft: SkillDraft = {
      draftId,
      slug,
      title,
      markdown: ensureFrontmatter(text, title, task.mission),
      taskId: task.taskId,
    };

    const payload: SkillSuggestionPayload = {
      draft,
      toolNames: [...new Set(toolLog.map((t) => t.name))].slice(0, 20),
    };
    this.deps.eventBus.emit('skill.suggested', payload);
  }
}

/**
 * Write draft to `<skillsDir>/<slug>/SKILL.md` and emit `skill.adopted`.
 */
export async function commitSkillDraft(
  skillsDir: string,
  draft: SkillDraft,
  bus: TypedEventBus<KyberEvents>,
): Promise<string> {
  const dir = join(skillsDir, draft.slug);
  await mkdir(dir, { recursive: true });
  const path = join(dir, 'SKILL.md');
  await writeFile(path, draft.markdown, 'utf-8');
  bus.emit('skill.adopted', { slug: draft.slug, path, taskId: draft.taskId });
  return path;
}

function extractText(blocks: MessageContent[]): string {
  let s = '';
  for (const b of blocks) {
    if (b.type === 'text' && b.text) s += b.text;
  }
  return s.trim();
}

function trimJson(input: unknown, max: number): string {
  try {
    const t = JSON.stringify(input);
    return t.length > max ? `${t.slice(0, max)}…` : t;
  } catch {
    return String(input).slice(0, max);
  }
}

function slugifyFromMission(m: string): string {
  const s = m
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return s || '';
}

function parseTitleFromMarkdown(md: string): string | null {
  const m = md.match(/^name:\s*(.+)$/m);
  if (m?.[1]) return m[1].trim();
  return null;
}

function ensureFrontmatter(body: string, name: string, descriptionHint: string): string {
  if (body.trim().startsWith('---')) return body;
  return `---\nname: ${name}\ndescription: ${descriptionHint.replace(/\n/g, ' ').slice(0, 200)}\n---\n\n${body}`;
}
