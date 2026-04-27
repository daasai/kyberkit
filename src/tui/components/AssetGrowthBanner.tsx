import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';

/** Auto-collapse delay — per design spec §6.3 ("2 秒后自动收起"). We use a
 *  slightly longer 6 s so first-time users have enough time to read. */
const AUTO_COLLAPSE_MS = 6000;

export interface AssetGrowthBannerProps {
  memoryCount: number;
  skillCount: number;
  /** Total turns observed across prior sessions for this workspace. */
  turnsLifetime?: number;
  /** Cross-session growth in the last 7 days (from workspace growth store). */
  growth7d?: { memories: number; skills: number; permits: number };
}

/**
 * Sprint 3.5 §6.3 — asset growth banner.
 *
 * Appears once on TUI mount if the workspace already has some sediment
 * (memories/skills). Auto-collapses to a single line after 6 s; press `i` to
 * toggle back open.
 *
 * Deliberately kept as "体验糖" (experience sugar): numbers are rough
 * indicators, not audit figures.
 */
export const AssetGrowthBanner: React.FC<AssetGrowthBannerProps> = ({
  memoryCount,
  skillCount,
  turnsLifetime,
  growth7d,
}) => {
  const [expanded, setExpanded] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setExpanded(false), AUTO_COLLAPSE_MS);
    return () => clearTimeout(id);
  }, []);

  useInput((input, key) => {
    if (key.ctrl || key.meta) return;
    if (input === 'i' || input === 'I') {
      setExpanded(v => !v);
    }
  });

  if (memoryCount === 0 && skillCount === 0) return null;

  const turnsHint =
    turnsLifetime && turnsLifetime > 0 ? ` · 累计 ${turnsLifetime} 轮对话` : '';
  const growth7dHint =
    growth7d && (growth7d.memories > 0 || growth7d.skills > 0 || growth7d.permits > 0)
      ? `近 7 天：+${growth7d.memories} 记忆 · +${growth7d.skills} 技能 · +${growth7d.permits} 持久授权`
      : '';

  if (!expanded) {
    return (
      <Box paddingX={1}>
        <Text dimColor>
          ✨ 你的 Agent 已沉淀 {memoryCount} 条记忆 · {skillCount} 个技能（按 i 展开）
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" paddingX={1} marginBottom={1}>
      <Text>
        <Text color="magenta" bold>✨ 你的 Agent 正在成长</Text>
        <Text dimColor>{turnsHint}</Text>
      </Text>
      {growth7dHint ? <Text dimColor>   {growth7dHint}</Text> : null}
      <Text dimColor>   · {memoryCount} 条记忆（输入 /assets 查看）</Text>
      <Text dimColor>   · {skillCount} 个技能</Text>
      <Text dimColor>   [i 折叠此条]</Text>
    </Box>
  );
};
