import { describe, it, expect } from 'bun:test';
import { DefaultShellExecutor } from './ShellExecutor.js';

describe('ShellExecutor (M4.L0)', () => {
  const executor = new DefaultShellExecutor();

  it('should execute a simple command successfully', async () => {
    const result = await executor.exec('echo "hello kyber"', {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello kyber');
    expect(result.interrupted).toBe(false);
  });

  it('should capture stderr on failure', async () => {
    const result = await executor.exec('ls /non_existent_directory_kyber_test', {});
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain('No such file or directory');
  });

  it('should respect timeout and interrupt the process', async () => {
    const startTime = Date.now();
    const result = await executor.exec('sleep 5', { timeoutMs: 100 });
    const duration = Date.now() - startTime;
    
    expect(duration).toBeLessThan(1000); // Should finish well before 5s
    expect(result.interrupted).toBe(true);
  });

  it('should truncate output if it exceeds maxResultSizeChars', async () => {
    // seq 1 100000 will definitely exceed 10 chars and take enough time to be killed
    const result = await executor.exec('seq 1 100000', { maxResultSizeChars: 10 });
    expect(result.stdout.length).toBeLessThan(500); // Should be truncated
    expect(result.stdout).toContain('[output truncated]');
    expect(result.interrupted).toBe(true);
  });

  it('should correctly identify readonly commands', () => {
    expect(executor.isReadOnly('ls -la')).toBe(true);
    expect(executor.isReadOnly('grep "test" file.txt')).toBe(true);
    expect(executor.isReadOnly('rm file.ts')).toBe(false);
  });

  it('should correctly identify destructive commands', () => {
    expect(executor.isDestructive('rm -rf /')).toBe(true);
    expect(executor.isDestructive('chmod +x script.sh')).toBe(true);
    expect(executor.isDestructive('ls')).toBe(false);
  });
});
