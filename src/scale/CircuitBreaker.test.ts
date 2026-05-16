// packages/kyberkit/src/scale/CircuitBreaker.test.ts
import { describe, it, expect } from 'bun:test';
import { DefaultCircuitBreaker } from './CircuitBreaker.js';

describe('DefaultCircuitBreaker', () => {
  it('starts in closed state', () => {
    const cb = new DefaultCircuitBreaker({ resource: 'llm_api', failureThreshold: 3, resetTimeoutMs: 100 });
    expect(cb.getState()).toBe('closed');
  });

  it('remains closed after fewer failures than threshold', async () => {
    const cb = new DefaultCircuitBreaker({ resource: 'llm_api', failureThreshold: 3, resetTimeoutMs: 100 });
    const fail = () => Promise.reject(new Error('API error'));

    for (let i = 0; i < 2; i++) {
      await cb.execute(fail).catch(() => {});
    }
    expect(cb.getState()).toBe('closed');
  });

  it('opens after failureThreshold consecutive failures', async () => {
    const cb = new DefaultCircuitBreaker({ resource: 'llm_api', failureThreshold: 3, resetTimeoutMs: 1000 });
    const fail = () => Promise.reject(new Error('API error'));

    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => {});
    }
    expect(cb.getState()).toBe('open');
  });

  it('throws immediately when open (fast-fail)', async () => {
    const cb = new DefaultCircuitBreaker({ resource: 'llm_api', failureThreshold: 1, resetTimeoutMs: 10_000 });
    await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    expect(cb.getState()).toBe('open');

    let threw = false;
    await cb.execute(() => Promise.resolve('ok')).catch(() => { threw = true; });
    expect(threw).toBe(true);
  });

  it('transitions to half-open after resetTimeoutMs', async () => {
    const cb = new DefaultCircuitBreaker({ resource: 'llm_api', failureThreshold: 1, resetTimeoutMs: 50 });
    await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    expect(cb.getState()).toBe('open');

    await new Promise((r) => setTimeout(r, 60));
    expect(cb.getState()).toBe('half-open');
  });

  it('resets to closed on success in half-open state', async () => {
    const cb = new DefaultCircuitBreaker({ resource: 'llm_api', failureThreshold: 1, resetTimeoutMs: 50 });
    await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    await new Promise((r) => setTimeout(r, 60));
    expect(cb.getState()).toBe('half-open');

    await cb.execute(() => Promise.resolve('ok'));
    expect(cb.getState()).toBe('closed');
  });

  it('reset() manually closes the breaker', async () => {
    const cb = new DefaultCircuitBreaker({ resource: 'llm_api', failureThreshold: 1, resetTimeoutMs: 10_000 });
    await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
    expect(cb.getState()).toBe('open');
    cb.reset();
    expect(cb.getState()).toBe('closed');
  });
});
