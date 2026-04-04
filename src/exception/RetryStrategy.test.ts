import { describe, it, expect, vi } from 'vitest';
import { withRetry } from './RetryStrategy.js';

describe('RetryStrategy (withRetry)', () => {
  it('should return result on first success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const generator = withRetry(fn, { maxAttempts: 3, backoffMs: 10, backoffMultiplier: 2 });
    
    // For AsyncGenerator, we need to iterate or call next()
    const result = await generator.next();
    expect(result.done).toBe(true);
    expect(result.value).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and yield status', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const generator = withRetry(fn, { maxAttempts: 3, backoffMs: 10, backoffMultiplier: 2, jitterFactor: 0 });
    
    const status1 = await generator.next();
    expect(status1.done).toBe(false);
    expect(status1.value).toMatchObject({ attempt: 1, delayMs: 10 });

    const status2 = await generator.next();
    expect(status2.done).toBe(false);
    expect(status2.value).toMatchObject({ attempt: 2, delayMs: 20 });

    const result = await generator.next();
    expect(result.done).toBe(true);
    expect(result.value).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should respect Retry-After header', async () => {
    const errorWithHeader = new Error('Rate limited');
    (errorWithHeader as any).headers = { 'retry-after': '1' }; // 1 seconds

    const fn = vi.fn()
      .mockRejectedValueOnce(errorWithHeader)
      .mockResolvedValue('success');

    const generator = withRetry(fn, { maxAttempts: 3, backoffMs: 1000, backoffMultiplier: 2 });
    
    const status = await generator.next();
    expect(status.value).toMatchObject({ delayMs: 1000 }); // 1s from header
    
    const result = await generator.next();
    expect(result.value).toBe('success');
  });

  it('should throw after max attempts', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('permanent fail'));
    const generator = withRetry(fn, { maxAttempts: 2, backoffMs: 1, backoffMultiplier: 1 });
    
    await generator.next(); // attempt 1 status
    await expect(generator.next()).rejects.toThrow('permanent fail');
  });
});
