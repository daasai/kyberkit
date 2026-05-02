import type { TaskCompleteEvent } from '../types/agent-events.js';
import type { TypedEventBus } from '../events/EventBus.js';
import type { KyberEvents } from '../types/events.js';
import type { SkillSuggestionRunner } from '../skills/SkillSuggestionRunner.js';
import type { EvolutionChangelog } from './EvolutionChangelog.js';

type ToolLogEntry = { name: string; input: unknown };

export interface LearningLoopDeps {
  readonly changelog: EvolutionChangelog;
  readonly eventBus: TypedEventBus<KyberEvents>;
  /** Optional — when present, skill drafts are generated after qualifying tasks. */
  readonly skillRunner?: SkillSuggestionRunner;
  /**
   * Minimum number of tool calls in a task before the learning loop fires.
   * Defaults to 2.
   */
  readonly minToolCalls?: number;
}

/**
 * LearningLoopMiddleware — 3.0 P0.5
 *
 * Called from `AgentSession.send()` after each `task_complete` event (same
 * pattern as SkillSuggestionRunner).  On qualifying tasks it:
 *
 * 1. Appends an Evolution Changelog entry to `.kyberkit/evolution-changelog.md`.
 * 2. Schedules a SkillSuggestionRunner draft (if provided).
 * 3. Emits `learning_loop.evolved` on the event bus.
 *
 * All work is fire-and-forget — callers are never blocked.
 */
export class LearningLoopMiddleware {
  private latestCheckpointId: string | undefined;
  private readonly minToolCalls: number;
  private checkpointSubscription: { dispose: () => void } | undefined;

  constructor(private readonly deps: LearningLoopDeps) {
    this.minToolCalls = deps.minToolCalls ?? 2;
    // Track latest checkpoint ID via event bus (loose coupling — no direct
    // reference to CheckpointManager needed).
    this.checkpointSubscription = deps.eventBus.on('checkpoint.saved', ({ checkpointId }) => {
      this.latestCheckpointId = checkpointId;
    });
  }

  /**
   * Fire-and-forget learning job triggered after task completion.
   * Called by AgentSession after a `task_complete` event is yielded.
   */
  schedule(
    task: TaskCompleteEvent,
    toolLog: readonly ToolLogEntry[],
    _userText: string,
  ): void {
    if (task.toolCalls < this.minToolCalls) return;
    if (toolLog.length < this.minToolCalls) return;

    const rollbackCheckpointId = this.latestCheckpointId;
    void this.runInternal(task, toolLog, rollbackCheckpointId).catch((err) => {
      console.error('[LearningLoopMiddleware]', err);
    });
  }

  /**
   * Unsubscribe from the event bus. Call when the session is closed to avoid
   * listener leaks.
   */
  dispose(): void {
    this.checkpointSubscription?.dispose();
    this.checkpointSubscription = undefined;
  }

  private async runInternal(
    task: TaskCompleteEvent,
    toolLog: readonly ToolLogEntry[],
    rollbackCheckpointId: string | undefined,
  ): Promise<void> {
    // Build tool-call breakdown map
    const breakdown: Record<string, number> = {};
    for (const entry of toolLog) {
      breakdown[entry.name] = (breakdown[entry.name] ?? 0) + 1;
    }

    // 1. Write Evolution Changelog entry
    await this.deps.changelog.appendEntry({
      taskId: task.taskId,
      mission: task.mission,
      toolCalls: task.toolCalls,
      toolBreakdown: breakdown,
      rollbackCheckpointId,
      timestamp: task.completedAt,
    });

    // 2. Schedule skill suggestion (fire-and-forget inside SkillSuggestionRunner)
    let skillSuggested = false;
    if (this.deps.skillRunner) {
      this.deps.skillRunner.schedule(task, toolLog, '');
      skillSuggested = task.toolCalls >= 3; // mirrors SkillSuggestionRunner's guard
    }

    // 3. Emit learning_loop.evolved
    this.deps.eventBus.emit('learning_loop.evolved', {
      taskId: task.taskId,
      mission: task.mission,
      rollbackCheckpointId,
      changelogPath: this.deps.changelog.path,
      toolCalls: task.toolCalls,
      skillSuggested,
    });
  }
}
