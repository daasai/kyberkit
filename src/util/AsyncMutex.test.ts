import { describe, it, expect } from 'bun:test';
import { AsyncMutex } from './AsyncMutex.js';

describe('AsyncMutex', () => {
  it('serializes concurrent callers', async () => {
    const mutex = new AsyncMutex();
    const order: string[] = [];

    const task = (label: string, delay: number) =>
      mutex.runExclusive(async () => {
        order.push(`start-${label}`);
        await new Promise((r) => setTimeout(r, delay));
        order.push(`end-${label}`);
      });

    await Promise.all([task('A', 20), task('B', 5), task('C', 10)]);

    expect(order).toEqual([
      'start-A', 'end-A',
      'start-B', 'end-B',
      'start-C', 'end-C',
    ]);
  });

  it('releases the lock when a task throws', async () => {
    const mutex = new AsyncMutex();
    const observed: string[] = [];

    await expect(
      mutex.runExclusive(async () => {
        observed.push('first');
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');

    await mutex.runExclusive(async () => {
      observed.push('second');
    });

    expect(observed).toEqual(['first', 'second']);
  });
});
