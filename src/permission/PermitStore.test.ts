import { describe, it, expect, beforeEach } from 'bun:test';
import { join } from 'path';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { PermitStore } from './PermitStore.js';

describe('PermitStore', () => {
  let store: PermitStore;
  beforeEach(() => {
    store = new PermitStore();
  });

  it('reports 严格 mode by default', () => {
    expect(store.modeLabel()).toBe('严格');
    expect(store.check('write_file', 'L1')).toBeNull();
  });

  it('task-scope grant matches tool at level ≤ maxLevel', () => {
    store.setCurrentTask('task-1');
    store.addGrant({ scope: 'task', toolName: 'write_file', maxLevel: 'L1' });
    expect(store.check('write_file', 'L1')).toBe('task');
    expect(store.check('write_file', 'L2')).toBeNull();
    expect(store.modeLabel()).toBe('任务');
  });

  it('wildcard "*" toolName matches any tool', () => {
    store.setCurrentTask('t1');
    store.addGrant({ scope: 'session', toolName: '*', maxLevel: 'L2' });
    expect(store.check('bash', 'L2')).toBe('session');
    expect(store.check('write_file', 'L1')).toBe('session');
  });

  it('task-scope grants are evicted on onTaskComplete', () => {
    store.setCurrentTask('t1');
    store.addGrant({ scope: 'task', toolName: 'bash', maxLevel: 'L2' });
    expect(store.check('bash', 'L2')).toBe('task');
    store.onTaskComplete('t1');
    expect(store.check('bash', 'L2')).toBeNull();
  });

  it('switching to a different task evicts prior task grants', () => {
    store.setCurrentTask('t1');
    store.addGrant({ scope: 'task', toolName: 'bash', maxLevel: 'L2' });
    store.setCurrentTask('t2');
    expect(store.check('bash', 'L2')).toBeNull();
  });

  it('session + persistent grants survive task completion', () => {
    store.setCurrentTask('t1');
    store.addGrant({ scope: 'session', toolName: 'write_file', maxLevel: 'L1' });
    store.addGrant({ scope: 'persistent', toolName: 'read_file', maxLevel: 'L0' });
    store.onTaskComplete('t1');
    expect(store.check('write_file', 'L1')).toBe('session');
    expect(store.check('read_file', 'L0')).toBe('persistent');
  });

  it('clearScope removes grants and returns count', () => {
    store.setCurrentTask('t1');
    store.addGrant({ scope: 'session', toolName: 'bash', maxLevel: 'L2' });
    store.addGrant({ scope: 'session', toolName: 'write_file', maxLevel: 'L1' });
    expect(store.clearScope('session')).toBe(2);
    expect(store.check('bash', 'L2')).toBeNull();
  });

  it('snapshot returns all three scopes as copies', () => {
    store.addGrant({ scope: 'persistent', toolName: '*', maxLevel: 'L1' });
    const snap = store.snapshot();
    expect(snap.persistentGrants.length).toBe(1);
    expect(snap.taskGrants.length).toBe(0);
    expect(snap.sessionGrants.length).toBe(0);
  });

  it('persists and reloads persistent grants from yaml', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kk-perm-'));
    const path = join(dir, 'permit.yaml');
    try {
      const a = new PermitStore();
      a.setPersistencePath(path);
      a.addGrant({ scope: 'persistent', toolName: 'bash', maxLevel: 'L2', reason: 'test' });
      expect(existsSync(path)).toBe(true);
      const b = new PermitStore();
      b.setPersistencePath(path);
      b.loadFromDisk();
      expect(b.check('bash', 'L2')).toBe('persistent');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('revokePersistent removes a grant and updates file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kk-perm-'));
    const path = join(dir, 'permit.yaml');
    try {
      const a = new PermitStore();
      a.setPersistencePath(path);
      a.addGrant({ scope: 'persistent', toolName: 'bash', maxLevel: 'L2' });
      expect(a.revokePersistent('bash')).toBe(true);
      const b = new PermitStore();
      b.setPersistencePath(path);
      b.loadFromDisk();
      expect(b.check('bash', 'L2')).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
