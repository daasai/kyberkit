import { describe, it, expect, beforeEach } from 'bun:test';
import { mock } from 'bun:test';
import { withRetry } from './RetryStrategy.js';

describe('RetryStrategy (withRetry)', () => {
  it('should return result on first success', async () => {
    const fn = mock(async () => 'success');
    const generator = withRetry(fn, { maxAttempts: 3, backoffMs: 10, backoffMultiplier: 2 });
    
    const result = await generator.next();
    expect(result.done).toBe(true);
    expect(result.value).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and yield status', async () => {
    let callCount = 0;
    const fn = mock(async () => {
      callCount++;
      if (callCount === 1) throw new Error('fail 1');
      if (callCount === 2) throw new Error('fail 2');
      return 'success';
    });

    const generator = withRetry(fn, { maxAttempts: 3, backoffMs: 10, backoffMultiplier: 2, jitterFactor: 0 });
    
    const status1 = await generator.next();
    expect(status1.done).toBe(false);
    expect((status1.value as any).attempt).toBe(1);
    expect((status1.value as any).delayMs).toBe(10);

    const status2 = await generator.next();
    expect(status2.done).toBe(false);
    expect((status2.value as any).attempt).toBe(2);
    expect((status2.value as any).delayMs).toBe(20);

    const result = await generator.next();
    expect(result.done).toBe(true);
    expect(result.value).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should respect Retry-After header', async () => {
    let callCount = 0;
    const fn = mock(async () => {
      callCount++;
      if (callCount === 1) {
        const err = new Error('Rate limited');
        (err as any).headers = { 'retry-after': '1' };
        throw err;
      }
      return 'success';
    });

    const generator = withRetry(fn, { maxAttempts: 3, backoffMs: 1000, backoffMultiplier: 2 });
    
    const status = await generator.next();
    expect((status.value as any).delayMs).toBe(1000); // 1s from header
    
    const result = await generator.next();
    expect(result.value).toBe('success');
  });

  it('should throw after max attempts', async () => {
    const fn = mock(async () => { throw new Error('permanent fail'); });
    const generator = withRetry(fn, { maxAttempts: 2, backoffMs: 1, backoffMultiplier: 1 });
    
    await generator.next(); // attempt 1 status
    await expect(generator.next()).rejects.toThrow('permanent fail');
  });
});
