// packages/kyberkit/src/eval/EvalReport.ts

export interface EvalResult {
  passed: boolean;
  metrics: Record<string, number | string>;
  trace_id?: string;
  failure_reason?: string;
}

export interface EvalTaskResult {
  task_id: string;
  description: string;
  result: EvalResult;
  duration_ms: number;
}

export interface EvalReport {
  run_id: string;
  started_at: number;
  finished_at: number;
  total: number;
  passed: number;
  failed: number;
  results: EvalTaskResult[];
}
