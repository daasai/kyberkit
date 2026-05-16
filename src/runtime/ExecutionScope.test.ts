import { describe, it, expect } from 'bun:test';
import type { ExecutionScope } from './ExecutionScope.js';

describe('ExecutionScope', () => {
  it('accepts required fields', () => {
    const scope: ExecutionScope = {
      workingDirectory: '/tmp/work',
      allowedPaths: ['/tmp/work'],
    };
    expect(scope.workingDirectory).toBe('/tmp/work');
    expect(scope.allowedPaths).toHaveLength(1);
  });

  it('accepts optional fields', () => {
    const scope: ExecutionScope = {
      workingDirectory: '/tmp/work',
      allowedPaths: ['/tmp/work', '/tmp/refs'],
      focusedPaths: ['/tmp/work/notes.md'],
      scopeHint: 'Research workspace',
    };
    expect(scope.focusedPaths).toBeDefined();
    expect(scope.scopeHint).toBe('Research workspace');
  });
});
