// packages/kyberkit/src/cli/eval.command.test.ts
import { describe, it, expect } from 'bun:test';
import { buildEvalCommand } from './eval.command.js';
import { DefaultEvalRuntime } from '../eval/EvalRuntime.js';

describe('eval.command', () => {
  it('exits 0 when all tasks pass', async () => {
    const evalRuntime = new DefaultEvalRuntime();
    evalRuntime.register({
      task_id: 'passing_task',
      description: 'Always passes',
      run: async () => ({ passed: true, metrics: { score: 1 } }),
    });

    const cmd = buildEvalCommand(evalRuntime);
    const result = await cmd.run({ ci: false });
    expect(result.exitCode).toBe(0);
    expect(result.report.passed).toBe(1);
  });

  it('exits 1 when a task fails', async () => {
    const evalRuntime = new DefaultEvalRuntime();
    evalRuntime.register({
      task_id: 'failing_task',
      description: 'Always fails',
      run: async () => ({ passed: false, metrics: {}, failure_reason: 'boom' }),
    });

    const cmd = buildEvalCommand(evalRuntime);
    const result = await cmd.run({ ci: true });
    expect(result.exitCode).toBe(1);
  });

  it('filters by --task flag', async () => {
    const evalRuntime = new DefaultEvalRuntime();
    evalRuntime.register({ task_id: 'A', description: 'A', run: async () => ({ passed: true, metrics: {} }) });
    evalRuntime.register({ task_id: 'B', description: 'B', run: async () => ({ passed: false, metrics: {}, failure_reason: 'fail' }) });

    const cmd = buildEvalCommand(evalRuntime);
    const result = await cmd.run({ taskId: 'A' });
    expect(result.report.total).toBe(1);
    expect(result.exitCode).toBe(0);
  });
});
