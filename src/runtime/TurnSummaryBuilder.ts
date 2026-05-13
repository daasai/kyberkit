import type { KyberAnalyticsDb } from '../observability/KyberAnalyticsDb.js';
import type { TaskCompleteEvent, TaskPlanStep } from '../types/agent-events.js';
import type {
  AssetRecord,
  Deliverable,
  StepRecord,
  TurnSummary,
} from '../types/turn-summary.js';

/**
 * Sprint 3.5 §5 — builds a deterministic `TurnSummary` from trajectory rows.
 *
 * Pure with respect to the injected `db`; all inputs are passed explicitly by
 * the caller (typically `AgentSession.send`) so the builder does not need to
 * observe events directly.
 */
export class TurnSummaryBuilder {
  constructor(private readonly db?: KyberAnalyticsDb) {}

  build(input: {
    task: TaskCompleteEvent;
    /** When set, fs_events with null task_id are merged from this turn (P0 UX). */
    trajectoryTurnId?: string;
    planSteps?: readonly TaskPlanStep[];
    assets?: readonly AssetRecord[];
    /** Input tokens observed just before the task started. */
    tokensInputAtStart?: number;
    /** Output tokens observed just before the task started. */
    tokensOutputAtStart?: number;
    /** Cumulative input tokens at task completion. */
    tokensInputAtEnd?: number;
    /** Cumulative output tokens at task completion. */
    tokensOutputAtEnd?: number;
    /** Estimated cost (USD) delta for this task. Pricing left to caller. */
    costUsd?: number;
  }): TurnSummary {
    const { task } = input;

    let deliverables = this.buildDeliverables(task.taskId);
    if (
      deliverables.length === 0 &&
      input.trajectoryTurnId &&
      this.db
    ) {
      const byTurn = this.buildDeliverablesFromTurn(input.trajectoryTurnId);
      deliverables = byTurn;
    }
    const steps = this.buildSteps(input.planSteps);

    const tokensInput =
      input.tokensInputAtStart != null && input.tokensInputAtEnd != null
        ? Math.max(0, input.tokensInputAtEnd - input.tokensInputAtStart)
        : (input.tokensInputAtEnd ?? 0);
    const tokensOutput =
      input.tokensOutputAtStart != null && input.tokensOutputAtEnd != null
        ? Math.max(0, input.tokensOutputAtEnd - input.tokensOutputAtStart)
        : (input.tokensOutputAtEnd ?? 0);

    return {
      taskId: task.taskId,
      mission: task.mission,
      completedAt: task.completedAt,
      durationMs: Math.max(0, task.completedAt - task.startedAt),
      deliverables,
      steps,
      assets: input.assets ?? [],
      metrics: {
        toolCallsTotal: task.toolCalls,
        toolCallsFailed: task.errors,
        tokensInput,
        tokensOutput,
        costUsd: input.costUsd,
      },
    };
  }

  /** Same merge rules as {@link buildDeliverables} but keyed by natural-language turn id. */
  private buildDeliverablesFromTurn(turnId: string): Deliverable[] {
    if (!this.db) return [];
    const rows = this.db.queryFsEventsByTurn(turnId);
    return this.mergeFsRows(rows);
  }

  private buildDeliverables(taskId: string): Deliverable[] {
    if (!this.db) return [];
    const rows = this.db.queryFsEventsByTask(taskId);
    return this.mergeFsRows(rows);
  }

  private mergeFsRows(
    rows: Array<{
      path: string;
      kind: 'create' | 'modify' | 'delete';
      tool_name: string | null;
      size_bytes: number | null;
      preview: string | null;
      at_ms: number;
    }>,
  ): Deliverable[] {

    // Deduplicate per path; a later event for the same path wins on `kind`
    // (except create stays create when followed by modify — we promote to modify).
    const byPath = new Map<string, Deliverable>();
    for (const r of rows) {
      const prev = byPath.get(r.path);
      if (!prev) {
        byPath.set(r.path, {
          path: r.path,
          kind: r.kind,
          sizeBytes: r.size_bytes ?? undefined,
          atMs: r.at_ms,
          toolName: r.tool_name,
        });
        continue;
      }
      // Merge rule: delete wins; otherwise the latest non-delete wins but
      // "create then modify" becomes "modify"; "modify then modify" stays modify.
      if (r.kind === 'delete') {
        byPath.set(r.path, { ...prev, kind: 'delete', atMs: r.at_ms });
        continue;
      }
      const kind: Deliverable['kind'] =
        prev.kind === 'create' && r.kind === 'modify' ? 'modify' : (r.kind ?? prev.kind);
      byPath.set(r.path, {
        ...prev,
        kind,
        sizeBytes: r.size_bytes ?? prev.sizeBytes,
        atMs: r.at_ms,
        toolName: r.tool_name ?? prev.toolName,
      });
    }

    return [...byPath.values()].sort((a, b) => a.atMs - b.atMs);
  }

  private buildSteps(planSteps: readonly TaskPlanStep[] | undefined): StepRecord[] {
    if (!planSteps || planSteps.length === 0) return [];
    return planSteps.map((s, i) => ({
      index: i + 1,
      title: s.title,
      status:
        s.status === 'done'
          ? 'ok'
          : s.status === 'failed'
            ? 'error'
            : s.status === 'skipped'
              ? 'skipped'
              : ('skipped' as const),
    }));
  }
}
