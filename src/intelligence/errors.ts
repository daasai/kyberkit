import { KyberError, ErrorCategory } from '../types/errors.js';

export class IntelligenceError extends KyberError {
  readonly category: ErrorCategory = 'internal';
}

export class WorkflowCompilationError extends IntelligenceError {
  readonly code = 'DAG_COMPILE_FAULT';
  constructor(public message: string) { super(message); }
}

export class PlanningError extends IntelligenceError {
  readonly code = 'PLANNER_PARSING_FAULT';
  constructor(public rawLLMOutput: string) { super('Failed to parse planner output'); }
}

export class ContextBudgetExceededError extends IntelligenceError {
  readonly code = 'CONTEXT_OVERFLOW_FAULT';
  constructor(public required: number, public budget: number) {
    super(`Core context requires ${required} tokens but budget is ${budget}`);
  }
}
