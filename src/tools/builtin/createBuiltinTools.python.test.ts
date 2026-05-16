import { describe, it, expect, beforeEach, mock } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createBuiltinTools } from './createBuiltinTools.js';
import { PermissionSandbox } from '../../permission/PermissionSandbox.js';
import type { ShellExecutor } from '../../types/tool.js';
import type { ToolUseContext } from '../../types/tool.js';

describe('python builtin tool', () => {
  let workspace: string;
  let sandbox: PermissionSandbox;
  let shellExec: ReturnType<typeof mock>;
  let shell: ShellExecutor;

  beforeEach(() => {
    workspace = mkdtempSync(join(tmpdir(), 'kyber-python-'));
    sandbox = new PermissionSandbox({
      allowed: new Set(['read_fs', 'exec_shell']),
      denied: new Set(),
      allowedPaths: [workspace],
    });
    shellExec = mock(() =>
      Promise.resolve({ stdout: 'ok\n', stderr: '', exitCode: 0, interrupted: false }),
    );
    shell = {
      exec: shellExec,
      execBackground: mock(() => Promise.resolve({})),
      isReadOnly: () => false,
      isDestructive: () => false,
    };
  });

  const ctx = {
    agentId: 'a',
    traceId: 't',
    callId: 'c',
  } as ToolUseContext;

  it('accepts inline code without mode (defaults to inline)', async () => {
    const [python] = createBuiltinTools(shell, sandbox, workspace).filter((t) => t.name === 'python');
    const parsed = python.inputSchema.parse({ code: 'print(1)' });
    expect(parsed).toEqual({ mode: 'inline', code: 'print(1)' });
    const out = await python.call(parsed, ctx);
    expect(out.success).toBe(true);
    expect(shellExec).toHaveBeenCalled();
    const cmd = shellExec.mock.calls[0]![0] as string;
    expect(cmd).toContain('python3 ');
    expect(cmd).toContain('.kyber-inline-');
    expect(cmd).toContain('.py');
    rmSync(workspace, { recursive: true, force: true });
  });

  it('accepts explicit mode inline', async () => {
    const [python] = createBuiltinTools(shell, sandbox, workspace).filter((t) => t.name === 'python');
    const parsed = python.inputSchema.parse({ mode: 'inline', code: 'x' });
    expect(parsed.mode).toBe('inline');
    rmSync(workspace, { recursive: true, force: true });
  });

  it('accepts file path without mode when .py', async () => {
    const scriptPath = join(workspace, 'hi.py');
    writeFileSync(scriptPath, 'print(2)\n', 'utf-8');
    const [python] = createBuiltinTools(shell, sandbox, workspace).filter((t) => t.name === 'python');
    const parsed = python.inputSchema.parse({ path: 'hi.py' });
    expect(parsed).toMatchObject({ mode: 'file', path: 'hi.py' });
    await python.call(parsed, ctx);
    expect(shellExec).toHaveBeenCalled();
    rmSync(workspace, { recursive: true, force: true });
  });

  it('rejects file path that is not .py with clear error (no python3 on xlsx)', async () => {
    const [python] = createBuiltinTools(shell, sandbox, workspace).filter((t) => t.name === 'python');
    const parsed = python.inputSchema.parse({ path: 'data.xlsx' });
    expect(parsed).toMatchObject({ mode: 'file', path: 'data.xlsx' });
    const out = await python.call(parsed, ctx);
    expect(out.success).toBe(false);
    expect(out.error).toContain('.py');
    expect(shellExec).not.toHaveBeenCalled();
    rmSync(workspace, { recursive: true, force: true });
  });
});
