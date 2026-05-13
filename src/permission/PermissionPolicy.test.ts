import { describe, it, expect } from 'bun:test';
import { classifyToolCall } from './PermissionPolicy.js';

describe('classifyToolCall', () => {
  it('marks read_file / list_dir / glob / grep as L0', () => {
    for (const name of ['read_file', 'list_dir', 'glob', 'grep']) {
      expect(classifyToolCall(name, { path: './foo' }).level).toBe('L0');
    }
  });

  it('marks write_file in workspace as L1', () => {
    const cwd = '/tmp/ws';
    const clas = classifyToolCall('write_file', { path: './reports/out.md' }, { cwd });
    expect(clas.level).toBe('L1');
    expect(clas.label).toContain('./reports/out.md');
  });

  it('marks write_file to .kyberkit as L3', () => {
    const cwd = '/tmp/ws';
    const clas = classifyToolCall('write_file', { path: '.kyberkit/config.yaml' }, { cwd });
    expect(clas.level).toBe('L3');
    expect(clas.requiresSecondConfirm).toBe(true);
  });

  it('marks write_file outside workspace as L3', () => {
    const cwd = '/tmp/ws';
    const clas = classifyToolCall('write_file', { path: '/etc/hosts' }, { cwd });
    expect(clas.level).toBe('L3');
  });

  it('marks bash with sudo as L3', () => {
    const clas = classifyToolCall('bash', { command: 'sudo apt update' });
    expect(clas.level).toBe('L3');
    expect(clas.requiresSecondConfirm).toBe(true);
  });

  it('marks bash with rm as L2', () => {
    const clas = classifyToolCall('bash', { command: 'rm -rf node_modules' });
    expect(clas.level).toBe('L2');
  });

  it('marks bash with ls as L0', () => {
    expect(classifyToolCall('bash', { command: 'ls -la' }).level).toBe('L0');
  });

  it('marks git status as L0 but git push as L2', () => {
    expect(classifyToolCall('bash', { command: 'git status' }).level).toBe('L0');
    expect(classifyToolCall('bash', { command: 'git push origin main' }).level).toBe('L2');
  });

  it('marks delete_file in workspace as L2, in .kyberkit as L3', () => {
    const cwd = '/tmp/ws';
    expect(classifyToolCall('delete_file', { path: './tmp.txt' }, { cwd }).level).toBe('L2');
    expect(classifyToolCall('delete_file', { path: '.kyberkit/foo.json' }, { cwd }).level).toBe(
      'L3',
    );
  });

  it('unknown tools default to L1 (conservative)', () => {
    expect(classifyToolCall('mystery_tool', {}).level).toBe('L1');
  });

  it('extraBashAllowlist promotes custom verbs to L0', () => {
    const clas = classifyToolCall('bash', { command: 'node --version' }, { extraBashAllowlist: ['node'] });
    expect(clas.level).toBe('L0');
  });
});
