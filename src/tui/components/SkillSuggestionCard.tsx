import { type FC, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { spawnSync } from 'node:child_process';
import { readFileSync, unlinkSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import type { SkillDraft } from '../../types/skill-suggestion.js';
import { commitSkillDraft } from '../../skills/SkillSuggestionRunner.js';
import type { TypedEventBus } from '../../events/EventBus.js';
import type { KyberEvents } from '../../types/events.js';

export interface SkillSuggestionCardProps {
  draft: SkillDraft;
  skillsDir: string;
  bus: TypedEventBus<KyberEvents>;
  onClose: (reason: 'saved' | 'dismiss' | 'ignored') => void;
}

/**
 * Track B — semi-automatic Skill: e = $EDITOR, s = save as-is, Esc = discard.
 */
export const SkillSuggestionCard: FC<SkillSuggestionCardProps> = ({
  draft,
  skillsDir,
  bus,
  onClose,
}) => {
  const [err, setErr] = useState('');

  useInput((input, key) => {
    if (key.escape) {
      bus.emit('skill.discarded', { draftId: draft.draftId, taskId: draft.taskId });
      onClose('dismiss');
      return;
    }
    const c = input.toLowerCase();
    if (c === 's') {
      void commitSkillDraft(skillsDir, draft, bus)
        .then(() => onClose('saved'))
        .catch((e) => {
          setErr(e instanceof Error ? e.message : String(e));
        });
    }
    if (c === 'e') {
      const editor = process.env.EDITOR?.trim() || 'vi';
      const tmp = join(tmpdir(), `kyber-skill-${randomUUID()}.md`);
      writeFileSync(tmp, draft.markdown, 'utf-8');
      const r = spawnSync(editor, [tmp], { stdio: 'inherit' });
      let body = draft.markdown;
      if (r.status === 0 && existsSync(tmp)) {
        try {
          body = readFileSync(tmp, 'utf-8');
        } catch {
          // keep draft
        }
      }
      try {
        if (existsSync(tmp)) unlinkSync(tmp);
      } catch {
        // ignore
      }
      const edited: SkillDraft = { ...draft, markdown: body, title: draft.title };
      void commitSkillDraft(skillsDir, edited, bus)
        .then(() => onClose('saved'))
        .catch((e) => {
          setErr(e instanceof Error ? e.message : String(e));
        });
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="magenta" paddingX={1} marginBottom={1}>
      <Text bold color="magenta">
        ┏ 草稿技能建议 · {draft.title}
      </Text>
      <Text dimColor>将沉淀到: skills/{draft.slug}/SKILL.md</Text>
      {err ? <Text color="red">{err}</Text> : null}
      <Text dimColor> e 用 $EDITOR 编辑后保存 · s 直接按草稿保存 · Esc 丢弃</Text>
    </Box>
  );
};
