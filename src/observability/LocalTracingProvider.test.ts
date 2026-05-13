import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LocalTracingProvider } from './LocalTracingProvider.js';
import { TrajectoryStore } from '../types/observability.js';

describe('LocalTracingProvider (Red Phase)', () => {
  let mockStore: TrajectoryStore;
  let provider: LocalTracingProvider;

  beforeEach(() => {
    mockStore = {
      saveBatch: vi.fn().mockResolvedValue(undefined),
      getTrace: vi.fn(),
      prune: vi.fn()
    };
    // set small threshold for immediate flush in tests
    provider = new LocalTracingProvider(mockStore, { flushThreshold: 2 });
  });

  it('should propagate traceContext across async boundaries', async () => {
    let capturedTraceId: string | undefined;

    await provider.withContext('test.span', async () => {
       const ctx = (provider as any).storage.getStore();
       capturedTraceId = ctx?.traceId;
       expect(ctx).toBeDefined();

       // Verify nested async operation maintains context
       await new Promise(resolve => setTimeout(resolve, 10));
       const innerCtx = (provider as any).storage.getStore();
       expect(innerCtx?.traceId).toBe(capturedTraceId);
    });

    // After context, should not leak
    expect((provider as any).storage.getStore()).toBeUndefined();
  });

  it('should flush when threshold is reached', async () => {
    await provider.withContext('span', async () => {
       provider.recordEvent('tool.execution', { toolName: 'test' });
       provider.recordEvent('tool.result', { success: true });
    });
    
    // threshold is 2, withContext automatically adds a turn_end event (or similar boundary)
    // so it should have flushed
    expect(mockStore.saveBatch).toHaveBeenCalled();
  });
  
  it('measure function should wrap and record execution', async () => {
    const wrappedFn = vi.fn().mockResolvedValue('ok');
    
    await provider.withContext('span', async () => {
      const res = await provider.measure('model.request', wrappedFn, () => ({ tokens: 100 }));
      expect(res).toBe('ok');
    });

    expect(wrappedFn).toHaveBeenCalled();
    // Verify an event was recorded (it might have flushed)
    if ((provider as any).buffer.length === 0) {
      expect(mockStore.saveBatch).toHaveBeenCalled();
    } else {
      expect((provider as any).buffer.length).toBeGreaterThan(0);
    }
  });
});
