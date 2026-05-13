import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type {
  BatchAuthDecision,
  BatchAuthPrompt,
} from '../../permission/ToolPermissionGate.js';
import type { PermissionLevel } from '../../permission/PermissionPolicy.js';

interface Props {
  prompt: BatchAuthPrompt;
  onDecide: (decision: BatchAuthDecision) => void;
}

/**
 * Sprint 3.5 §4.2 batch authorization card.
 *
 * Keys:
 *   Enter        — 全部许可（本次任务）
 *   Shift+Enter  — 全部许可（本会话）   (actual key mapping below uses `s`)
 *   e / Esc      — 逐条审查 / 取消
 *   d            — 拒绝全部
 *   Tab          — 只许可 L1
 */
export const BatchAuthCard: React.FC<Props> = ({ prompt, onDecide }) => {
  const [expanded, setExpanded] = useState(false);

  const { hasL2, maxLevel, groups } = useMemo(() => {
    let _hasL2 = false;
    let _max: PermissionLevel = 'L0';
    const grouped = new Map<string, { count: number; level: PermissionLevel; reason: string }>();
    for (const it of prompt.items) {
      if (it.level === 'L2') _hasL2 = true;
      if (rank(it.level) > rank(_max)) _max = it.level;
      const g = grouped.get(it.toolName);
      if (g) g.count += 1;
      else grouped.set(it.toolName, { count: 1, level: it.level, reason: it.reason });
    }
    return { hasL2: _hasL2, maxLevel: _max, groups: [...grouped.entries()] };
  }, [prompt]);

  useInput((input, key) => {
    if (key.escape) {
      onDecide({ kind: 'review_each' });
      return;
    }
    if (key.return) {
      onDecide({ kind: 'allow_task', maxLevel });
      return;
    }
    if (key.tab) {
      onDecide({ kind: 'allow_task', maxLevel: 'L1' });
      return;
    }
    const ch = input.toLowerCase();
    if (ch === 'p') {
      onDecide({ kind: 'allow_persistent', maxLevel });
      return;
    }
    if (ch === 's') {
      onDecide({ kind: 'allow_session', maxLevel });
      return;
    }
    if (ch === 'e') {
      onDecide({ kind: 'review_each' });
      return;
    }
    if (ch === 'd') {
      onDecide({ kind: 'deny_all' });
      return;
    }
    if (ch === 'v') {
      setExpanded((v) => !v);
    }
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={1}
      paddingY={0}
      marginBottom={1}
    >
      <Text bold color="yellow">
        ┏ 授权请求 · {prompt.items.length} 项{prompt.mission ? ` · 任务: ${prompt.mission}` : ''}
      </Text>
      {groups.map(([name, info]) => (
        <Box key={name}>
          <Text color={info.level === 'L2' ? 'red' : 'yellow'}>[{info.level}] </Text>
          <Text bold>{name}</Text>
          <Text dimColor>
            {' '}
            × {info.count} · {info.reason}
          </Text>
        </Box>
      ))}

      {expanded ? (
        <Box flexDirection="column" marginTop={1}>
          {prompt.items.map((it, i) => (
            <Box key={`${it.toolName}-${i}`} flexDirection="column">
              <Text dimColor>
                · [{it.level}] {it.label}
              </Text>
              <Box marginLeft={2}>
                <Text dimColor>{it.inputPreview.slice(0, 120)}</Text>
              </Box>
            </Box>
          ))}
        </Box>
      ) : null}

      <Box marginTop={0}>
        <Text dimColor>
          Enter 本次任务 · s 本会话 · p 持久落盘 · Tab 只放行 L1{hasL2 ? '' : ''} · e 逐条 · d 拒绝 · v
          {expanded ? ' 折叠' : ' 展开详情'}
        </Text>
      </Box>
    </Box>
  );
};

function rank(level: PermissionLevel): number {
  return level === 'L0' ? 0 : level === 'L1' ? 1 : level === 'L2' ? 2 : 3;
}
