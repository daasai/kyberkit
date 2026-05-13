import { describe, it, expect } from 'bun:test';
import { PermissionDeniedError, ToolValidationError, InvalidTransitionError } from './errors.js';

describe('KyberError (M1)', () => {
  it('should have correct category and code for PermissionDeniedError', () => {
    const error = new PermissionDeniedError(
      'test_tool',
      'read_fs',
      { allowed: new Set(['write_fs']), denied: new Set(['read_fs']) }
    );
    expect(error.category).toBe('permission');
    expect(error.code).toBe('PERMISSION_DENIED');
    expect(error.message).toContain('test_tool');
    expect(error.message).toContain('read_fs');
  });

  it('should have correct category and code for ToolValidationError', () => {
    const error = new ToolValidationError('test_tool', [
      { path: ['input'], message: 'Required', code: 'invalid_type' }
    ]);
    expect(error.category).toBe('validation');
    expect(error.code).toBe('TOOL_VALIDATION_FAILED');
    expect(error.message).toContain('test_tool');
    expect(error.message).toContain('Required');
  });

  it('should have correct category and code for InvalidTransitionError', () => {
    const error = new InvalidTransitionError('created', 'finish');
    expect(error.category).toBe('lifecycle');
    expect(error.code).toBe('INVALID_STATE_TRANSITION');
    expect(error.message).toContain('created');
    expect(error.message).toContain('finish');
  });
});
