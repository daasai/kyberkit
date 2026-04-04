# KyberKit Phase 1 — 可靠性层 (Reliability) 实现规范

**版本**: 0.2 (CC-Aligned)
**日期**: 2026-04-01 (rev. 2026-04-01)
**依赖文档**: [design.md](./design.md) v1.2 §5, [phase0-kernel-spec.md](./phase0-kernel-spec.md)
**前置条件**: Phase 0 Kernel 全部模块 (M1-M9) 已实现并通过验收
**交付周期**: 8-10 周
**运行时**: Bun (首选) / Node.js ≥ 20 (兼容)

---

## 目录

1. [交付范围概述](#1-交付范围概述)
2. [模块分解与依赖图](#2-模块分解与依赖图)
3. [目录结构](#3-目录结构)
4. [R1 — 分层记忆系统 (Memory Store)](#4-r1--分层记忆系统)
5. [R2 — 状态快照与恢复 (Checkpoint Manager)](#5-r2--状态快照与恢复)
6. [R3 — Schema 验证器 (Schema Validator)](#6-r3--schema-验证器)
7. [R4 — 异常处理器 (Exception Handler)](#7-r4--异常处理器)
8. [R5 — 自我验证循环 (Verification Pipeline)](#8-r5--自我验证循环)
9. [Phase 0 集成改造](#9-phase-0-集成改造)
10. [实现顺序与里程碑](#10-实现顺序与里程碑)
11. [验证计划](#11-验证计划)
12. [附录 A — 核心数据流](#附录-a--核心数据流)
13. [附录 B — 外部依赖清单](#附录-b--外部依赖清单)

---

## 1. 交付范围概述

Phase 1 在 Phase 0 微内核之上构建**可靠性基础设施**，使 Agent 具备：
- 跨上下文窗口的记忆持久化能力
- 运行时状态快照与故障恢复能力
- 强类型的输入/输出 Schema 校验
- 分类化的异常处理与自动恢复策略
- 确定性的任务完成验证循环

### 1.1 Phase 1 包含 (In Scope)

| 子系统 | 模块 ID | 说明 |
|--------|---------|------|
| 分层记忆系统 | R1 | WorkingMemory + SessionMemory + LongTermMemory + 统一 MemoryStore SPI |
| 状态快照 | R2 | CheckpointManager + JSON 持久化 + 可选 Git Provider |
| Schema 验证器 | R3 | SchemaValidator + 批量校验 + Zod 集成 |
| 异常处理器 | R4 | ExceptionHandler + ErrorCategory 策略注册 + 自动恢复 |
| 自我验证循环 | R5 | VerificationPipeline + 加密完成令牌 + 阻断/非阻断步骤 |

### 1.2 Phase 1 不包含 (Out of Scope)

- OpenTelemetry 集成 → Phase 2
- 轨迹数据仓库 (TrajectoryStore) → Phase 2
- 上下文压缩 (LLM-based) → Phase 3
- 多 Agent 编排 → Phase 4
- Vector DB 后端 → Phase 3+（R1 仅实现 JSON/SQLite 后端）

### 1.3 与 Phase 0 的集成点

Phase 1 **不是独立的**，它需要改造 Phase 0 已有模块：

| Phase 0 模块 | 改造内容 |
|-------------|---------|
| `AgentInstance` (M6) | 将 `messages: Array` 替换为 `WorkingMemory` + `SessionMemory` 引用 |
| `AgentLoop` (M6) | 接入 `ExceptionHandler` 替代裸 try/catch；接入 `VerificationPipeline` 替代硬编码 `verified` |
| `KyberRuntime` (M8) | bootstrap 序列中初始化 R1-R5 模块；暴露 `getMemoryStore()` / `getCheckpointManager()` |
| `KyberConfig` (M7) | 扩展 YAML Schema：`memory` / `checkpoint` / `verification` 配置段 |
| `KyberEvents` (M1) | 新增 `memory.*` / `checkpoint.*` / `verification.*` 事件类型 |

### 1.4 MVP 验收场景

```
Agent 执行多轮对话任务
→ 中间状态通过 SessionMemory 持久化到 progress.json
→ 模拟进程崩溃，重启后从 Checkpoint 恢复
→ Agent 从断点继续执行，无信息丢失
→ 任务完成时 VerificationPipeline 执行 2 个验证步骤
→ 验证通过后返回加密 completionToken
→ 整个过程中工具调用的输入/输出通过 SchemaValidator 校验
→ 遇到瞬态网络异常时 ExceptionHandler 自动 retry（最多 3 次）
```

---

## 2. 模块分解与依赖图

```
                    ┌──────────────────────────────────┐
                    │  M8: KyberRuntime (改造)          │
                    │  + 初始化 R1-R5                   │
                    └──┬──┬──┬──┬──┬───────────────────┘
                       │  │  │  │  │
        ┌──────────────┘  │  │  │  └──────────────┐
        │                 │  │  │                  │
   ┌────▼────┐   ┌───────▼──▼──▼────────┐   ┌────▼────┐
   │ R5:     │   │ M6: AgentLoop (改造)  │   │ R4:     │
   │ Verify  │◄──┤ + ExceptionHandler   │──►│Exception│
   │Pipeline │   │ + VerificationPipe   │   │Handler  │
   └────┬────┘   └──────────┬───────────┘   └────┬────┘
        │                   │                     │
        │           ┌───────▼───────┐             │
        │           │ R1: Memory    │             │
        │           │ Store         │             │
        │           │ (3-tier)      │             │
        │           └──┬────────┬──┘             │
        │              │        │                 │
        │       ┌──────▼──┐ ┌──▼──────┐          │
        │       │ R2:     │ │ R3:     │          │
        │       │Checkpoint│ │ Schema  │          │
        │       │Manager  │ │Validator│          │
        │       └─────────┘ └─────────┘          │
        │                                         │
   ┌────▼─────────────────────────────────────────▼────┐
   │              Phase 0: M1-M5 (Types, Events,       │
   │              Permission, Tools, Model)             │
   └───────────────────────────────────────────────────┘
```

**依赖规则**：
- R1-R5 仅依赖 Phase 0 的 M1 (Types) 和 M2 (EventBus)
- R1, R2 之间有弱依赖：CheckpointManager 使用 MemoryStore 做快照源
- R3 为无状态工具，零依赖（仅 Zod）
- R4 依赖 M2 EventBus 发布异常事件
- R5 依赖 R3 进行验证结果校验

---

## 3. 目录结构

```
kyberkit/src/
├── memory/                              # R1: 分层记忆系统
│   ├── MemoryStore.ts                   #   统一 SPI 抽象层
│   ├── WorkingMemory.ts                 #   易失性工作记忆 (内存)
│   ├── SessionMemory.ts                 #   半持久化会话记忆 (JSON)
│   ├── LongTermMemory.ts               #   持久化长期记忆 (SQLite)
│   ├── EvictionPolicy.ts               #   淘汰策略实现 (LRU/TTL/Capacity)
│   ├── MemoryStore.test.ts
│   ├── SessionMemory.test.ts
│   └── LongTermMemory.test.ts
│
├── checkpoint/                          # R2: 状态快照
│   ├── CheckpointManager.ts            #   快照管理器
│   ├── JsonCheckpointProvider.ts       #   JSON 文件持久化
│   ├── GitCheckpointProvider.ts        #   可选 Git 版本化
│   ├── CheckpointManager.test.ts
│   └── JsonCheckpointProvider.test.ts
│
├── validation/                          # R3: Schema 验证器
│   ├── SchemaValidator.ts              #   全局 Schema 注册 + 校验
│   └── SchemaValidator.test.ts
│
├── exception/                           # R4: 异常处理器
│   ├── ExceptionHandler.ts             #   策略注册 + 异常路由
│   ├── RetryStrategy.ts                #   指数退避重试
│   ├── RecoveryStrategies.ts           #   各类恢复策略实现
│   ├── ExceptionHandler.test.ts
│   └── RetryStrategy.test.ts
│
├── verification/                        # R5: 自我验证循环
│   ├── VerificationPipeline.ts         #   验证流水线
│   ├── CompletionToken.ts              #   加密完成令牌生成/校验
│   ├── BuiltinVerifiers.ts             #   内置验证步骤
│   ├── VerificationPipeline.test.ts
│   └── CompletionToken.test.ts
│
├── types/                               # M1 扩展
│   ├── memory.ts                       #   [NEW] 记忆系统类型
│   ├── checkpoint.ts                   #   [NEW] 快照类型
│   ├── verification.ts                 #   [NEW] 验证类型
│   └── events.ts                       #   [MODIFY] 新增 Phase 1 事件
```

---

## 4. R1 — 分层记忆系统

### 4.1 类型定义

```typescript
// src/types/memory.ts

// ============================================================
// [C2] Closed Memory Category Taxonomy (borrowed from CC memoryTypes.ts)
// Replaces free-form tags with a deterministic enum.
// Each category has explicit when_to_save / how_to_use semantics.
// ============================================================

/**
 * MemoryCategory — closed taxonomy for LongTermMemory entries.
 * Derived from CC's proven 4-type system (memdir/memoryTypes.ts).
 *
 * - user:      User profile (preferences, skill level, communication style)
 * - feedback:  Behavioral corrections (positive/negative corrections from user)
 * - project:   Project context (architecture decisions, conventions, non-code knowledge)
 * - reference: External system index (API endpoints, doc links, tool configs)
 */
export type MemoryCategory = 'user' | 'feedback' | 'project' | 'reference';

/**
 * MemoryEntry is the atomic unit stored in any memory tier.
 */
export interface MemoryEntry<T = unknown> {
  readonly id: string;
  content: T;
  metadata: MemoryMetadata;
}

export interface MemoryMetadata {
  createdAt: number;
  updatedAt: number;
  accessCount: number;
  lastAccessedAt: number;
  source: 'agent' | 'user' | 'system';
  /** [C2] Closed category enum replaces free-form tags */
  category: MemoryCategory;
  /** Optional secondary tags for sub-classification within a category */
  tags?: string[];
  /** Byte size estimate for capacity-based eviction */
  sizeBytes?: number;
  /** [N4] Drift caveat — memory may be stale, verify before trusting */
  driftCaveat?: string;
}

// ============================================================
// [I1] Structured Session Memory Template (borrowed from CC SessionMemory/prompts.ts)
// Fixed-section Markdown template with per-section token limits.
// ============================================================

/** Names of the fixed sections in a SessionMemory template. */
export type SessionMemorySection =
  | 'current_state'
  | 'task_specification'
  | 'files_and_functions'
  | 'workflow'
  | 'errors_and_corrections'
  | 'learnings'
  | 'key_results'
  | 'worklog';

export interface SessionMemoryTemplate {
  /** Section name → section header + description */
  sections: Record<SessionMemorySection, { header: string; description: string }>;
  /** Per-section token limit (default 2000) */
  maxSectionTokens: number;
  /** Global token budget for entire session memory (default 12000) */
  maxTotalTokens: number;
}

// ============================================================
// [C1] Token-Threshold Flush Trigger Config (borrowed from CC sessionMemory.ts)
// Dual-dimension trigger: token consumption + tool call frequency.
// ============================================================

export interface SessionFlushTrigger {
  /** Flush when context token count exceeds this threshold */
  tokenThreshold: number;
  /** Minimum tool calls since last flush before threshold triggers */
  toolCallThreshold: number;
  /** Fallback: flush after this many ms of inactivity regardless */
  debounceMs: number;
}

/**
 * MemoryQuery for filtering entries during read operations.
 */
export interface MemoryQuery {
  /** [C2] Filter by category */
  category?: MemoryCategory;
  /** Filter by tags (AND logic) */
  tags?: string[];
  /** Filter by source */
  source?: 'agent' | 'user' | 'system';
  /** Filter by creation time range */
  createdAfter?: number;
  createdBefore?: number;
  /** Maximum number of entries to return */
  limit?: number;
  /** Sort order */
  orderBy?: 'createdAt' | 'updatedAt' | 'lastAccessedAt' | 'accessCount';
  orderDirection?: 'asc' | 'desc';
}

/**
 * MemorySnapshot captures the entire state of a memory tier
 * for serialization/restoration.
 */
export interface MemorySnapshot<T = unknown> {
  tierId: string;
  entries: MemoryEntry<T>[];
  timestamp: number;
  checksum: string;
}

/**
 * EvictionPolicy defines the rules for automatic entry removal.
 */
export type EvictionPolicy =
  | { type: 'lru'; maxEntries: number }
  | { type: 'ttl'; maxAgeMs: number }
  | { type: 'capacity'; maxSizeBytes: number }
  | { type: 'composite'; policies: EvictionPolicy[] };

/**
 * MemoryStore<T> is the unified SPI for all memory tiers.
 */
export interface MemoryStore<T = unknown> {
  readonly tierId: string;
  read(query: MemoryQuery): Promise<MemoryEntry<T>[]>;
  write(entry: MemoryEntry<T>): Promise<void>;
  update(id: string, patch: Partial<T>): Promise<void>;
  delete(id: string): Promise<boolean>;
  evict(policy: EvictionPolicy): Promise<number>;
  snapshot(): Promise<MemorySnapshot<T>>;
  restore(snapshot: MemorySnapshot<T>): Promise<void>;
  count(): Promise<number>;
  clear(): Promise<void>;
}
```

### 4.2 WorkingMemory 实现 (易失性)

```typescript
// src/memory/WorkingMemory.ts

/**
 * WorkingMemory is an in-memory store for the current inference context.
 * Lifecycle = single inference call. No persistence.
 * 
 * Design: Uses a Map<string, MemoryEntry<T>> as backing store.
 * Eviction: LRU only (no TTL needed for volatile store).
 */
export class WorkingMemory<T = unknown> implements MemoryStore<T> {
  readonly tierId = 'working';
  private store = new Map<string, MemoryEntry<T>>();

  async read(query: MemoryQuery): Promise<MemoryEntry<T>[]> {
    let entries = [...this.store.values()];
    entries = applyFilters(entries, query);
    entries = applySort(entries, query);
    if (query.limit) entries = entries.slice(0, query.limit);
    // Update access metadata
    for (const entry of entries) {
      entry.metadata.accessCount++;
      entry.metadata.lastAccessedAt = Date.now();
    }
    return entries;
  }

  async write(entry: MemoryEntry<T>): Promise<void> {
    this.store.set(entry.id, entry);
  }

  async update(id: string, patch: Partial<T>): Promise<void> {
    const entry = this.store.get(id);
    if (!entry) return;
    entry.content = { ...entry.content, ...patch } as T;
    entry.metadata.updatedAt = Date.now();
  }

  async delete(id: string): Promise<boolean> {
    return this.store.delete(id);
  }

  async evict(policy: EvictionPolicy): Promise<number> {
    return executeEviction(this.store, policy);
  }

  async snapshot(): Promise<MemorySnapshot<T>> {
    const entries = [...this.store.values()];
    return {
      tierId: this.tierId,
      entries,
      timestamp: Date.now(),
      checksum: computeChecksum(entries),
    };
  }

  async restore(snapshot: MemorySnapshot<T>): Promise<void> {
    this.store.clear();
    for (const entry of snapshot.entries) {
      this.store.set(entry.id, entry);
    }
  }

  async count(): Promise<number> { return this.store.size; }
  async clear(): Promise<void> { this.store.clear(); }
}
```

### 4.3 SessionMemory 实现 (JSON 持久化)

> **CC 对标**: `services/SessionMemory/sessionMemory.ts` + `history.ts`
> **变更**: [C1] token 阈值触发, [I1] 结构化模板, [I2] pending buffer + lock + cleanup

```typescript
// src/memory/SessionMemory.ts

/**
 * SessionMemory persists across context windows within a single task.
 * Storage backend: JSON file (progress.json).
 *
 * [C1] Flush Trigger: Dual-dimension (token consumption + tool call frequency),
 *      borrowed from CC's sessionMemory.ts threshold logic.
 * [I1] Content Structure: Fixed-section Markdown template with per-section
 *      token limits, borrowed from CC's SessionMemory/prompts.ts.
 * [I2] Write Safety: Pending buffer + file lock + process exit cleanup hook,
 *      borrowed from CC's history.ts 3-phase write pattern.
 */
export class SessionMemory<T = unknown> implements MemoryStore<T> {
  readonly tierId = 'session';
  private store = new Map<string, MemoryEntry<T>>();

  // --- [I2] Pending Buffer (borrowed from CC history.ts) ---
  private pendingWrites: MemoryEntry<T>[] = [];
  private flushInProgress = false;
  private static readonly MAX_FLUSH_RETRIES = 5;

  // --- [C1] Token-Threshold Trigger State ---
  private tokensSinceLastFlush = 0;
  private toolCallsSinceLastFlush = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private cleanupRegistered = false;

  constructor(
    private readonly filePath: string,
    private readonly trigger: SessionFlushTrigger = {
      tokenThreshold: 50_000,   // ~40% of 128k context window
      toolCallThreshold: 3,
      debounceMs: 1000,
    },
    private readonly template?: SessionMemoryTemplate,
  ) {}

  /** Load from disk on first access */
  async initialize(): Promise<void> {
    try {
      const raw = await readFile(this.filePath, 'utf-8');
      const data: MemorySnapshot<T> = JSON.parse(raw);
      if (data.checksum !== computeChecksum(data.entries)) {
        throw new Error('SessionMemory checksum mismatch — data corrupted');
      }
      for (const entry of data.entries) {
        this.store.set(entry.id, entry);
      }
    } catch (err: any) {
      if (err.code !== 'ENOENT') throw err;
    }
    // [I2] Register process-exit cleanup hook (borrowed from CC history.ts)
    if (!this.cleanupRegistered) {
      this.cleanupRegistered = true;
      process.on('beforeExit', () => this.forceFlush());
      process.on('SIGINT', () => { this.forceFlush(); process.exit(130); });
      process.on('SIGTERM', () => { this.forceFlush(); process.exit(143); });
    }
  }

  async write(entry: MemoryEntry<T>): Promise<void> {
    this.store.set(entry.id, entry);
    this.pendingWrites.push(entry);
    this.scheduleFlush();
  }

  /**
   * [C1] Notify SessionMemory of context token and tool call increments.
   * Called by AgentLoop after each model response / tool execution.
   */
  notifyTokenUsage(deltaTokens: number, deltaToolCalls: number): void {
    this.tokensSinceLastFlush += deltaTokens;
    this.toolCallsSinceLastFlush += deltaToolCalls;
  }

  /**
   * [C1] Dual-dimension flush trigger (borrowed from CC sessionMemory.ts).
   * shouldFlush = (hasMetTokenThreshold && hasMetToolCallThreshold)
   *            || (hasMetTokenThreshold && noToolCallsInLastTurn)
   */
  shouldFlush(): boolean {
    const metToken = this.tokensSinceLastFlush >= this.trigger.tokenThreshold;
    const metTools = this.toolCallsSinceLastFlush >= this.trigger.toolCallThreshold;
    return metToken && (metTools || this.toolCallsSinceLastFlush === 0);
  }

  /**
   * [I2] Flush to disk with write-then-rename atomicity + file lock.
   * Retry up to MAX_FLUSH_RETRIES on transient I/O errors.
   */
  async flush(): Promise<void> {
    if (this.pendingWrites.length === 0) return;
    if (this.flushInProgress) return;
    this.flushInProgress = true;
    try {
      const snap = await this.snapshot();
      const tmpPath = `${this.filePath}.tmp.${Date.now()}`;
      // Atomic write: write to temp file, then rename (crash-safe)
      await writeFile(tmpPath, JSON.stringify(snap, null, 2), 'utf-8');
      await rename(tmpPath, this.filePath);
      // Reset counters on successful flush
      this.pendingWrites = [];
      this.tokensSinceLastFlush = 0;
      this.toolCallsSinceLastFlush = 0;
    } finally {
      this.flushInProgress = false;
    }
  }

  /** [I2] Synchronous force-flush on process exit */
  private forceFlush(): void {
    if (this.pendingWrites.length === 0) return;
    try {
      const snap = this.snapshotSync();
      writeFileSync(this.filePath, JSON.stringify(snap, null, 2), 'utf-8');
      this.pendingWrites = [];
    } catch { /* swallow on exit — best effort */ }
  }

  /**
   * [I1] Truncate session memory sections that exceed per-section token limit.
   * Borrowed from CC SessionMemory/prompts.ts truncateSessionMemoryForCompact().
   */
  truncateToTemplate(): void {
    if (!this.template) return;
    // Per-section token truncation logic
    // Ensures no single section exceeds template.maxSectionTokens
    // and total does not exceed template.maxTotalTokens
  }

  private scheduleFlush(): void {
    if (this.shouldFlush()) {
      // Threshold met — flush immediately
      void this.flush();
      return;
    }
    // Fallback: debounce timer
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(async () => {
        this.flushTimer = null;
        await this.flush();
      }, this.trigger.debounceMs);
    }
  }

  // read(), delete(), evict(), snapshot(), restore(), count(), clear()
  // ... same pattern as WorkingMemory, omitted for brevity
}
```

### 4.4 LongTermMemory 实现 (SQLite)

```typescript
// src/memory/LongTermMemory.ts

/**
 * LongTermMemory provides persistent storage across tasks and sessions.
 * Storage backend: SQLite via better-sqlite3 (synchronous, zero-config).
 *
 * Table schema:
 *   CREATE TABLE memory (
 *     id TEXT PRIMARY KEY,
 *     content TEXT NOT NULL,          -- JSON serialized
 *     created_at INTEGER NOT NULL,
 *     updated_at INTEGER NOT NULL,
 *     access_count INTEGER DEFAULT 0,
 *     last_accessed_at INTEGER,
 *     source TEXT NOT NULL,
 *     tags TEXT,                       -- JSON array
 *     size_bytes INTEGER
 *   );
 * 
 * Phase 1 Scope: CRUD + eviction. 
 * Full-text search and vector embedding deferred to Phase 3.
 */
export class LongTermMemory<T = unknown> implements MemoryStore<T> {
  readonly tierId = 'longterm';
  private db: Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.exec(SCHEMA_SQL);
  }

  async read(query: MemoryQuery): Promise<MemoryEntry<T>[]> {
    const { sql, params } = buildSelectQuery(query);
    const rows = this.db.prepare(sql).all(...params);
    return rows.map(deserializeRow<T>);
  }

  async write(entry: MemoryEntry<T>): Promise<void> {
    this.db.prepare(INSERT_SQL).run(serializeEntry(entry));
  }

  async evict(policy: EvictionPolicy): Promise<number> {
    // LRU: DELETE FROM memory WHERE id IN (
    //   SELECT id FROM memory ORDER BY last_accessed_at ASC LIMIT (count - maxEntries)
    // )
    // TTL: DELETE FROM memory WHERE updated_at < (now - maxAgeMs)
    // Capacity: DELETE FROM memory WHERE id IN (...) ORDER BY size_bytes DESC
    const { sql, params } = buildEvictionQuery(policy, await this.count());
    const result = this.db.prepare(sql).run(...params);
    return result.changes;
  }

  // ... snapshot(), restore() serialize entire table to/from MemorySnapshot
}
```

### 4.5 一致性规则

```
优先级: WorkingMemory > SessionMemory > LongTermMemory
```

当相同 `id` 的 entry 存在于多个 tier 时，**高 tier 的数据优先**（时间局部性原则）。
此逻辑封装在 `MemoryStore` 的聚合读取方法中：

```typescript
// src/memory/MemoryStore.ts

export class TieredMemoryFacade<T = unknown> {
  constructor(
    private readonly working: WorkingMemory<T>,
    private readonly session: SessionMemory<T>,
    private readonly longterm: LongTermMemory<T>,
  ) {}

  /**
   * Read across all tiers with deduplication.
   * Higher tier wins on id conflict.
   */
  async readAcrossTiers(query: MemoryQuery): Promise<MemoryEntry<T>[]> {
    const seen = new Set<string>();
    const results: MemoryEntry<T>[] = [];

    // Working > Session > LongTerm
    for (const tier of [this.working, this.session, this.longterm]) {
      const entries = await tier.read(query);
      for (const entry of entries) {
        if (!seen.has(entry.id)) {
          seen.add(entry.id);
          results.push(entry);
        }
      }
    }
    return results;
  }

  /** Promote entry to a higher tier */
  async promote(id: string, from: MemoryStore<T>, to: MemoryStore<T>): Promise<void> {
    const entries = await from.read({ limit: 1 });
    const entry = entries.find(e => e.id === id);
    if (entry) {
      await to.write(entry);
    }
  }
}
```

### 4.6 验收标准

- [ ] WorkingMemory: 写入 100 个 entry → LRU evict(maxEntries=50) → 保留最近访问的 50 个
- [ ] SessionMemory: write() → flush() → 重新 initialize() → 数据一致
- [ ] SessionMemory: checksum 校验失败时抛出明确异常
- [ ] LongTermMemory: CRUD 操作对 SQLite 的正确性 (10+ test cases)
- [ ] LongTermMemory: TTL eviction 正确删除过期 entry
- [ ] TieredMemoryFacade: 跨 tier 读取时高 tier 优先去重
- [ ] 全部 eviction 策略 (LRU/TTL/Capacity/Composite) 独立单元测试

---

## 5. R2 — 状态快照与恢复

### 5.1 类型定义

> **CC 对标**: `utils/conversationRecovery.ts` + `utils/sessionRestore.ts`
> **变更**: [C3] 原子写入, [C4] 中断分类与自动恢复

```typescript
// src/types/checkpoint.ts

export type CheckpointId = string;

// ============================================================
// [C4] Turn Interruption State (borrowed from CC conversationRecovery.ts)
// Precisely classifies how a session was interrupted.
// ============================================================

/**
 * Classifies how the agent session was interrupted.
 * Borrowed from CC's TurnInterruptionState (conversationRecovery.ts:139-141).
 *
 * - none:               Normal completion, no interruption.
 * - interrupted_prompt:  User sent a message but agent never responded.
 * - interrupted_turn:    Agent was mid-execution (tool call in progress) when killed.
 */
export type TurnInterruptionState =
  | { kind: 'none' }
  | { kind: 'interrupted_prompt'; lastUserMessage: { role: string; content: unknown } }
  | { kind: 'interrupted_turn'; lastToolCallId?: string };

export interface AgentState {
  agentId: string;
  status: AgentStatus;
  /** SessionMemory 的完整快照 */
  sessionSnapshot: MemorySnapshot;
  /** 当前任务进度 */
  taskProgress: TaskProgress;
  /** [C4] 工具层状态 — 结构化的 MCP 连接、权限缓存等可恢复状态 */
  toolState: {
    mcpConnections: Array<{ serverId: string; state: 'connected' | 'disconnected' }>;
    permissionCache: Record<string, boolean>;
    [key: string]: unknown;
  };
  /** 消息历史 (WorkingMemory dump) */
  messages: Array<{ role: string; content: unknown }>;
  /** [C4] Interruption classification at save time */
  interruptionState: TurnInterruptionState;
  timestamp: number;
  checksum: string;
}

export interface TaskProgress {
  totalSteps: number;
  completedSteps: number;
  currentStep: string;
  startedAt: number;
  /** 结构化的中间成果物（文件路径、生成内容等） */
  artifacts: Record<string, unknown>;
}

export interface CheckpointInfo {
  id: CheckpointId;
  agentId: string;
  timestamp: number;
  description?: string;
  sizeBytes: number;
}

export interface RetentionPolicy {
  /** 最大保留快照数 */
  maxSnapshots: number;
  /** 最大保留时间 (ms) */
  maxAgeMs?: number;
}

export interface CheckpointProvider {
  save(state: AgentState): Promise<CheckpointId>;
  restore(checkpointId: CheckpointId): Promise<AgentState>;
  list(agentId: string): Promise<CheckpointInfo[]>;
  delete(checkpointId: CheckpointId): Promise<void>;
  prune(policy: RetentionPolicy): Promise<number>;
}
```

### 5.2 JsonCheckpointProvider 实现

```typescript
// src/checkpoint/JsonCheckpointProvider.ts

/**
 * Default checkpoint provider using JSON files.
 * Storage layout:
 *   .kyberkit/checkpoints/
 *   ├── {agentId}/
 *   │   ├── {checkpointId}.json
 *   │   ├── {checkpointId}.json
 *   │   └── ...
 *   └── ...
 *
 * CheckpointId format: "{timestamp}-{short-uuid}" for natural sorting.
 */
export class JsonCheckpointProvider implements CheckpointProvider {
  constructor(private readonly baseDir: string) {}

  /**
   * [C3] Atomic save via write-then-rename.
   * Prevents data corruption if process crashes mid-write.
   * Borrowed from CC's atomic write patterns.
   */
  async save(state: AgentState): Promise<CheckpointId> {
    const id = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
    const dir = join(this.baseDir, state.agentId);
    await mkdir(dir, { recursive: true });

    const checksum = computeChecksum(state);
    const data: AgentState = { ...state, checksum };

    const targetPath = join(dir, `${id}.json`);
    const tmpPath = `${targetPath}.tmp`;
    // Write to temp file first, then atomic rename
    await writeFile(tmpPath, JSON.stringify(data, null, 2));
    await rename(tmpPath, targetPath);
    return id;
  }

  async restore(checkpointId: CheckpointId): Promise<AgentState> {
    // Scan all agent dirs to find the checkpoint file
    const filePath = await this.findCheckpointFile(checkpointId);
    const raw = await readFile(filePath, 'utf-8');
    const state: AgentState = JSON.parse(raw);
    
    // Verify integrity
    const expected = state.checksum;
    const actual = computeChecksum({ ...state, checksum: '' });
    if (expected !== actual) {
      throw new CheckpointCorruptedError(checkpointId, expected, actual);
    }
    return state;
  }

  async prune(policy: RetentionPolicy): Promise<number> {
    let pruned = 0;
    const agentDirs = await readdir(this.baseDir);
    for (const agentDir of agentDirs) {
      const checkpoints = await this.list(agentDir);
      const sorted = checkpoints.sort((a, b) => b.timestamp - a.timestamp);
      
      for (let i = policy.maxSnapshots; i < sorted.length; i++) {
        await this.delete(sorted[i].id);
        pruned++;
      }
      
      if (policy.maxAgeMs) {
        const cutoff = Date.now() - policy.maxAgeMs;
        for (const cp of sorted) {
          if (cp.timestamp < cutoff) {
            await this.delete(cp.id);
            pruned++;
          }
        }
      }
    }
    return pruned;
  }

  // list(), delete() ... standard file system operations
}
```

### 5.3 CheckpointManager (编排层)

```typescript
// src/checkpoint/CheckpointManager.ts

/**
 * CheckpointManager orchestrates checkpoint creation and restoration.
 * It coordinates between the AgentInstance, MemoryStore, and CheckpointProvider.
 */
export class CheckpointManager {
  constructor(
    private readonly provider: CheckpointProvider,
    private readonly eventBus: TypedEventBus<KyberEvents>,
    private readonly retentionPolicy: RetentionPolicy = { maxSnapshots: 10 },
  ) {}

  /**
   * Captures the current state of an agent into a checkpoint.
   * Called at strategic points: before risky operations, periodically, on pause.
   */
  async save(agent: DefaultAgentInstance, session: SessionMemory): Promise<CheckpointId> {
    const sessionSnapshot = await session.snapshot();
    const state: AgentState = {
      agentId: agent.id,
      status: agent.status,
      sessionSnapshot,
      taskProgress: agent.taskProgress ?? { totalSteps: 0, completedSteps: 0, currentStep: '', startedAt: Date.now(), artifacts: {} },
      toolState: {},
      messages: agent.messages,
      timestamp: Date.now(),
      checksum: '', // Computed during provider.save()
    };

    const id = await this.provider.save(state);
    this.eventBus.emit('checkpoint.saved', { agentId: agent.id, checkpointId: id });

    // Auto-prune old checkpoints
    await this.provider.prune(this.retentionPolicy);

    return id;
  }

  /**
   * [C4] Restores an agent to a previously saved checkpoint.
   * Detects interruption state and injects continuation message if needed.
   * Borrowed from CC's deserializeMessagesWithInterruptDetection().
   */
  async restore(checkpointId: CheckpointId, agent: DefaultAgentInstance, session: SessionMemory): Promise<void> {
    const state = await this.provider.restore(checkpointId);

    // Restore session memory
    await session.restore(state.sessionSnapshot);

    // Restore agent messages
    agent.messages = state.messages as any;

    // Restore task progress
    agent.taskProgress = state.taskProgress;

    // [C4] Handle interruption-based auto-recovery
    if (state.interruptionState.kind === 'interrupted_turn') {
      // Agent was mid-tool-call — inject synthetic continuation message
      agent.messages.push({
        role: 'user',
        content: 'Continue from where you left off.',
      } as any);
      this.eventBus.emit('checkpoint.auto_continued', {
        agentId: agent.id, checkpointId, reason: 'interrupted_turn',
      });
    } else if (state.interruptionState.kind === 'interrupted_prompt') {
      // User sent message but agent never responded — replay user message
      this.eventBus.emit('checkpoint.auto_continued', {
        agentId: agent.id, checkpointId, reason: 'interrupted_prompt',
      });
    }

    this.eventBus.emit('checkpoint.restored', { agentId: agent.id, checkpointId });
  }
}
```

### 5.4 验收标准

- [ ] save() → restore() 往返一致性 (Round-trip integrity)
- [ ] 损坏的 checkpoint (修改 JSON 内容) → 抛出 `CheckpointCorruptedError`
- [ ] prune(maxSnapshots=3) 后目录中最多保留 3 个文件
- [ ] prune(maxAgeMs=1000) 等待 1.5s 后执行 → 过期文件被删除
- [ ] 并发 save() 不会产生文件冲突 (timestamp-uuid 命名保证)
- [ ] [C3] save() 执行 write-then-rename — 模拟写入中断后旧文件无损
- [ ] [C4] restore() 对 `interrupted_turn` 状态自动注入 continuation 消息
- [ ] [C4] restore() 对 `interrupted_prompt` 状态触发 `auto_continued` 事件
- [ ] [C4] restore() 对 `none` 状态不注入任何额外消息

---

## 6. R3 — Schema 验证器

### 6.1 实现

```typescript
// src/validation/SchemaValidator.ts

import { z, ZodType, ZodError } from 'zod';

export interface SchemaValidationResult<T = unknown> {
  success: boolean;
  data?: T;
  errors?: SchemaValidationError[];
}

export interface SchemaValidationError {
  path: (string | number)[];
  message: string;
  code: string;
  expected?: string;
  received?: string;
}

/**
 * SchemaValidator provides a global registry for Zod schemas
 * and validates data against them.
 * 
 * Usage: Register once during bootstrap, validate everywhere.
 */
export class SchemaValidator {
  private schemas = new Map<string, ZodType>();

  register(name: string, schema: ZodType): void {
    if (this.schemas.has(name)) {
      throw new Error(`Schema "${name}" already registered. Use override=true to replace.`);
    }
    this.schemas.set(name, schema);
  }

  validate<T>(name: string, data: unknown): SchemaValidationResult<T> {
    const schema = this.schemas.get(name);
    if (!schema) {
      return { success: false, errors: [{ path: [], message: `Schema "${name}" not found`, code: 'SCHEMA_NOT_FOUND' }] };
    }
    const result = schema.safeParse(data);
    if (result.success) {
      return { success: true, data: result.data as T };
    }
    return {
      success: false,
      errors: result.error.issues.map(issue => ({
        path: issue.path,
        message: issue.message,
        code: issue.code,
        expected: (issue as any).expected,
        received: (issue as any).received,
      })),
    };
  }

  validateBatch(entries: Array<{ name: string; data: unknown }>): SchemaValidationResult[] {
    return entries.map(({ name, data }) => this.validate(name, data));
  }

  has(name: string): boolean {
    return this.schemas.has(name);
  }

  listRegistered(): string[] {
    return [...this.schemas.keys()];
  }
}
```

### 6.2 验收标准

- [ ] register() + validate() 对有效数据返回 `{ success: true, data }`
- [ ] validate() 对无效数据返回结构化的 `errors[]`，含 path/message/code
- [ ] 重复 register() 同名 schema 抛出异常
- [ ] validateBatch() 返回与输入等长的结果数组
- [ ] 未注册 schema 名称返回 `SCHEMA_NOT_FOUND` 错误

---

## 7. R4 — 异常处理器

### 7.1 类型定义

> **CC 对标**: `services/api/withRetry.ts` + `services/compact/autoCompact.ts`
> **变更**: [C5] jitter + Retry-After, [C6] circuit breaker, [I3] AsyncGenerator, [I5] query priority

```typescript
// 复用 Phase 0 已有的 ErrorCategory (src/types/errors.ts)
// 新增以下类型:

// ============================================================
// [I5] Query Priority (borrowed from CC withRetry.ts FOREGROUND_529_RETRY_SOURCES)
// Background queries (summary, title generation) skip retry to avoid cascade amplification.
// ============================================================

export type QueryPriority = 'foreground' | 'background';

export type RecoveryStrategy =
  | { type: 'retry'; maxAttempts: number; backoffMs: number; backoffMultiplier: number;
      /** [C5] Jitter factor (0-1). Default 0.25 = 25% of base delay. */
      jitterFactor?: number }
  | { type: 'fallback'; fallbackFn: () => Promise<unknown> }
  | { type: 'checkpoint_restore'; checkpointId?: string }
  | { type: 'escalate_to_human'; message: string }
  | { type: 'abort'; reason: string };

export interface RecoveryAction {
  strategy: RecoveryStrategy;
  applied: boolean;
  result?: unknown;
  error?: Error;
  attemptCount: number;
}

// ============================================================
// [C6] Circuit Breaker State (borrowed from CC autoCompact.ts:57-70)
// Stops retrying after N consecutive failures to avoid wasting API calls.
// CC production data: 1,279 sessions had 50+ consecutive failures,
// wasting ~250K API calls/day globally.
// ============================================================

export interface CircuitBreakerState {
  /** Current consecutive failure count. Reset to 0 on any success. */
  consecutiveFailures: number;
  /** Max consecutive failures before circuit trips. Default 3. */
  maxConsecutiveFailures: number;
  /** Once tripped, all subsequent calls return immediately without attempting. */
  isTripped: boolean;
  /** Timestamp when circuit was tripped (for logging/monitoring). */
  trippedAt?: number;
}

// [I3] Retry status messages yielded during AsyncGenerator retry loop
export interface RetryStatusMessage {
  type: 'retry_status';
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  errorMessage: string;
  timestamp: number;
}
```

### 7.2 ExceptionHandler 实现

```typescript
// src/exception/ExceptionHandler.ts

export class ExceptionHandler {
  private strategies = new Map<ErrorCategory, RecoveryStrategy>();

  // [C6] Per-category circuit breaker state
  private circuitBreakers = new Map<ErrorCategory, CircuitBreakerState>();

  constructor(
    private readonly eventBus: TypedEventBus<KyberEvents>,
    private readonly defaultMaxConsecutiveFailures = 3,
  ) {}

  registerStrategy(category: ErrorCategory, strategy: RecoveryStrategy): void {
    this.strategies.set(category, strategy);
    // [C6] Initialize circuit breaker for retry strategies
    if (strategy.type === 'retry') {
      this.circuitBreakers.set(category, {
        consecutiveFailures: 0,
        maxConsecutiveFailures: this.defaultMaxConsecutiveFailures,
        isTripped: false,
      });
    }
  }

  /**
   * Routes an error to the appropriate recovery strategy.
   * [C6] Checks circuit breaker before attempting retry.
   * [I5] Background queries bypass retry entirely.
   */
  async handle(
    error: KyberError,
    context?: { checkpointManager?: CheckpointManager; queryPriority?: QueryPriority },
  ): Promise<RecoveryAction> {
    const strategy = this.strategies.get(error.category)
      ?? { type: 'abort' as const, reason: `No strategy for category "${error.category}"` };

    // [I5] Background queries skip retry to avoid cascade amplification
    if (context?.queryPriority === 'background' && strategy.type === 'retry') {
      this.eventBus.emit('exception.background_dropped', { error, category: error.category });
      return { strategy: { type: 'abort', reason: 'Background query — retry skipped' }, applied: true, attemptCount: 0 };
    }

    // [C6] Circuit breaker check
    if (strategy.type === 'retry') {
      const breaker = this.circuitBreakers.get(error.category);
      if (breaker?.isTripped) {
        this.eventBus.emit('exception.circuit_breaker_open', { category: error.category });
        return { strategy: { type: 'abort', reason: 'Circuit breaker tripped' }, applied: true, attemptCount: 0 };
      }
    }

    this.eventBus.emit('exception.handling', { error, strategy });

    switch (strategy.type) {
      case 'retry':
        return this.executeRetry(error, strategy);
      case 'fallback':
        return this.executeFallback(strategy);
      case 'checkpoint_restore':
        return this.executeCheckpointRestore(strategy, context?.checkpointManager);
      case 'escalate_to_human':
        return { strategy, applied: false, attemptCount: 0 };
      case 'abort':
        return { strategy, applied: true, attemptCount: 0 };
      default:
        return { strategy, applied: false, attemptCount: 0 };
    }
  }

  /** [C6] Record a success — resets circuit breaker for the category */
  recordSuccess(category: ErrorCategory): void {
    const breaker = this.circuitBreakers.get(category);
    if (breaker) {
      breaker.consecutiveFailures = 0;
      breaker.isTripped = false;
    }
  }

  /** [C6] Record a failure — increments counter, may trip breaker */
  recordFailure(category: ErrorCategory): void {
    const breaker = this.circuitBreakers.get(category);
    if (!breaker) return;
    breaker.consecutiveFailures++;
    if (breaker.consecutiveFailures >= breaker.maxConsecutiveFailures) {
      breaker.isTripped = true;
      breaker.trippedAt = Date.now();
      this.eventBus.emit('exception.circuit_breaker_tripped', {
        category, consecutiveFailures: breaker.consecutiveFailures,
      });
    }
  }
}
```

### 7.3 RetryStrategy 执行器

> **CC 对标**: `services/api/withRetry.ts` (823 行)
> **变更**: [C5] jitter + Retry-After, [I3] AsyncGenerator yield 状态消息

```typescript
// src/exception/RetryStrategy.ts

/**
 * [I3] AsyncGenerator retry executor with exponential backoff.
 * Yields RetryStatusMessage between attempts for progress reporting.
 * Borrowed from CC's withRetry() AsyncGenerator pattern.
 *
 * [C5] Supports:
 *   - Retry-After header from API responses (respected as server directive)
 *   - Jitter (default 25% of base delay) to prevent thundering herd
 * Both patterns borrowed from CC withRetry.ts:530-548.
 */
export async function* withRetry<T>(
  fn: () => Promise<T>,
  config: {
    maxAttempts: number;
    backoffMs: number;
    backoffMultiplier: number;
    jitterFactor?: number;
  },
  shouldRetry: (error: Error, attempt: number) => boolean = () => true,
  signal?: AbortSignal,
): AsyncGenerator<RetryStatusMessage, T> {
  const jitter = config.jitterFactor ?? 0.25;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    if (signal?.aborted) throw new Error('Aborted');

    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      if (attempt === config.maxAttempts || !shouldRetry(err, attempt)) {
        throw err;
      }

      // [C5] Respect Retry-After header if present
      const retryAfterMs = extractRetryAfterMs(err);
      let delayMs: number;
      if (retryAfterMs !== null) {
        delayMs = retryAfterMs;
      } else {
        const baseDelay = config.backoffMs * Math.pow(config.backoffMultiplier, attempt - 1);
        // [C5] Add jitter to prevent thundering herd (CC: 25% of base)
        const jitterAmount = Math.random() * jitter * baseDelay;
        delayMs = Math.min(baseDelay + jitterAmount, 32_000); // Cap at 32s
      }

      // [I3] Yield status message for progress reporting (UI, logging, etc.)
      yield {
        type: 'retry_status',
        attempt,
        maxAttempts: config.maxAttempts,
        delayMs,
        errorMessage: err.message ?? String(err),
        timestamp: Date.now(),
      };

      await sleep(delayMs, signal);
    }
  }
  throw lastError;
}

/**
 * [C5] Extract Retry-After header value in milliseconds.
 * Returns null if header not present or unparseable.
 */
function extractRetryAfterMs(error: unknown): number | null {
  const headers = (error as any)?.headers;
  const retryAfter = headers?.['retry-after'] ?? headers?.get?.('retry-after');
  if (!retryAfter) return null;
  const seconds = parseInt(retryAfter, 10);
  return isNaN(seconds) ? null : seconds * 1000;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new Error('Aborted'));
    }, { once: true });
  });
}
```

### 7.4 默认策略注册

```typescript
// src/exception/RecoveryStrategies.ts

/**
 * Registers the default recovery strategies for all error categories.
 * Called during KyberRuntime.bootstrap().
 */
export function registerDefaultStrategies(handler: ExceptionHandler): void {
  // Transient errors (network, rate limit): retry with exponential backoff
  handler.registerStrategy('model', {
    type: 'retry', maxAttempts: 3, backoffMs: 1000, backoffMultiplier: 2,
  });

  // Tool execution errors: retry once, then abort
  handler.registerStrategy('tool_execution', {
    type: 'retry', maxAttempts: 2, backoffMs: 500, backoffMultiplier: 1,
  });

  // Validation errors: abort (input is structurally wrong, no point retrying)
  handler.registerStrategy('validation', {
    type: 'abort', reason: 'Validation errors are deterministic and non-retryable.',
  });

  // Permission errors: escalate to human
  handler.registerStrategy('permission', {
    type: 'escalate_to_human', message: 'Agent requires additional permissions.',
  });

  // Config errors: abort (fatal during bootstrap)
  handler.registerStrategy('config', {
    type: 'abort', reason: 'Configuration error is non-recoverable at runtime.',
  });

  // Lifecycle errors: abort
  handler.registerStrategy('lifecycle', {
    type: 'abort', reason: 'Invalid state transition.',
  });

  // Internal errors: abort (treat as bug)
  handler.registerStrategy('internal', {
    type: 'abort', reason: 'Internal error — this is a framework bug.',
  });
}
```

### 7.5 验收标准

- [ ] `withRetry()`: 第 1/2 次失败、第 3 次成功 → 返回成功结果
- [ ] `withRetry()`: 全部失败 → 抛出最后一个异常
- [ ] `withRetry()`: backoff 时间按 `backoffMs * multiplier^attempt` 递增
- [ ] [C5] `withRetry()`: 当 error 携带 `Retry-After` header 时，使用 header 值作为 delay
- [ ] [C5] `withRetry()`: delay 包含 jitter 组分 (不的来每次 retry 的 delay 应不完全相同)
- [ ] [I3] `withRetry()`: 每次 retry 延迟前 yield `RetryStatusMessage`
- [ ] [I3] `withRetry()`: signal.abort() 后立即抛出 abort 异常
- [ ] `ExceptionHandler.handle()`: 返回与注册策略匹配的 RecoveryAction
- [ ] `registerDefaultStrategies()`: 7 种 ErrorCategory 全部注册
- [ ] 未注册 category → 返回 `abort` 策略（安全降级）
- [ ] [C6] `recordFailure()` 3 次后→ circuit breaker tripped，后续 handle() 返回 abort
- [ ] [C6] `recordSuccess()` 重置 circuit breaker 状态
- [ ] [I5] `handle()` 对 `queryPriority=background` + retry 策略 → 直接 abort，不重试

---

## 8. R5 — 自我验证循环

### 8.1 类型定义

> **CC 对标**: `utils/hooks/execAgentHook.ts` + `VerifyPlanExecutionTool/`
> **变更**: [I4] StepResult 扩展为 4 种 outcome 类型

```typescript
// src/types/verification.ts

// ============================================================
// [I4] Verification Outcome (borrowed from CC execAgentHook.ts HookResult)
// Replaces simple boolean `passed` with a 4-way discriminated outcome.
// CC equivalents: success / blocking / non_blocking_error / cancelled
// ============================================================

export type VerificationOutcome =
  | 'success'         // Verification passed (CC: outcome='success')
  | 'blocking_failed' // Blocking failure — agent must fix (CC: outcome='blocking')
  | 'warning'         // Non-blocking issue (CC: outcome='non_blocking_error')
  | 'timeout';        // Step exceeded timeoutMs (CC: outcome='cancelled')

export interface VerificationStep {
  readonly name: string;
  verify(context: VerificationContext): Promise<StepResult>;
  readonly timeoutMs: number;
  readonly blocking: boolean;  // true = failure produces 'blocking_failed'; false = 'warning'
}

export interface VerificationContext {
  agentId: string;
  taskDescription: string;
  messages: unknown[];
  artifacts: Record<string, unknown>;
}

/**
 * [I4] StepResult with 4-way outcome.
 * Replaces the simple `{ passed: boolean; message }` with a richer discriminant.
 */
export interface StepResult {
  outcome: VerificationOutcome;
  message?: string;
  detail?: unknown;
}

export interface VerificationReport {
  /** Overall — true only if zero blocking_failed outcomes */
  passed: boolean;
  steps: Array<{
    name: string;
    outcome: VerificationOutcome;
    duration: number;
    message?: string;
    blocking: boolean;
  }>;
  /** Framework-generated cryptographic nonce (non-forgeable) */
  completionToken: string;
  timestamp: number;
}
```

### 8.2 VerificationPipeline 实现

```typescript
// src/verification/VerificationPipeline.ts

export class VerificationPipeline {
  private steps: VerificationStep[] = [];

  addStep(step: VerificationStep): void {
    this.steps.push(step);
  }

  /**
   * [I4] Run all verification steps and collect 4-way outcomes.
   * Overall passed = true only if zero 'blocking_failed' outcomes.
   */
  async run(context: VerificationContext): Promise<VerificationReport> {
    const results: VerificationReport['steps'] = [];
    let hasBlockingFailure = false;

    for (const step of this.steps) {
      const start = Date.now();
      try {
        const result = await Promise.race([
          step.verify(context),
          rejectAfterTimeout(step.timeoutMs, step.name),
        ]);
        const duration = Date.now() - start;
        results.push({
          name: step.name,
          outcome: result.outcome,
          duration,
          message: result.message,
          blocking: step.blocking,
        });
        if (result.outcome === 'blocking_failed') {
          hasBlockingFailure = true;
        }
      } catch (err: any) {
        const duration = Date.now() - start;
        const isTimeout = err.message?.includes('timeout');
        // [I4] Map exceptions to appropriate outcome
        const outcome: VerificationOutcome = isTimeout
          ? 'timeout'
          : step.blocking ? 'blocking_failed' : 'warning';
        results.push({
          name: step.name,
          outcome,
          duration,
          message: isTimeout ? `Step timed out after ${step.timeoutMs}ms` : `Step threw: ${err.message}`,
          blocking: step.blocking,
        });
        if (outcome === 'blocking_failed') hasBlockingFailure = true;
      }
    }

    const passed = !hasBlockingFailure;
    const completionToken = passed
      ? generateCompletionToken(context.agentId, results)
      : '';

    return { passed, steps: results, completionToken, timestamp: Date.now() };
  }
}
```

### 8.3 CompletionToken (加密完成令牌)

```typescript
// src/verification/CompletionToken.ts

import { createHmac, randomBytes } from 'crypto';

/** Secret is generated per-runtime instance. Model cannot access it. */
let runtimeSecret: Buffer | null = null;

export function initRuntimeSecret(): void {
  runtimeSecret = randomBytes(32);
}

export function generateCompletionToken(agentId: string, steps: unknown[]): string {
  if (!runtimeSecret) throw new Error('Runtime secret not initialized');
  const payload = JSON.stringify({ agentId, steps, ts: Date.now() });
  const hmac = createHmac('sha256', runtimeSecret).update(payload).digest('hex');
  return `kyber:${hmac.slice(0, 16)}`;
}

export function isValidCompletionToken(token: string): boolean {
  return /^kyber:[a-f0-9]{16}$/.test(token);
}
```

### 8.4 内置验证步骤

```typescript
// src/verification/BuiltinVerifiers.ts

/**
 * Verifies that the agent has produced at least one artifact or meaningful output.
 */
export const NonEmptyOutputVerifier: VerificationStep = {
  name: 'non_empty_output',
  timeoutMs: 5000,
  blocking: true,
  async verify(context): Promise<StepResult> {
    const hasArtifacts = Object.keys(context.artifacts).length > 0;
    const hasTextOutput = context.messages.some(
      (m: any) => m.role === 'assistant' && typeof m.content === 'string' && m.content.length > 0
    );
    const produced = hasArtifacts || hasTextOutput;
    return {
      outcome: produced ? 'success' : 'blocking_failed',
      message: produced
        ? 'Agent produced output.'
        : 'Agent completed without producing any output.',
    };
  },
};

/**
 * Verifies that no tool calls ended in error in the final round.
 */
export const NoFinalToolErrorVerifier: VerificationStep = {
  name: 'no_final_tool_errors',
  timeoutMs: 5000,
  blocking: false,  // Warning only — tools can fail legitimately
  async verify(context): Promise<StepResult> {
    const lastUserMsg = [...context.messages].reverse().find((m: any) => m.role === 'user');
    if (!lastUserMsg) return { outcome: 'success' };
    const content = Array.isArray((lastUserMsg as any).content) ? (lastUserMsg as any).content : [];
    const hasError = content.some((c: any) => c.type === 'tool_result' && c.is_error);
    return {
      outcome: hasError ? 'warning' : 'success',
      message: hasError ? 'Final tool call had errors.' : 'No tool errors in final round.',
    };
  },
};
```

### 8.5 验收标准

- [ ] Pipeline 2 个 blocking step 全返回 `success` → `passed=true` + 非空 `completionToken`
- [ ] 1 个 blocking step 返回 `blocking_failed` → `passed=false` + 空 `completionToken`
- [ ] 1 个 non-blocking step 返回 `warning` → `passed=true` (仅警告)
- [ ] Step 超时 → 该 step `outcome='timeout'` + message 包含 "timed out"
- [ ] [I4] 每个 step 结果包含 `outcome: VerificationOutcome` 而非 boolean `passed`
- [ ] `completionToken` 格式: `kyber:{16 hex chars}`
- [ ] `isValidCompletionToken()` 对合法/非法 token 的判断正确

---

## 9. Phase 0 集成改造

### 9.1 AgentLoop 改造

```typescript
// src/agent/AgentLoop.ts — 改造后伪代码

export async function runAgentLoop(
  agent: DefaultAgentInstance,
  model: ModelProvider,
  tools: ToolIntegrationFacade,
  sandbox: PermissionSandbox,
  // ---- Phase 1 新增注入 ----
  exceptionHandler: ExceptionHandler,
  verificationPipeline: VerificationPipeline,
  checkpointManager: CheckpointManager,
  sessionMemory: SessionMemory,
): Promise<void> {

  while (!isTerminal(agent.status) && agent.status === 'running') {
    try {
      // Model call with retry (via ExceptionHandler)
      const response = await withRetry(
        () => model.chat({ /* ... */ }),
        { maxAttempts: 3, backoffMs: 1000, backoffMultiplier: 2 },
        (err) => err instanceof ModelError,
      );

      // ... tool execution logic (unchanged) ...

      // Periodic checkpoint (every N tool calls)
      if (agent.toolCallCount % 5 === 0) {
        await checkpointManager.save(agent, sessionMemory);
      }

      // Check termination
      if (response.stopReason === 'end_turn') {
        agent.transition('task_done');

        // Phase 1: Run VerificationPipeline
        const report = await verificationPipeline.run({
          agentId: agent.id,
          taskDescription: agent.definition.systemPrompt ?? '',
          messages: agent.messages,
          artifacts: agent.taskProgress?.artifacts ?? {},
        });

        if (report.passed) {
          agent.transition('verified');
        } else {
          agent.transition('verification_failed');
          // Continue loop — agent gets another chance
        }
      }

    } catch (error: any) {
      if (error instanceof KyberError) {
        const recovery = await exceptionHandler.handle(error);
        if (recovery.strategy.type === 'abort') {
          agent.transition('error');
        }
        // Other strategies handled by the respective executors
      } else {
        agent.transition('error');
      }
    }
  }
}
```

### 9.2 KyberConfig 扩展

```yaml
# kyberkit.config.yaml Phase 1 新增配置段

memory:
  session:
    filePath: ".kyberkit/progress.json"
    # [C1] Token-threshold flush trigger (replaces simple flushIntervalMs)
    flushTrigger:
      tokenThreshold: 50000       # ~40% of 128k context window
      toolCallThreshold: 3
      debounceMs: 1000            # Fallback timer
    # [I1] Structured template config
    template:
      maxSectionTokens: 2000
      maxTotalTokens: 12000
  longterm:
    dbPath: ".kyberkit/memory.db"
    eviction:
      type: "composite"
      policies:
        - type: "lru"
          maxEntries: 10000
        - type: "ttl"
          maxAgeMs: 2592000000   # 30 days

checkpoint:
  provider: "json"               # "json" | "git"
  baseDir: ".kyberkit/checkpoints"
  retention:
    maxSnapshots: 10
    maxAgeMs: 604800000           # 7 days
  autoSaveInterval: 5             # Save every N tool calls

exception:
  # [C6] Circuit breaker config
  circuitBreaker:
    maxConsecutiveFailures: 3     # Trip after 3 consecutive failures

verification:
  steps:
    - "non_empty_output"          # Built-in verifier names
    - "no_final_tool_errors"
```

### 9.3 KyberEvents 扩展

```typescript
// src/types/events.ts — 新增事件

export type KyberEvents = {
  // ... Phase 0 events unchanged ...

  // Memory events (Phase 1)
  'memory.written': { tierId: string; entryId: string };
  'memory.evicted': { tierId: string; count: number; policy: string };
  // [C1] Session memory flush triggered by token threshold
  'memory.session_flushed': { tokenCount: number; toolCallCount: number };

  // Checkpoint events (Phase 1)
  'checkpoint.saved': { agentId: string; checkpointId: string };
  'checkpoint.restored': { agentId: string; checkpointId: string };
  'checkpoint.pruned': { count: number };
  // [C4] Auto-continuation after interrupted restore
  'checkpoint.auto_continued': { agentId: string; checkpointId: string; reason: 'interrupted_turn' | 'interrupted_prompt' };

  // Verification events (Phase 1)
  'verification.started': { agentId: string };
  'verification.completed': { agentId: string; passed: boolean; token: string };
  // [I4] Step result now uses VerificationOutcome
  'verification.step_result': { agentId: string; stepName: string; outcome: VerificationOutcome };

  // Exception events (Phase 1)
  'exception.handling': { error: Error; strategy: string };
  'exception.retry': { error: Error; attempt: number; maxAttempts: number };
  'exception.recovered': { error: Error; strategy: string };
  'exception.escalated': { error: Error; message: string };
  // [C6] Circuit breaker events
  'exception.circuit_breaker_tripped': { category: string; consecutiveFailures: number };
  'exception.circuit_breaker_open': { category: string };
  // [I5] Background query dropped event
  'exception.background_dropped': { error: Error; category: string };
};
```

---

## 10. 实现顺序与里程碑

```
Week 1-2  ▓▓▓▓▓▓▓▓▓▓  R3 SchemaValidator + R1 Types + WorkingMemory
Week 3-4  ▓▓▓▓▓▓▓▓▓▓  R1 SessionMemory + LongTermMemory + TieredFacade
Week 5-6  ▓▓▓▓▓▓▓▓▓▓  R2 CheckpointManager + R4 ExceptionHandler + RetryStrategy
Week 7-8  ▓▓▓▓▓▓▓▓▓▓  R5 VerificationPipeline + CompletionToken + BuiltinVerifiers
Week 9-10 ▓▓▓▓▓▓▓▓▓▓  Phase 0 集成改造 + 集成测试 + E2E 验证
```

| 里程碑 | 周次 | 交付物 | 验收 |
|--------|------|--------|------|
| **Alpha** | W2 | SchemaValidator + WorkingMemory 独立可用 | 单元测试全绿 |
| **Beta** | W4 | 三层记忆系统完整 + SessionMemory 持久化 | 集成测试全绿 |
| **RC** | W6 | Checkpoint + ExceptionHandler 完整 | 故障恢复场景通过 |
| **RC2** | W8 | VerificationPipeline + 内置验证器 | 验证循环场景通过 |
| **GA** | W10 | AgentLoop 改造 + E2E 全链路验证 | MVP 验收场景通过 |

---

## 11. 验证计划

### 11.1 单元测试

每个模块均有 `.test.ts`，使用 **Vitest**。

```bash
bun run vitest --coverage
```

目标覆盖率：**≥ 85% (lines)**，核心模块 (R1 Eviction, R4 RetryStrategy, R5 Pipeline) **≥ 95%**。

### 11.2 E2E 验证场景

| 场景 | 步骤 | 预期结果 |
|------|------|----------|
| **记忆持久化** | Agent 写入 SessionMemory → 模拟进程终止 → 重新加载 | 数据完整恢复 |
| **Checkpoint 恢复** | Agent 执行 3 轮对话 → save checkpoint → 模拟崩溃 → restore | 从第 3 轮继续 |
| **Schema 校验** | 工具返回不符合 Schema 的数据 | `ToolValidationError` 抛出 |
| **自动重试** | Mock ModelProvider 前 2 次抛出网络异常 | 第 3 次成功，Agent 状态正常 |
| **验证循环** | Agent 完成任务 → VerificationPipeline 执行 | `completionToken` 非空 |
| **验证失败重试** | NonEmptyOutputVerifier 失败 | Agent 回到 `running` 继续执行 |

---

## 附录 A — 核心数据流

### A.1 改造后的 Agent 推理循环

```
                    ┌──────────────────────────────────────────┐
                    │              AgentLoop                    │
                    └────────────────┬─────────────────────────┘
                                     │
                              ┌──────▼──────┐
                              │  Model.chat()│
                              │  + withRetry │ ◄── R4 ExceptionHandler
                              └──────┬──────┘
                                     │
                              ┌──────▼──────┐
                              │ Tool Execute │
                              │ + Schema     │ ◄── R3 SchemaValidator
                              │   Validate   │
                              └──────┬──────┘
                                     │
                         ┌───────────▼───────────┐
                         │ Periodic Checkpoint   │ ◄── R2 CheckpointManager
                         │ (every N tool calls)  │
                         └───────────┬───────────┘
                                     │
                              ┌──────▼──────┐    ┌────────────────┐
                 end_turn ──► │ Verification │──►│ VerificationPipeline│
                              │ Pipeline     │   │ + CompletionToken   │ ◄── R5
                              └──────┬──────┘   └────────────────┘
                                     │
                         ┌───────────▼───────────┐
                         │  passed?              │
                         │  Y: → completed       │
                         │  N: → running (retry) │
                         └───────────────────────┘
```

### A.2 Checkpoint 恢复流程

```
Process Crash / Restart
         │
         ▼
  KyberRuntime.bootstrap()
         │
         ▼
  CheckpointManager.list(agentId)
         │
         ▼
  Latest checkpoint found?
  ├── No  → Create fresh agent
  └── Yes → CheckpointManager.restore(cpId, agent, session)
            │
            ├── SessionMemory.restore(snapshot)
            ├── agent.messages = state.messages
            ├── agent.taskProgress = state.taskProgress
            │
            ▼
       AgentLoop resumes from restored state
```

---

## 附录 B — 外部依赖清单

| 依赖 | 版本 | 用途 | 包大小 |
|------|------|------|--------|
| `better-sqlite3` | ^11.x | LongTermMemory SQLite 后端 | ~2MB (native) |
| `zod` | ^3.x | Schema 校验 (已有) | ~60KB |
| 无新增 HTTP/TUI 框架 |||

> **注**: `better-sqlite3` 是唯一新增的运行时依赖。它是同步 API 的 SQLite binding，
> 避免了 async SQLite driver 的复杂性。在 Bun 环境下可使用 `bun:sqlite` 替代。

---

> **文档状态**: Phase 1 实现规范 v0.2 (CC-Aligned)。已合入 CC 对标分析中的全部修改项：
>
> **Critical (C1-C6)**: token 阈值触发 (C1), 记忆类型枚举化 (C2), 原子写入 (C3), 中断分类 (C4), jitter + Retry-After (C5), 断路器 (C6)
>
> **Important (I1-I5)**: 结构化模板 (I1), pending buffer + cleanup (I2), AsyncGenerator withRetry (I3), 4-outcome StepResult (I4), foreground/background 区分 (I5)
>
> 待 User 审批后进入 Phase 2 (TDD Red Phase)。
