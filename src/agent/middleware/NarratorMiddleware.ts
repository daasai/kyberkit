import { randomUUID } from 'crypto';
import * as path from 'path';
import type {
  AgentEvent,
  TaskCompleteEvent,
  TaskNarrationEvent,
  TaskPlanEvent,
  TaskPlanStep,
} from '../../types/agent-events.js';
import type { StopReason } from '../../types/model.js';
import type { StreamMiddleware, MiddlewareContext } from '../StreamMiddleware.js';

/**
 * Rule-based progress narration + optional fallback {@link TaskPlanEvent} when the model
 * did not call `plan_task` on multi-tool turns.
 *
 * Sprint 3.5 §3.2 / §5:
 *  - Assigns a stable `taskId` and `mission` to each plan / user turn.
 *  - Tracks turn / tool / error counts within the task.
 *  - Synthesizes a `task_complete` event when a `turn_complete` with stopReason='end_turn' arrives.
 */
export class NarratorMiddleware implements StreamMiddleware {
  readonly name = 'narrator';

  private modelPlanEmitted = false;
  private fallbackPlanEmitted = false;
  private toolUseCompleteCount = 0;
  /** Last tool_result isError by tool name (updated after each tool_result). */
  private lastResultWasError = new Map<string, boolean>();

  private taskId: string | null = null;
  private mission: string = '';
  private taskStartedAt = 0;
  private turnsInTask = 0;
  private toolCallsInTask = 0;
  private errorsInTask = 0;

  private resetTurnCounters(): void {
    this.modelPlanEmitted = false;
    this.fallbackPlanEmitted = false;
    this.toolUseCompleteCount = 0;
    this.lastResultWasError.clear();
  }

  private ensureTask(context: MiddlewareContext): void {
    if (this.taskId) return;
    this.taskId = randomUUID();
    this.taskStartedAt = Date.now();
    this.turnsInTask = 0;
    this.toolCallsInTask = 0;
    this.errorsInTask = 0;
    this.mission = truncateTitle(context.latestUserTurnText, 48) || '进行中';
  }

  private clearTask(): void {
    this.taskId = null;
    this.mission = '';
    this.taskStartedAt = 0;
    this.turnsInTask = 0;
    this.toolCallsInTask = 0;
    this.errorsInTask = 0;
  }

  process(event: AgentEvent, context: MiddlewareContext): AgentEvent | AgentEvent[] | null {
    // Initialise task state lazily on the first event of a user turn.
    this.ensureTask(context);

    if (event.type === 'turn_complete') {
      this.turnsInTask += 1;
      this.resetTurnCounters();
      const shouldClose = isTaskTerminal(event.stopReason);
      if (shouldClose && this.taskId) {
        const taskComplete: TaskCompleteEvent = {
          type: 'task_complete',
          taskId: this.taskId,
          mission: this.mission || truncateTitle(context.latestUserTurnText, 48) || '进行中',
          startedAt: this.taskStartedAt,
          completedAt: Date.now(),
          turnsInTask: this.turnsInTask,
          toolCalls: this.toolCallsInTask,
          errors: this.errorsInTask,
          stopReason: event.stopReason,
        };
        this.clearTask();
        return [event, taskComplete];
      }
      return event;
    }

    if (event.type === 'task_plan' && event.source === 'model') {
      this.modelPlanEmitted = true;
      this.fallbackPlanEmitted = true;
      // Stamp taskId + mission on the plan event so downstream consumers can pick it up.
      const augmented: TaskPlanEvent = {
        ...event,
        taskId: event.taskId ?? this.taskId ?? undefined,
        mission:
          event.mission && event.mission.trim().length > 0
            ? event.mission
            : this.mission || undefined,
      };
      if (augmented.mission) this.mission = augmented.mission;
      return augmented;
    }

    const extra: AgentEvent[] = [];

    if (event.type === 'tool_use_complete') {
      this.toolUseCompleteCount++;
      this.toolCallsInTask++;

      if (event.toolName === 'plan_task') {
        const parsed = parsePlanInput(event.input);
        if (parsed.titles.length > 0) {
          this.modelPlanEmitted = true;
          this.fallbackPlanEmitted = true;
          if (parsed.mission) this.mission = parsed.mission;
          extra.push(
            makeTaskPlan(parsed.titles, 'model', {
              taskId: this.taskId ?? undefined,
              mission: this.mission || undefined,
            }),
          );
        }
        const n = narratePlanTask(parsed.titles.length);
        if (n) extra.push(n);
      } else {
        const hadError = this.lastResultWasError.get(event.toolName) === true;
        if (hadError) {
          extra.push({
            type: 'task_narration',
            text: `重试 ${event.toolName}`,
            kind: 'recovering',
          });
        } else {
          const n = narrateToolUseComplete(event);
          if (n) extra.push(n);
        }
      }

      if (
        !this.modelPlanEmitted &&
        !this.fallbackPlanEmitted &&
        this.toolUseCompleteCount >= 2 &&
        event.toolName !== 'plan_task'
      ) {
        this.fallbackPlanEmitted = true;
        const title = truncateTitle(context.latestUserTurnText, 48);
        const step: TaskPlanStep = {
          id: 'narrator-fallback-1',
          title: title || '当前任务',
          status: 'active',
        };
        extra.push({
          type: 'task_plan',
          steps: [step],
          source: 'narrator',
          taskId: this.taskId ?? undefined,
          mission: this.mission || undefined,
        } satisfies TaskPlanEvent);
      }
    }

    if (event.type === 'tool_result') {
      this.lastResultWasError.set(event.toolName, event.isError);
      if (event.isError) this.errorsInTask++;
      if (event.toolName !== 'plan_task') {
        const tail = narrateToolResultTail(event);
        if (tail) {
          extra.push({
            type: 'task_narration',
            text: tail,
            kind: event.isError ? 'recovering' : 'progress',
          });
        }
      }
    }

    if (extra.length === 0) return event;
    return [event, ...extra];
  }
}

/**
 * `tool_use` / `pause_turn` reasons keep the task alive across turns; `end_turn` / `stop_sequence`
 * / `max_tokens` close it.
 */
function isTaskTerminal(stopReason: StopReason): boolean {
  return stopReason === 'end_turn' || stopReason === 'stop_sequence' || stopReason === 'max_tokens';
}

function makeTaskPlan(
  titles: string[],
  source: 'model' | 'narrator',
  extras: { taskId?: string; mission?: string },
): TaskPlanEvent {
  const steps: TaskPlanStep[] = titles.map((title, i) => ({
    id: `s${i}`,
    title,
    status: i === 0 ? 'active' : ('pending' as const),
  }));
  return { type: 'task_plan', steps, source, taskId: extras.taskId, mission: extras.mission };
}

function parsePlanInput(input: unknown): { titles: string[]; mission?: string } {
  if (!input || typeof input !== 'object') return { titles: [] };
  const obj = input as { steps?: unknown; mission?: unknown };
  const titles = Array.isArray(obj.steps)
    ? obj.steps.filter((s): s is string => typeof s === 'string' && s.trim().length > 0).slice(0, 12)
    : [];
  const mission =
    typeof obj.mission === 'string' && obj.mission.trim().length > 0
      ? truncateTitle(obj.mission, 48)
      : undefined;
  return { titles, mission };
}

function truncateTitle(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function narratePlanTask(stepCount: number): TaskNarrationEvent | null {
  if (stepCount <= 0) return null;
  return {
    type: 'task_narration',
    text: `已列出 ${stepCount} 步计划`,
    kind: 'starting',
  };
}

function narrateToolUseComplete(event: Extract<AgentEvent, { type: 'tool_use_complete' }>): TaskNarrationEvent | null {
  const { toolName, input } = event;
  if (toolName === 'plan_task') return null;

  if (toolName === 'read_file' && input && typeof input === 'object') {
    const p = (input as { path?: string }).path;
    if (typeof p === 'string' && p.length > 0) {
      return {
        type: 'task_narration',
        text: `读取 ${path.basename(p)}`,
        kind: 'progress',
      };
    }
  }

  if (toolName === 'write_file' && input && typeof input === 'object') {
    const p = (input as { path?: string; content?: string }).path;
    const c = (input as { content?: string }).content;
    if (typeof p === 'string') {
      const bytes = typeof c === 'string' ? c.length : 0;
      return {
        type: 'task_narration',
        text: `写入 ${path.basename(p)}（${bytes} 字符）`,
        kind: 'progress',
      };
    }
  }

  if (toolName === 'glob' && input && typeof input === 'object') {
    const pat = (input as { pattern?: string }).pattern;
    if (typeof pat === 'string') {
      return { type: 'task_narration', text: `查找文件：${pat}`, kind: 'progress' };
    }
  }

  if (toolName === 'grep' && input && typeof input === 'object') {
    const pat = (input as { pattern?: string }).pattern;
    if (typeof pat === 'string') {
      return { type: 'task_narration', text: `搜索内容：${truncateTitle(pat, 40)}`, kind: 'progress' };
    }
  }

  if (toolName === 'bash' && input && typeof input === 'object') {
    const cmd = (input as { command?: string }).command;
    if (typeof cmd === 'string') {
      const verb = bashVerb(cmd);
      return { type: 'task_narration', text: verb, kind: 'progress' };
    }
  }

  if (toolName === 'python' && input && typeof input === 'object') {
    const mode = (input as { mode?: string }).mode;
    if (mode === 'inline' && typeof (input as { code?: string }).code === 'string') {
      return { type: 'task_narration', text: '运行 Python（内联）', kind: 'progress' };
    }
    if (mode === 'file' && typeof (input as { path?: string }).path === 'string') {
      return {
        type: 'task_narration',
        text: `运行脚本 ${path.basename((input as { path: string }).path)}`,
        kind: 'progress',
      };
    }
    return { type: 'task_narration', text: '运行 Python', kind: 'progress' };
  }

  return {
    type: 'task_narration',
    text: `执行 ${toolName}`,
    kind: 'progress',
  };
}

function bashVerb(command: string): string {
  const trimmed = command.trim();
  const first = trimmed.split(/\s+/)[0] ?? 'bash';
  const base = path.basename(first);
  const map: Record<string, string> = {
    python: '运行 Python（shell）',
    python3: '运行 Python（shell）',
    ls: '列出目录',
    find: '查找文件',
    grep: 'grep 搜索',
    cat: '查看文件',
    head: '读取文件头部',
    tail: '读取文件尾部',
    wc: '统计行数/字数',
    curl: '网络请求',
    bun: '运行 bun',
    node: '运行 node',
  };
  return map[base] ?? `执行 shell（${truncateTitle(trimmed, 36)}）`;
}

function narrateToolResultTail(event: Extract<AgentEvent, { type: 'tool_result' }>): string | null {
  if (event.toolName === 'plan_task') return null;
  if (!event.isError) return null;
  return `${event.toolName} 失败`;
}
