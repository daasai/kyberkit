import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { TracingProvider, TrajectoryStore, TraceContext, TrajectoryEventKind, TrajectoryEvent } from '../types/observability.js';

export class LocalTracingProvider implements TracingProvider {
  private storage = new AsyncLocalStorage<TraceContext>();
  private buffer: TrajectoryEvent[] = [];
  private flushThreshold: number;

  constructor(
    private readonly store: TrajectoryStore, 
    config?: { flushThreshold?: number }
  ) {
    this.flushThreshold = config?.flushThreshold ?? 50;
  }

  async withContext<T>(spanName: string, fn: () => Promise<T>): Promise<T> {
    const parent = this.storage.getStore();
    const traceId = parent?.traceId ?? randomUUID();
    const spanId = randomUUID();

    return this.storage.run({ traceId, spanId }, async () => {
      const startTime = Date.now();
      try {
        const result = await fn();
        this.recordOuterBoundary(traceId, spanId, parent?.spanId, 'agent.turn_end', startTime, { status: 'success', spanName });
        return result;
      } catch (error: any) {
        this.recordOuterBoundary(traceId, spanId, parent?.spanId, 'agent.turn_end', startTime, { status: 'error', error: error.message });
        throw error;
      }
    });
  }

  recordEvent(kind: TrajectoryEventKind, payload: Record<string, any>): void {
    const ctx = this.storage.getStore();
    if (!ctx) return; // Ignore outer context noise

    this.buffer.push({
      id: randomUUID(),
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      kind,
      timestamp: Date.now(),
      payload
    });

    this.checkFlush();
  }

  async measure<T>(kind: TrajectoryEventKind, fn: () => Promise<T>, payloadFn?: () => Record<string, any>): Promise<T> {
    const startTime = Date.now();
    try {
      const result = await fn();
      const payload = payloadFn ? payloadFn() : {};
      this.recordEvent(kind, { ...payload, status: 'success' });
      // update duration on the latest mapped event
      if (this.buffer.length > 0) {
        this.buffer[this.buffer.length - 1].durationMs = Date.now() - startTime;
      }
      return result;
    } catch (err: any) {
      this.recordEvent(kind, { status: 'error', error: err.message });
      if (this.buffer.length > 0) {
        this.buffer[this.buffer.length - 1].durationMs = Date.now() - startTime;
      }
      throw err;
    }
  }

  private recordOuterBoundary(traceId: string, spanId: string, parentSpanId: string | undefined, kind: TrajectoryEventKind, startTime: number, payload: any) {
    this.buffer.push({
      id: randomUUID(),
      traceId,
      spanId,
      parentSpanId,
      kind,
      timestamp: Date.now(),
      durationMs: Date.now() - startTime,
      payload
    });
    this.checkFlush();
  }

  private checkFlush() {
    if (this.buffer.length >= this.flushThreshold) {
      const copy = [...this.buffer];
      this.buffer = [];
      this.store.saveBatch(copy).catch(console.error);
    }
  }
}
