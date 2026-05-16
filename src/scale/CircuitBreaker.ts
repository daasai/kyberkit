// packages/kyberkit/src/scale/CircuitBreaker.ts

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerConfig {
  /** Logical name for the resource (e.g. 'llm_api', 'feishu_api', 'local_fs'). */
  resource: string;
  /** Consecutive failures before opening. Default: 3. */
  failureThreshold: number;
  /** Milliseconds to wait before probing again (half-open). Default: 30_000. */
  resetTimeoutMs: number;
  onOpen?: (resource: string, reason: string) => void;
}

export interface CircuitBreaker {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getState(): CircuitState;
  reset(): void;
}

export class DefaultCircuitBreaker implements CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private openedAt = 0;

  constructor(private readonly config: CircuitBreakerConfig) {}

  getState(): CircuitState {
    if (this.state === 'open') {
      const elapsed = Date.now() - this.openedAt;
      if (elapsed >= this.config.resetTimeoutMs) {
        this.state = 'half-open';
      }
    }
    return this.state;
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.openedAt = 0;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const current = this.getState();

    if (current === 'open') {
      throw new Error(
        `Circuit for "${this.config.resource}" is OPEN — fast-failing to prevent cascade.`,
      );
    }

    try {
      const result = await fn();
      this.failures = 0;
      if (this.state === 'half-open') {
        this.state = 'closed';
      }
      return result;
    } catch (err) {
      this.failures += 1;
      if (this.failures >= this.config.failureThreshold) {
        this.state = 'open';
        this.openedAt = Date.now();
        this.config.onOpen?.(
          this.config.resource,
          err instanceof Error ? err.message : String(err),
        );
      }
      throw err;
    }
  }
}
