import { describe, it, expect } from 'bun:test';
import { PermitCommand } from './PermitCommand.js';
import { PermitStore } from '../../permission/PermitStore.js';

function run(cmd: PermitCommand, raw: string) {
  return cmd.execute({ _raw: raw });
}

describe('PermitCommand', () => {
  it('reports unavailable when no store is attached', async () => {
    const cmd = new PermitCommand(() => undefined);
    const r = await run(cmd, 'list');
    expect(r.success).toBe(false);
    expect(r.output).toContain('unavailable');
  });

  it('list prints all scopes', async () => {
    const store = new PermitStore();
    store.setCurrentTask('t1');
    store.addGrant({ scope: 'task', toolName: 'write_file', maxLevel: 'L1' });
    store.addGrant({ scope: 'session', toolName: 'bash', maxLevel: 'L2', reason: 'batch' });
    const cmd = new PermitCommand(() => store);
    const r = await run(cmd, 'list');
    expect(r.success).toBe(true);
    expect(r.output).toContain('任务级 (1)');
    expect(r.output).toContain('会话级 (1)');
    expect(r.output).toContain('持久级 (0)');
    expect(r.output).toContain('write_file');
    expect(r.output).toContain('bash');
  });

  it('clear task revokes only task grants', async () => {
    const store = new PermitStore();
    store.setCurrentTask('t1');
    store.addGrant({ scope: 'task', toolName: 'bash', maxLevel: 'L2' });
    store.addGrant({ scope: 'session', toolName: 'bash', maxLevel: 'L2' });
    const cmd = new PermitCommand(() => store);
    const r = await run(cmd, 'clear task');
    expect(r.success).toBe(true);
    expect(r.output).toContain('task 级授权 1 条');
    expect(store.check('bash', 'L2')).toBe('session');
  });

  it('clear all revokes every scope', async () => {
    const store = new PermitStore();
    store.addGrant({ scope: 'session', toolName: 'bash', maxLevel: 'L2' });
    store.addGrant({ scope: 'persistent', toolName: '*', maxLevel: 'L1' });
    const cmd = new PermitCommand(() => store);
    const r = await run(cmd, 'clear all');
    expect(r.success).toBe(true);
    expect(store.check('bash', 'L2')).toBeNull();
  });

  it('unknown subcommand returns usage', async () => {
    const cmd = new PermitCommand(() => new PermitStore());
    const r = await run(cmd, 'nope');
    expect(r.success).toBe(false);
    expect(r.output).toContain('Usage');
  });
});
