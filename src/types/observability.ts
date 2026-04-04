// /src/types/observability.ts

// 1. 轨迹追踪标志
export type TrajectoryEventKind = 
  | 'agent.turn_start'
  | 'agent.turn_end'
  | 'model.request'
  | 'model.response'
  | 'tool.call'
  | 'tool.result'
  | 'memory.prune'
  | 'exception.tripped';

// 2. 轨迹事件 Payload
export interface TrajectoryEvent {
  id: string;              // UUID
  traceId: string;         // Root Trace ID (Context)
  spanId: string;          // Current Span ID
  parentSpanId?: string;   // Nested execution structure
  kind: TrajectoryEventKind;
  timestamp: number;
  durationMs?: number;     // End event execution time
  payload: Record<string, any>; // Arbitrary telemetry (e.g. prompt size, error stack)
}

// 3. 聚合度量 DTO
export interface HealthMetricsSnapshot {
  windowStart: number;
  windowEnd: number;
  activeAgents: number;
  totalTokensConsumed: number;
  avgToolDurationMs: number;
  errorRate: number;      // Errors / Total Spans
  circuitBreakerTrips: number;
}

export interface TraceContext {
  traceId: string;
  spanId: string;
}

export interface TracingProvider {
  /** 产生新 Context 边界闭包的执行上下文 */
  withContext<T>(spanName: string, fn: () => Promise<T>): Promise<T>;

  /** 在当前 Context 下触发事件流记录 */
  recordEvent(kind: TrajectoryEventKind, payload: Record<string, any>): void;

  /** 主动测量包装函数 */
  measure<T>(kind: TrajectoryEventKind, fn: () => Promise<T>, payloadFn?: () => Record<string, any>): Promise<T>;
}

export interface TrajectoryStore {
  /** 批量刷入避免频繁写盘 */
  saveBatch(events: TrajectoryEvent[]): Promise<void>;
  
  /** 根据 Trace 抽取全链路对象 (可用于 RLHF 数据准备) */
  getTrace(traceId: string): Promise<TrajectoryEvent[]>;

  /** 查询最近时间窗口内的事件，支持指标聚合计算 */
  queryRecentEvents?(timeWindowMs: number): Promise<TrajectoryEvent[]>;

  /** 数据截断清理 */
  prune(retentionMs: number): Promise<number>;
}

export interface HealthDashboard {
  /** 实时计算时间窗窗口内运行健康度 */
  computeSnapshot(timeWindowMs: number): Promise<HealthMetricsSnapshot>;
  
  /** (Optional) 代码库扫描抽象 */
  scanCodebaseConstraints?(rootDir: string): Promise<Record<string, number>>;
}
