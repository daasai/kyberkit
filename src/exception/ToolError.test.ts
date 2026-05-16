// packages/kyberkit/src/exception/ToolError.test.ts
import { describe, it, expect } from 'bun:test';
import { ToolExecutionError } from '../types/errors.js';

describe('ToolExecutionError', () => {
  it('has is_retryable field defaulting to false', () => {
    const err = new ToolExecutionError('read_file', 'File not found');
    expect(typeof err.is_retryable).toBe('boolean');
    expect(err.is_retryable).toBe(false);
  });

  it('can be created as retryable for transient errors', () => {
    const err = new ToolExecutionError('shell_exec', 'Timeout', true);
    expect(err.is_retryable).toBe(true);
  });
});
