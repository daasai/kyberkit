import React from 'react';
import { Box, Text } from 'ink';
import type { TurnSummary } from '../../types/turn-summary.js';

interface Props {
  summary: TurnSummary;
  /** When true, render in single-color minimal form for the no-TUI path. */
  compact?: boolean;
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '0s';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

function formatSize(bytes?: number): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimeOfDay(epochMs: number): string {
  try {
    const d = new Date(epochMs);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  } catch {
    return '';
  }
}

export const TurnSummaryCard: React.FC<Props> = ({ summary }) => {
  const hasDeliverables = summary.deliverables.length > 0;
  const hasSteps = summary.steps.length > 0;
  const hasAssets = summary.assets.length > 0;

  const completed = formatTimeOfDay(summary.completedAt);
  const dur = formatDuration(summary.durationMs);
  const { toolCallsTotal, toolCallsFailed, tokensInput, tokensOutput, costUsd } = summary.metrics;

  return (
    <Box flexDirection="column" marginTop={1} marginBottom={1}>
      <Text color="magenta">────── 本轮交付 · {completed} 完成 ──────</Text>

      <Box flexDirection="column" marginLeft={1} marginTop={1}>
        <Text color="cyan" bold>
          交付物 ({summary.deliverables.length})
        </Text>
        {hasDeliverables ? (
          summary.deliverables.map(d => {
            const icon = d.kind === 'delete' ? '✖' : d.kind === 'create' ? '📄' : '✎ ';
            const kindLabel =
              d.kind === 'create' ? '新建' : d.kind === 'modify' ? '修改' : '删除';
            const size = formatSize(d.sizeBytes);
            return (
              <Box key={`d-${d.path}-${d.atMs}`} marginLeft={2}>
                <Text>
                  {icon} {d.path}
                  <Text dimColor>
                    {'  '}· {kindLabel}
                    {size ? ` · ${size}` : ''}
                    {d.toolName ? ` · ${d.toolName}` : ''}
                  </Text>
                </Text>
              </Box>
            );
          })
        ) : (
          <Box marginLeft={2}>
            <Text dimColor>（本回合无文件变更记录；分析类任务可能仅有对话输出）</Text>
          </Box>
        )}
      </Box>

      {hasSteps && (
        <Box flexDirection="column" marginLeft={1} marginTop={1}>
          <Text color="cyan" bold>
            执行过程 ({summary.steps.length} 步 · {dur})
          </Text>
          {summary.steps.map(step => {
            const mark =
              step.status === 'ok' ? '✓' : step.status === 'error' ? '✗' : '·';
            const color =
              step.status === 'ok'
                ? 'green'
                : step.status === 'error'
                  ? 'red'
                  : 'gray';
            return (
              <Box key={`s-${step.index}`} marginLeft={2}>
                <Text color={color}>
                  {mark} {step.index}. {step.title}
                  {step.tool ? (
                    <Text dimColor>
                      {'  '}({step.tool}
                      {step.durationMs ? ` · ${Math.round(step.durationMs)}ms` : ''}
                      )
                    </Text>
                  ) : null}
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      {hasAssets && (
        <Box flexDirection="column" marginLeft={1} marginTop={1}>
          <Text color="cyan" bold>
            沉淀资产
          </Text>
          {summary.assets.map(a => {
            const icon =
              a.type === 'memory' ? '🧠' : a.type === 'permit' ? '🔓' : '🛠 ';
            const suffix = a.suggested ? '（建议，未采纳）' : '';
            return (
              <Box key={`a-${a.type}-${a.title}`} marginLeft={2}>
                <Text>
                  {icon} {a.title}
                  <Text dimColor> {suffix}</Text>
                </Text>
              </Box>
            );
          })}
        </Box>
      )}

      <Box marginLeft={1} marginTop={1}>
        <Text dimColor>
          {toolCallsTotal} 次工具
          {toolCallsFailed > 0 ? ` (失败 ${toolCallsFailed})` : ''} · in {tokensInput} / out{' '}
          {tokensOutput}
          {costUsd != null ? ` · $${costUsd.toFixed(4)}` : ''}
        </Text>
      </Box>
    </Box>
  );
};

/**
 * Pure renderer for the no-TUI / headless case — produces the block described
 * in Sprint 3.5 §5.3 using ASCII dividers so it reads well in plain terminals.
 */
export function renderCompactSummary(summary: TurnSummary): string {
  const completed = formatTimeOfDay(summary.completedAt);
  const dur = formatDuration(summary.durationMs);
  const cost =
    summary.metrics.costUsd != null ? ` · $${summary.metrics.costUsd.toFixed(4)}` : '';
  const lines: string[] = [];
  lines.push(`──────── 本轮交付 (${completed} 完成 · ${dur}${cost}) ────────`);

  if (summary.deliverables.length > 0) {
    lines.push('交付物:');
    for (const d of summary.deliverables) {
      const kindLabel =
        d.kind === 'create' ? '新建' : d.kind === 'modify' ? '修改' : '删除';
      const size = formatSize(d.sizeBytes);
      const sign = d.kind === 'delete' ? '-' : '+';
      lines.push(
        `  ${sign} ${d.path}  (${kindLabel}${size ? `, ${size}` : ''})`,
      );
    }
  } else {
    lines.push('交付物: (无文件变更)');
  }

  lines.push(
    `过程: ${summary.metrics.toolCallsTotal} 次工具 (失败 ${summary.metrics.toolCallsFailed}) · ${dur}`,
  );

  if (summary.assets.length > 0) {
    const mem = summary.assets.filter(a => a.type === 'memory').length;
    const skill = summary.assets.filter(a => a.type === 'skill').length;
    const permit = summary.assets.filter(a => a.type === 'permit').length;
    lines.push(
      `沉淀: ${mem} 条 Memory · ${skill} 条 Skill 建议${permit > 0 ? ` · ${permit} 条持久授权` : ''}`,
    );
  }

  lines.push('────────────────────────────────────────────────');
  return lines.join('\n');
}
