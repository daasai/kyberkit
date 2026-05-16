// packages/kyberkit/src/eval/EvalRuntime.ts
import { randomUUID } from 'crypto';
import type { EvalReport, EvalResult, EvalTaskResult } from './EvalReport.js';
import type { ExecutionScope } from '../runtime/ExecutionScope.js';

export interface EvalContext {
  scope?: ExecutionScope;
}

export interface EvaluationTask {
  task_id: string;
  description: string;
  setup?: () => Promise<void>;
  run(ctx: EvalContext): Promise<EvalResult>;
  teardown?: () => Promise<void>;
}

export interface JudgeVerdict {
  passed: boolean;
  score: number;
  reasoning: string;
}

export interface Judge {
  evaluate(prompt: string, output: string, criteria: string): Promise<JudgeVerdict>;
}

export interface EvalRuntime {
  register(task: EvaluationTask): void;
  run(opts: {
    task_id?: string;
    filter?: (t: EvaluationTask) => boolean;
  }): Promise<EvalReport>;
  setJudge(judge: Judge): void;
}

export class DefaultEvalRuntime implements EvalRuntime {
  private tasks = new Map<string, EvaluationTask>();
  private judge: Judge | undefined;

  register(task: EvaluationTask): void {
    this.tasks.set(task.task_id, task);
  }

  setJudge(judge: Judge): void {
    this.judge = judge;
  }

  async run(opts: { task_id?: string; filter?: (t: EvaluationTask) => boolean }): Promise<EvalReport> {
    const runId = randomUUID();
    const startedAt = Date.now();

    let candidates = Array.from(this.tasks.values());
    if (opts.task_id) {
      candidates = candidates.filter((t) => t.task_id === opts.task_id);
    }
    if (opts.filter) {
      candidates = candidates.filter(opts.filter);
    }

    const results: EvalTaskResult[] = [];
    for (const task of candidates) {
      const taskStart = Date.now();
      try {
        await task.setup?.();
        const result = await task.run({});
        await task.teardown?.();
        results.push({
          task_id: task.task_id,
          description: task.description,
          result,
          duration_ms: Date.now() - taskStart,
        });
      } catch (err) {
        await task.teardown?.().catch(() => {});
        results.push({
          task_id: task.task_id,
          description: task.description,
          result: {
            passed: false,
            metrics: {},
            failure_reason: err instanceof Error ? err.message : String(err),
          },
          duration_ms: Date.now() - taskStart,
        });
      }
    }

    return {
      run_id: runId,
      started_at: startedAt,
      finished_at: Date.now(),
      total: results.length,
      passed: results.filter((r) => r.result.passed).length,
      failed: results.filter((r) => !r.result.passed).length,
      results,
    };
  }
}
