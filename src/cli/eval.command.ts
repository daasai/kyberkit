// packages/kyberkit/src/cli/eval.command.ts
import type { EvalRuntime } from '../eval/EvalRuntime.js';
import type { EvalReport } from '../eval/EvalReport.js';

export interface EvalCommandOpts {
  taskId?: string;
  filterPattern?: string;
  ci?: boolean;
  outputPath?: string;
}

export interface EvalCommandResult {
  exitCode: 0 | 1 | 2;
  report: EvalReport;
}

export function buildEvalCommand(evalRuntime: EvalRuntime) {
  return {
    async run(opts: EvalCommandOpts = {}): Promise<EvalCommandResult> {
      try {
        const filter = opts.filterPattern
          ? (t: { task_id: string }) => new RegExp(opts.filterPattern!).test(t.task_id)
          : undefined;

        const report = await evalRuntime.run({
          task_id: opts.taskId,
          filter,
        });

        if (opts.ci) {
          process.stdout.write(JSON.stringify(report, null, 2) + '\n');
        } else {
          printReport(report);
        }

        if (opts.outputPath) {
          const { writeFile } = await import('fs/promises');
          await writeFile(opts.outputPath, JSON.stringify(report, null, 2), 'utf-8');
        }

        return {
          exitCode: report.failed > 0 ? 1 : 0,
          report,
        };
      } catch (err) {
        console.error('[eval] Framework error:', err);
        return {
          exitCode: 2,
          report: {
            run_id: 'error',
            started_at: Date.now(),
            finished_at: Date.now(),
            total: 0,
            passed: 0,
            failed: 0,
            results: [],
          },
        };
      }
    },
  };
}

function printReport(report: EvalReport): void {
  const icon = (p: boolean) => (p ? '✓' : '✗');
  console.log(`\nEval run ${report.run_id}`);
  for (const r of report.results) {
    console.log(`  ${icon(r.result.passed)} [${r.task_id}] ${r.description} (${r.duration_ms}ms)`);
    if (!r.result.passed) {
      console.log(`    ↳ ${r.result.failure_reason ?? 'no reason'}`);
    }
  }
  console.log(`\nTotal: ${report.total}  Passed: ${report.passed}  Failed: ${report.failed}`);
}
