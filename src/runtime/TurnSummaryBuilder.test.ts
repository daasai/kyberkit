import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { KyberAnalyticsDb } from '../observability/KyberAnalyticsDb.js';
import { TurnSummaryBuilder } from './TurnSummaryBuilder.js';
import type { TaskCompleteEvent } from '../types/agent-events.js';
import { renderCompactSummary } from '../tui/components/TurnSummaryCard.js';

function makeTaskEvent(overrides: Partial<TaskCompleteEvent> = {}): TaskCompleteEvent {
  return {
    type: 'task_complete',
    taskId: 'task-1',
    mission: '分析销售数据',
    startedAt: 1_000_000,
    completedAt: 1_000_000 + 5_000,
    turnsInTask: 1,
    toolCalls: 4,
    errors: 1,
    stopReason: 'end_turn',
    ...overrides,
  };
}

describe('TurnSummaryBuilder', () => {
  let tmp: string;
  let db: KyberAnalyticsDb;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'tsb-'));
    db = new KyberAnalyticsDb(join(tmp, 'analytics.sqlite'));
  });

  afterEach(() => {
    try {
      // best-effort cleanup
      rmSync(tmp, { recursive: true, force: true });
    } catch {}
  });

  it('builds an empty summary when there are no deliverables', () => {
    const builder = new TurnSummaryBuilder(db);
    const summary = builder.build({
      task: makeTaskEvent(),
      tokensInputAtEnd: 100,
      tokensOutputAtEnd: 200,
    });

    expect(summary.taskId).toBe('task-1');
    expect(summary.mission).toBe('分析销售数据');
    expect(summary.durationMs).toBe(5_000);
    expect(summary.deliverables).toEqual([]);
    expect(summary.steps).toEqual([]);
    expect(summary.metrics.toolCallsTotal).toBe(4);
    expect(summary.metrics.toolCallsFailed).toBe(1);
    expect(summary.metrics.tokensInput).toBe(100);
    expect(summary.metrics.tokensOutput).toBe(200);
  });

  it('aggregates fs_events by path with create+modify collapsing into modify', () => {
    const turnId = 'turn-1';
    db.recordFsEvent({
      turn_id: turnId,
      task_id: 'task-1',
      tool_use_id: 'u1',
      tool_name: 'write_file',
      path: 'reports/a.md',
      kind: 'create',
      size_bytes: 100,
      preview: null,
      at_ms: 10,
    });
    db.recordFsEvent({
      turn_id: turnId,
      task_id: 'task-1',
      tool_use_id: 'u2',
      tool_name: 'edit_file',
      path: 'reports/a.md',
      kind: 'modify',
      size_bytes: 150,
      preview: null,
      at_ms: 20,
    });
    db.recordFsEvent({
      turn_id: turnId,
      task_id: 'task-1',
      tool_use_id: 'u3',
      tool_name: 'write_file',
      path: 'reports/b.csv',
      kind: 'create',
      size_bytes: 64,
      preview: null,
      at_ms: 30,
    });

    const builder = new TurnSummaryBuilder(db);
    const summary = builder.build({ task: makeTaskEvent() });

    expect(summary.deliverables.map(d => d.path)).toEqual(['reports/a.md', 'reports/b.csv']);
    const merged = summary.deliverables.find(d => d.path === 'reports/a.md')!;
    expect(merged.kind).toBe('modify');
    expect(merged.sizeBytes).toBe(150);
    expect(merged.toolName).toBe('edit_file');
  });

  it('promotes to delete when a delete event arrives after create/modify', () => {
    const turnId = 'turn-1';
    db.recordFsEvent({
      turn_id: turnId,
      task_id: 'task-1',
      tool_use_id: 'u1',
      tool_name: 'write_file',
      path: 'reports/a.md',
      kind: 'create',
      size_bytes: 100,
      preview: null,
      at_ms: 10,
    });
    db.recordFsEvent({
      turn_id: turnId,
      task_id: 'task-1',
      tool_use_id: 'u2',
      tool_name: 'delete_file',
      path: 'reports/a.md',
      kind: 'delete',
      size_bytes: null,
      preview: null,
      at_ms: 20,
    });

    const builder = new TurnSummaryBuilder(db);
    const summary = builder.build({ task: makeTaskEvent() });
    expect(summary.deliverables).toHaveLength(1);
    expect(summary.deliverables[0]!.kind).toBe('delete');
  });

  it('computes token deltas from start/end snapshots', () => {
    const builder = new TurnSummaryBuilder(db);
    const summary = builder.build({
      task: makeTaskEvent(),
      tokensInputAtStart: 50,
      tokensOutputAtStart: 30,
      tokensInputAtEnd: 200,
      tokensOutputAtEnd: 210,
    });
    expect(summary.metrics.tokensInput).toBe(150);
    expect(summary.metrics.tokensOutput).toBe(180);
  });

  it('maps taskPlan statuses to StepRecord statuses', () => {
    const builder = new TurnSummaryBuilder(db);
    const summary = builder.build({
      task: makeTaskEvent(),
      planSteps: [
        { id: 's1', title: '读取数据', status: 'done' },
        { id: 's2', title: '聚合指标', status: 'failed' },
        { id: 's3', title: '可视化', status: 'skipped' },
        { id: 's4', title: '还没开始', status: 'pending' },
      ],
    });
    expect(summary.steps.map(s => s.status)).toEqual(['ok', 'error', 'skipped', 'skipped']);
    expect(summary.steps.map(s => s.index)).toEqual([1, 2, 3, 4]);
  });

  it('tolerates a missing db (no fs_events access)', () => {
    const builder = new TurnSummaryBuilder(undefined);
    const summary = builder.build({ task: makeTaskEvent() });
    expect(summary.deliverables).toEqual([]);
  });

  it('falls back to fs_events by trajectory turn when task_id rows are empty', () => {
    const turnId = 'nl-turn-1';
    db.recordFsEvent({
      turn_id: turnId,
      task_id: null,
      tool_use_id: 'u1',
      tool_name: 'write_file',
      path: 'orphan.md',
      kind: 'create',
      size_bytes: 8,
      preview: null,
      at_ms: 1,
    });

    const builder = new TurnSummaryBuilder(db);
    const summary = builder.build({
      task: makeTaskEvent({ taskId: 'task-no-fs' }),
      trajectoryTurnId: turnId,
    });

    expect(summary.deliverables).toHaveLength(1);
    expect(summary.deliverables[0]!.path).toBe('orphan.md');
  });
});

describe('renderCompactSummary', () => {
  it('emits the Sprint 3.5 §5.3 block layout with dividers', () => {
    const block = renderCompactSummary({
      taskId: 'task-1',
      mission: 'demo',
      completedAt: Date.UTC(2026, 3, 20, 12, 0, 0),
      durationMs: 272_000,
      deliverables: [
        { path: 'reports/a.md', kind: 'create', sizeBytes: 1024, atMs: 10, toolName: 'write_file' },
      ],
      steps: [],
      assets: [
        {
          type: 'memory',
          title: '字段口径',
          revertible: true,
        },
      ],
      metrics: {
        toolCallsTotal: 6,
        toolCallsFailed: 0,
        tokensInput: 1000,
        tokensOutput: 500,
        costUsd: 0.47,
      },
    });

    expect(block).toContain('本轮交付');
    expect(block).toContain('reports/a.md');
    expect(block).toContain('新建');
    expect(block).toContain('6 次工具');
    expect(block).toContain('沉淀: 1 条 Memory · 0 条 Skill 建议');
    expect(block.split('\n').pop()).toMatch(/^─+$/);
  });

  it('handles empty deliverables list gracefully', () => {
    const block = renderCompactSummary({
      taskId: 'task-2',
      mission: '',
      completedAt: Date.now(),
      durationMs: 1000,
      deliverables: [],
      steps: [],
      assets: [],
      metrics: {
        toolCallsTotal: 0,
        toolCallsFailed: 0,
        tokensInput: 0,
        tokensOutput: 0,
      },
    });
    expect(block).toContain('交付物: (无文件变更)');
  });
});
