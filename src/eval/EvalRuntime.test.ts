// packages/kyberkit/src/eval/EvalRuntime.test.ts
import { describe, it, expect } from 'bun:test';
import { DefaultEvalRuntime } from './EvalRuntime.js';

describe('DefaultEvalRuntime', () => {
  it('runs a registered task and produces a passing report', async () => {
    const runtime = new DefaultEvalRuntime();
    runtime.register({
      task_id: 'test_pass',
      description: 'Always passes',
      run: async () => ({ passed: true, metrics: { score: 1 } }),
    });

    const report = await runtime.run({});
    expect(report.total).toBe(1);
    expect(report.passed).toBe(1);
    expect(report.failed).toBe(0);
    expect(report.results[0]?.task_id).toBe('test_pass');
    expect(report.results[0]?.result.passed).toBe(true);
  });

  it('records failure correctly', async () => {
    const runtime = new DefaultEvalRuntime();
    runtime.register({
      task_id: 'test_fail',
      description: 'Always fails',
      run: async () => ({
        passed: false,
        metrics: {},
        failure_reason: 'expected failure',
      }),
    });

    const report = await runtime.run({});
    expect(report.failed).toBe(1);
    expect(report.results[0]?.result.failure_reason).toBe('expected failure');
  });

  it('filters by task_id', async () => {
    const runtime = new DefaultEvalRuntime();
    runtime.register({ task_id: 'A', description: 'A', run: async () => ({ passed: true, metrics: {} }) });
    runtime.register({ task_id: 'B', description: 'B', run: async () => ({ passed: true, metrics: {} }) });

    const report = await runtime.run({ task_id: 'A' });
    expect(report.total).toBe(1);
    expect(report.results[0]?.task_id).toBe('A');
  });

  it('contains no pack_id concept — register() takes task_id only', () => {
    const runtime = new DefaultEvalRuntime();
    const task = {
      task_id: 'stub_T0',
      description: 'Pack registration test',
      run: async () => ({ passed: true, metrics: { registered: 1 } }),
    };
    expect(() => runtime.register(task)).not.toThrow();
  });
});
