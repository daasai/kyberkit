import { describe, it, expect } from 'bun:test';
import { PermissionSandbox } from './PermissionSandbox.js';
import { PermissionGrant } from '../types/permission.js';

describe('PermissionSandbox (M3)', () => {
  const baseGrant: PermissionGrant = {
    allowed: new Set(['read_fs', 'exec_shell']),
    denied: new Set(['write_fs']),
    allowedPaths: ['/Users/test/project']
  };

  it('should allow explicitly granted permissions', () => {
    const sandbox = new PermissionSandbox(baseGrant);
    expect(sandbox.check('read_fs').allowed).toBe(true);
    expect(sandbox.check('exec_shell').allowed).toBe(true);
  });

  it('should deny explicitly denied permissions', () => {
    const sandbox = new PermissionSandbox(baseGrant);
    const result = sandbox.check('write_fs');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('explicitly_denied');
  });

  it('should deny permissions that are not granted (default deny)', () => {
    const sandbox = new PermissionSandbox(baseGrant);
    const result = sandbox.check('read_net');
    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('not_granted');
  });

  it('should check path whitelist correctly', () => {
    const sandbox = new PermissionSandbox(baseGrant);
    expect(sandbox.checkPath('/Users/test/project/file.txt')).toBe(true);
    expect(sandbox.checkPath('/Users/test/project/sub/dir')).toBe(true);
    expect(sandbox.checkPath('/etc/passwd')).toBe(false);
    expect(sandbox.checkPath('/Users/test/other')).toBe(false);
  });

  it('should prevent path escape using ..', () => {
    const sandbox = new PermissionSandbox(baseGrant);
    expect(sandbox.checkPath('/Users/test/project/../../etc/passwd')).toBe(false);
  });

  it('should fork a sandbox with restricted permissions', () => {
    const sandbox = new PermissionSandbox(baseGrant);
    const forked = sandbox.fork({
      allowed: new Set(['read_fs']), // Further restrict to only read_fs
      denied: new Set(['exec_shell']) // Explicitly deny exec_shell
    });

    expect(forked.check('read_fs').allowed).toBe(true);
    expect(forked.check('exec_shell').allowed).toBe(false);
    expect(forked.check('exec_shell').reason).toBe('explicitly_denied');
    
    // Ensure parent is not affected
    expect(sandbox.check('exec_shell').allowed).toBe(true);
  });
});
