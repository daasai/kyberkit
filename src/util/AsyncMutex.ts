/**
 * AsyncMutex — minimal serializer for fire-and-forget async work.
 *
 * Queue-based; each call to runExclusive waits for the previous holder.
 * The lock is always released even if the callback throws.
 *
 * Used by Sprint 4 MemoryTriggerMiddleware to prevent two overlapping
 * SessionMemoryExtractor (or LongTermMemoryExtractor) invocations.
 */
export class AsyncMutex {
  private tail: Promise<void> = Promise.resolve();

  async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      await prev;
      return await fn();
    } finally {
      release();
    }
  }

  /** Returns true when no task is currently running or queued. */
  async isIdle(): Promise<boolean> {
    let idle = true;
    await Promise.race([
      this.tail.then(() => {
        idle = true;
      }),
      Promise.resolve().then(() => {
        idle = false;
      }),
    ]);
    return idle;
  }
}
