import { spawn, ChildProcess } from 'child_process';
import { ShellExecutor, ShellOptions, ShellResult } from '../../types/tool.js';

export class DefaultShellExecutor implements ShellExecutor {
  /**
   * Execute a shell command in a sub-process.
   */
  async exec(command: string, options: ShellOptions): Promise<ShellResult> {
    const timeoutMs = options.timeoutMs ?? 30_000;
    const workingDir = options.cwd ?? process.cwd();
    const maxChars = options.maxResultSizeChars ?? 100_000;

    return new Promise((resolve, reject) => {
      if (options.signal?.aborted) {
        resolve({ stdout: '', stderr: '', exitCode: 1, interrupted: true });
        return;
      }

      // Use 'sh -c' for shell-like execution of arbitrary strings
      const child = spawn('sh', ['-c', command], {
        cwd: workingDir,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        signal: options.signal,
      });

      let stdout = '';
      let stderr = '';
      let interrupted = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;

      const onAbort = () => {
        interrupted = true;
        this.killProcess(child);
        if (timeout) clearTimeout(timeout);
        options.signal?.removeEventListener('abort', onAbort);
        resolve({ stdout, stderr, exitCode: 1, interrupted: true });
      };
      options.signal?.addEventListener('abort', onAbort, { once: true });

      timeout = setTimeout(() => {
        interrupted = true;
        this.killProcess(child);
        options.signal?.removeEventListener('abort', onAbort);
        resolve({ stdout, stderr, exitCode: 1, interrupted });
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
        if (stdout.length > maxChars) {
          stdout = stdout.slice(0, maxChars) + '\n... [output truncated]';
          interrupted = true;
          this.killProcess(child);
          resolve({ stdout, stderr, exitCode: 1, interrupted: true });
        }
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        if (stderr.length > maxChars) {
          stderr = stderr.slice(0, maxChars) + '\n... [stderr truncated]';
          interrupted = true;
          this.killProcess(child);
        }
      });

      child.on('close', (code) => {
        if (timeout) clearTimeout(timeout);
        options.signal?.removeEventListener('abort', onAbort);
        if (!interrupted) {
          resolve({ stdout, stderr, exitCode: code ?? 1, interrupted: false });
        }
      });

      child.on('error', (err) => {
        if (timeout) clearTimeout(timeout);
        options.signal?.removeEventListener('abort', onAbort);
        reject(err);
      });
    });
  }

  async execBackground(command: string, options: ShellOptions): Promise<any> {
    throw new Error('execBackground not implemented in Phase 0 Baseline.');
  }

  isReadOnly(command: string): boolean {
    const base = this.extractCommandBase(command);
    return READ_ONLY_COMMANDS.has(base);
  }

  isDestructive(command: string): boolean {
    const base = this.extractCommandBase(command);
    return DESTRUCTIVE_COMMANDS.has(base);
  }

  private extractCommandBase(command: string): string {
    return command.trim().split(/\s+/)[0] ?? '';
  }

  private killProcess(child: ChildProcess) {
    try {
      child.kill('SIGTERM');
      // Force kill after 2s if still alive
      setTimeout(() => {
        if (!child.killed) child.kill('SIGKILL');
      }, 2000);
    } catch (e) {
      console.error('[ShellExecutor] Error killing process:', e);
    }
  }
}

const READ_ONLY_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'find', 'grep', 'rg', 'ag', 'wc',
  'stat', 'file', 'tree', 'du', 'which', 'whereis', 'echo', 'pwd',
  'git log', 'git show', 'git diff', 'git status', 'git branch',
]);

const DESTRUCTIVE_COMMANDS = new Set([
  'rm', 'rmdir', 'mv', 'dd', 'mkfs', 'fdisk', 'mkswap', 'swapon',
  'chmod', 'chown', 'chgrp', 'setfacl', 'chattr',
  'init 0', 'reboot', 'shutdown',
]);
