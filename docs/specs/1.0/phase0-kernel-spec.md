# KyberKit Phase 0 — Kernel 实现规范 (Implementation Spec)

**版本**: 0.1 (Draft)
**日期**: 2026-04-01
**依赖文档**: [design.md](./design.md) v1.2 §4
**交付周期**: 8-10 周
**运行时**: Bun (首选) / Node.js ≥ 20 (兼容)

---

## 目录

1. [交付范围概述](#1-交付范围概述)
2. [模块分解与依赖图](#2-模块分解与依赖图)
3. [目录结构](#3-目录结构)
4. [M1 — 类型基础 (Types Foundation)](#4-m1--类型基础)
5. [M2 — 事件总线 (Event Emitter)](#5-m2--事件总线)
6. [M3 — 权限沙箱 (Permission Sandbox)](#6-m3--权限沙箱)
7. [M4 — 工具集成层 (Tool Integration Layer)](#7-m4--工具集成层)
8. [M5 — 模型接口层 (Model Provider)](#8-m5--模型接口层)
9. [M6 — Agent 生命周期 (Agent Lifecycle)](#9-m6--agent-生命周期)
10. [M7 — 配置加载器 (Config Loader)](#10-m7--配置加载器)
11. [M8 — Runtime 引导 (Runtime Bootstrap)](#11-m8--runtime-引导)
12. [M9 — CLI 脚手架 (kyberkit init)](#12-m9--cli-脚手架)
13. [实现顺序与里程碑](#13-实现顺序与里程碑)
14. [验证计划](#14-验证计划)
15. [附录 A — 核心数据流](#附录-a--核心数据流)
16. [附录 B — 外部依赖清单](#附录-b--外部依赖清单)

---

## 1. 交付范围概述

Phase 0 交付 KyberKit 的**最小可行内核 (MVP Kernel)**——一个可以引导 Agent 启动、
注册工具、调用模型、并在权限沙箱内执行操作的 Headless 运行时。

### 1.1 Phase 0 包含 (In Scope)

| 子系统 | 模块 ID | 说明 |
|--------|---------|------|
| 类型基础 | M1 | 全局类型定义、错误类型体系、Disposable 模式 |
| 事件总线 | M2 | 轻量级类型安全的发布/订阅机制 |
| 权限沙箱 | M3 | PermissionGrant、PermissionTag、拦截逻辑 |
| 工具集成层 | M4 | ShellExecutor (L0) + MCPToolRegistry (L1) + SkillRegistry (L2) + Facade |
| 模型接口层 | M5 | ModelProvider SPI + Anthropic 默认实现 |
| Agent 生命周期 | M6 | 状态机 + LifecycleHooks + AgentInstance |
| 配置加载器 | M7 | `kyberkit.config.yaml` 的 Schema 定义与加载 |
| Runtime 引导 | M8 | `KyberRuntime` 的 bootstrap 序列 |
| CLI 脚手架 | M9 | `kyberkit init` 命令 |

### 1.2 Phase 0 不包含 (Out of Scope)

- 记忆系统 (MemoryStore) → Phase 1
- 状态快照 (CheckpointManager) → Phase 1
- 异常处理策略 (ExceptionHandler) → Phase 1
- 自我验证循环 (VerificationPipeline) → Phase 1
- OpenTelemetry 集成 → Phase 2
- 多 Agent 编排 → Phase 4
- TUI / React Ink → 产品层，不属于 Harness

### 1.3 MVP 验收场景

```
用户执行 `kyberkit init my-agent` → 生成脚手架
→ 编写 agent.ts，注册自定义工具
→ 配置 kyberkit.config.yaml（模型、权限）
→ 调用 KyberRuntime.bootstrap() 启动 Agent
→ Agent 通过 ToolIntegrationFacade 调用 Shell / MCP / Skill
→ 模型驱动的推理循环在权限边界内安全执行
```

### 1.4 与 Claude Code 实现异同对比

| 模块 ID | KyberKit 模块 | Claude Code 对应实现 | 主要差异与重构点 |
| :--- | :--- | :--- | :--- |
| **M1** | 类型基础 (Types) | `src/types/`, `src/Tool.ts` | **解耦**: Claude Code 类型与实现高度耦合。KyberKit 实现严格的类型/接口定义与逻辑分离。 |
| **M2** | 事件总线 (Events) | `EventEmitter`, 状态订阅 | **强类型**: 使用 `TypedEventBus` 替代原生 `EventEmitter`，确保跨模块分发的事件 100% 类型安全。 |
| **M3** | 权限沙箱 | 各项工具内部硬编码校验 | **中心化**: 摒弃 `BashTool.ts` 中分散的权限逻辑。建立全局 `PermissionSandbox` 拦截层。 |
| **M4.L0** | Shell Executor | `src/tools/BashTool.tsx` | **纯净性**: 去除 TUI/React 相关代码，仅保留核心执行与安全过滤逻辑。 |
| **M4.L1** | MCP Registry | `src/services/mcp/` | **标准化**: 优化 MCP 生命周期管理，支持在 Runtime 级别热加载/卸载。 |
| **M4.L2** | Skill Registry | `src/skills/`, `SkillTool.ts` | **地位提升**: Skill 从“附加功能”提升为与 MCP 平级的二等公民，具备独立来源标记。 |
| **M5** | 模型接口层 | `src/assistant/`, `src/services/` | **SPI 化**: 提供标准 `ModelProvider` 接口。未来支持轻松切换至非 Anthropic 模型。 |
| **M6** | Agent 生命周期 | `src/Task.ts` (TaskStatus) | **确定性状态机**: 使用显式状态机控制推理循环，而非依赖流式结果中的隐式逻辑。 |
| **M7/M8** | 配置与引导 | `~/.claude.json`, `main.tsx` | **声明式**: 采用 YAML 定义，由 `KyberRuntime` 负责声明式地装配所有组件，而非程序启动时的命令式构造。 |
| **M9** | CLI 脚手架 | `src/cli/` | **专注度**: 仅负责 Harness 项目初始化，不包含大型交互式 REPL 或 TUI 逻辑。 |

---

## 2. 模块分解与依赖图

```
                    ┌──────────────────┐
                    │  M9: CLI (init)  │
                    └────────┬─────────┘
                             │
                    ┌────────▼─────────┐
                    │  M8: Runtime     │  ← 引导入口
                    │  (Bootstrap)     │
                    └──┬──┬──┬──┬──┬───┘
                       │  │  │  │  │
        ┌──────────────┘  │  │  │  └──────────────┐
        │                 │  │  │                  │
   ┌────▼────┐   ┌───────▼──▼──▼────────┐   ┌────▼────┐
   │ M7:     │   │ M6: Agent Lifecycle  │   │ M5:     │
   │ Config  │   │ (State Machine)      │   │ Model   │
   │ Loader  │   └──────────┬───────────┘   │ Provider│
   └────┬────┘              │               └────┬────┘
        │           ┌───────▼───────┐             │
        │           │ M4: Tool      │◄────────────┘
        │           │ Integration   │
        │           │ Layer         │
        │           └──┬──┬──┬──┬──┘
        │              │  │  │  │
        │    ┌─────────┘  │  │  └─────────┐
        │    │            │  │            │
        │  ┌─▼──────┐ ┌──▼──▼──┐  ┌──────▼───┐
        │  │ L0:    │ │ L1:    │  │ L2:      │
        │  │ Shell  │ │ MCP    │  │ Skill    │
        │  │Executor│ │Registry│  │ Registry │
        │  └───┬────┘ └───┬────┘  └─────┬────┘
        │      │          │             │
   ┌────▼──────▼──────────▼─────────────▼────┐
   │         M3: Permission Sandbox          │
   └─────────────────┬──────────────────────┘
                     │
   ┌─────────────────▼──────────────────────┐
   │           M2: Event Emitter            │
   └─────────────────┬──────────────────────┘
                     │
   ┌─────────────────▼──────────────────────┐
   │           M1: Types Foundation         │
   └────────────────────────────────────────┘
```

**关键约束**：
- 依赖方向严格自上而下，禁止形成环
- M1, M2, M3 为底层基础设施，零外部依赖（仅 Zod）
- M4 各子层保持单向依赖（Skill → MCP → Shell）

---

## 3. 目录结构

```
packages/kyberkit/
├── src/
│   ├── index.ts                          # 公共 API 导出
│   │
│   ├── types/                            # M1: 类型基础
│   │   ├── agent.ts                      #   AgentStatus, AgentInstance, AgentDefinition
│   │   ├── tool.ts                       #   ToolDefinition, ToolResult, ToolContext
│   │   ├── skill.ts                      #   SkillDefinition, SkillSource, SkillResult
│   │   ├── model.ts                      #   ChatRequest, ChatResponse, ModelCapabilities
│   │   ├── permission.ts                 #   PermissionTag, PermissionGrant
│   │   ├── config.ts                     #   KyberConfig schema (Zod)
│   │   ├── errors.ts                     #   KyberError 层级体系
│   │   ├── events.ts                     #   事件类型定义
│   │   └── common.ts                     #   Disposable, Result<T,E> 等通用工具类型
│   │
│   ├── events/                           # M2: 事件总线
│   │   ├── EventBus.ts                   #   TypedEventEmitter 实现
│   │   └── EventBus.test.ts
│   │
│   ├── permission/                       # M3: 权限沙箱
│   │   ├── PermissionSandbox.ts          #   权限检查引擎
│   │   ├── PermissionRules.ts            #   规则匹配逻辑（allow/deny/ask）
│   │   └── PermissionSandbox.test.ts
│   │
│   ├── tools/                            # M4: 工具集成层
│   │   ├── facade/
│   │   │   ├── ToolIntegrationFacade.ts  #   统一门面实现
│   │   │   └── ToolIntegrationFacade.test.ts
│   │   ├── shell/                        #   L0: Shell Executor
│   │   │   ├── ShellExecutor.ts          #     命令执行核心
│   │   │   ├── ShellSecurity.ts          #     命令安全分析
│   │   │   ├── ShellSandbox.ts           #     可选进程沙箱
│   │   │   └── ShellExecutor.test.ts
│   │   ├── mcp/                          #   L1: MCP Registry
│   │   │   ├── MCPToolRegistry.ts        #     MCP 客户端管理
│   │   │   ├── MCPConnection.ts          #     单个 Server 连接
│   │   │   ├── MCPTransport.ts           #     Transport 抽象 (stdio/http)
│   │   │   └── MCPToolRegistry.test.ts
│   │   ├── skill/                        #   L2: Skill Registry
│   │   │   ├── SkillRegistry.ts          #     注册表逻辑
│   │   │   ├── SkillLoader.ts            #     SKILL.md 文件解析
│   │   │   ├── FrontmatterParser.ts      #     YAML Frontmatter 解析
│   │   │   └── SkillRegistry.test.ts
│   │   └── shared/
│   │       ├── buildTool.ts              #     工具构建器工厂函数
│   │       └── ToolValidator.ts          #     输入/输出 Schema 校验
│   │
│   ├── model/                            # M5: 模型接口层
│   │   ├── ModelProvider.ts              #   SPI 接口定义
│   │   ├── AnthropicProvider.ts          #   Anthropic SDK 默认实现
│   │   ├── ModelProviderRegistry.ts      #   多模型注册表
│   │   └── AnthropicProvider.test.ts
│   │
│   ├── agent/                            # M6: Agent 生命周期
│   │   ├── AgentStateMachine.ts          #   纯状态机 (纯函数，无副作用)
│   │   ├── AgentInstance.ts              #   Agent 实例管理
│   │   ├── AgentLoop.ts                  #   推理循环 (Sense-Think-Act)
│   │   ├── LifecycleHooks.ts             #   Hook 注册与执行
│   │   ├── AgentStateMachine.test.ts
│   │   └── AgentLoop.test.ts
│   │
│   ├── config/                           # M7: 配置加载器
│   │   ├── ConfigLoader.ts               #   YAML 加载 + Zod 校验
│   │   ├── ConfigResolver.ts             #   环境变量展开 + 默认值合并
│   │   └── ConfigLoader.test.ts
│   │
│   ├── runtime/                          # M8: Runtime 引导
│   │   ├── KyberRuntime.ts               #   引导序列 + 生命周期协调
│   │   ├── EmbeddedRuntime.ts            #   L1 Embedded 模式实现
│   │   └── KyberRuntime.test.ts
│   │
│   └── cli/                              # M9: CLI
│       ├── init.ts                       #   kyberkit init 命令
│       ├── templates/                    #   脚手架模板文件
│       │   ├── kyberkit.config.yaml.tmpl
│       │   ├── agent.ts.tmpl
│       │   ├── KK.md.tmpl
│       │   └── skill-example.md.tmpl
│       └── init.test.ts
│
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## 4. M1 — 类型基础

### 4.1 错误类型层级

```typescript
// src/types/errors.ts

/** KyberKit 全局错误基类 */
export abstract class KyberError extends Error {
  abstract readonly code: string;
  abstract readonly category: ErrorCategory;
  readonly timestamp = Date.now();

  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = this.constructor.name;
  }
}

export type ErrorCategory =
  | 'permission'      // 权限类异常
  | 'validation'      // 校验类异常
  | 'tool_execution'  // 工具执行异常
  | 'model'           // 模型调用异常
  | 'config'          // 配置异常
  | 'lifecycle'       // 生命周期异常
  | 'internal';       // 内部异常（应视为 Bug）

// ---- 具体错误类型 ----

export class PermissionDeniedError extends KyberError {
  readonly code = 'PERMISSION_DENIED';
  readonly category = 'permission' as const;
  constructor(
    public readonly toolName: string,
    public readonly requiredTag: PermissionTag,
    public readonly grant: PermissionGrant,
  ) {
    super(`Tool "${toolName}" requires permission "${requiredTag}" which is denied.`);
  }
}

export class ToolValidationError extends KyberError {
  readonly code = 'TOOL_VALIDATION_FAILED';
  readonly category = 'validation' as const;
  constructor(
    public readonly toolName: string,
    public readonly errors: ValidationError[],
  ) {
    super(`Input validation failed for tool "${toolName}": ${errors.map(e => e.message).join('; ')}`);
  }
}

export class ToolExecutionError extends KyberError {
  readonly code = 'TOOL_EXECUTION_FAILED';
  readonly category = 'tool_execution' as const;
  constructor(
    public readonly toolName: string,
    message: string,
    cause?: Error,
  ) {
    super(`Tool "${toolName}" execution failed: ${message}`, cause);
  }
}

export class ModelError extends KyberError {
  readonly code = 'MODEL_ERROR';
  readonly category = 'model' as const;
}

export class ConfigError extends KyberError {
  readonly code = 'CONFIG_ERROR';
  readonly category = 'config' as const;
}

export class InvalidTransitionError extends KyberError {
  readonly code = 'INVALID_STATE_TRANSITION';
  readonly category = 'lifecycle' as const;
  constructor(
    public readonly from: AgentStatus,
    public readonly action: string,
  ) {
    super(`Invalid transition: cannot perform "${action}" from state "${from}".`);
  }
}
```

### 4.2 通用工具类型

```typescript
// src/types/common.ts

/** 可释放资源 (类似 VS Code Disposable) */
export interface Disposable {
  dispose(): void;
}

/** 创建一次性释放的组合 */
export function toDisposable(fn: () => void): Disposable {
  let disposed = false;
  return {
    dispose() {
      if (!disposed) {
        disposed = true;
        fn();
      }
    },
  };
}

/** Result 类型 (替代 throw，用于可预期的失败路径) */
export type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

### 4.3 验收标准

- [ ] 所有类型文件编译通过，零 `any` 零 `as` 类型断言
- [ ] 错误类型层级中每种 `ErrorCategory` 至少有一个具体子类
- [ ] `Disposable` 模式在整个代码库中一致使用

---

## 5. M2 — 事件总线

### 5.1 设计

轻量级类型安全的事件发布/订阅机制。所有模块间的异步通知通过 EventBus 传递，
不使用 Node.js 内置的 `EventEmitter`（类型不安全）。

```typescript
// src/events/EventBus.ts

import { Disposable, toDisposable } from '../types/common.js';

type EventMap = Record<string, unknown>;

export class TypedEventBus<TEvents extends EventMap> {
  private listeners = new Map<keyof TEvents, Set<(data: any) => void>>();

  on<K extends keyof TEvents>(
    event: K,
    listener: (data: TEvents[K]) => void,
  ): Disposable {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener as any);
    this.listeners.set(event, set);
    return toDisposable(() => set.delete(listener as any));
  }

  emit<K extends keyof TEvents>(event: K, data: TEvents[K]): void {
    const set = this.listeners.get(event);
    if (set) for (const fn of set) fn(data);
  }

  removeAllListeners(): void {
    this.listeners.clear();
  }
}
```

### 5.2 KyberKit 全局事件定义

```typescript
// src/types/events.ts

export interface KyberEvents {
  // Agent 生命周期事件
  'agent.status_changed': { agentId: string; from: AgentStatus; to: AgentStatus };
  'agent.created': { agentId: string; definition: AgentDefinition };
  'agent.killed': { agentId: string; reason: string };

  // 工具事件
  'tool.registered': { toolName: string; layer: 'shell' | 'mcp' | 'skill' };
  'tool.unregistered': { toolName: string };
  'tool.call_start': { toolName: string; agentId: string; input: unknown };
  'tool.call_end': { toolName: string; agentId: string; duration: number; success: boolean };

  // 权限事件
  'permission.denied': { toolName: string; agentId: string; tag: PermissionTag };
  'permission.granted': { toolName: string; agentId: string; tag: PermissionTag };

  // MCP 事件
  'mcp.connected': { serverName: string };
  'mcp.disconnected': { serverName: string; reason: string };
  'mcp.error': { serverName: string; error: Error };

  // Skill 事件
  'skill.loaded': { skillName: string; source: SkillSource };
  'skill.activated': { skillName: string; trigger: string };
}
```

### 5.3 验收标准

- [ ] `TypedEventBus` 支持类型推导：`bus.on('agent.created', data => data.agentId)` 类型安全
- [ ] `on()` 返回 `Disposable`，调用 `dispose()` 后不再接收事件
- [ ] 单元测试覆盖：注册、触发、多监听器、取消注册、异常隔离

---

## 6. M3 — 权限沙箱

### 6.1 核心逻辑

```typescript
// src/permission/PermissionSandbox.ts

export class PermissionSandbox {
  constructor(private readonly grant: PermissionGrant) {}

  /**
   * 检查操作是否被允许。
   * 规则: denied > allowed > 默认拒绝
   */
  check(required: PermissionTag): PermissionCheckResult {
    if (this.grant.denied.has(required)) {
      return { allowed: false, reason: 'explicitly_denied' };
    }
    if (this.grant.allowed.has(required)) {
      return { allowed: true };
    }
    return { allowed: false, reason: 'not_granted' };
  }

  /** 批量检查 */
  checkAll(required: PermissionTag[]): PermissionCheckResult {
    for (const tag of required) {
      const result = this.check(tag);
      if (!result.allowed) return result;
    }
    return { allowed: true };
  }

  /** 路径白名单检查 */
  checkPath(path: string): boolean {
    if (!this.grant.allowedPaths || this.grant.allowedPaths.length === 0) {
      return true; // 无路径限制 = 全部允许
    }
    const normalized = normalizePath(path);
    return this.grant.allowedPaths.some(p => normalized.startsWith(normalizePath(p)));
  }

  /** 创建受限子沙箱 (权限只缩不扩) */
  fork(restriction: Partial<PermissionGrant>): PermissionSandbox {
    return new PermissionSandbox({
      allowed: intersection(this.grant.allowed, restriction.allowed ?? this.grant.allowed),
      denied: union(this.grant.denied, restriction.denied ?? new Set()),
      allowedPaths: narrowPaths(this.grant.allowedPaths, restriction.allowedPaths),
      allowedDomains: narrowDomains(this.grant.allowedDomains, restriction.allowedDomains),
    });
  }
}
```

### 6.2 工具执行拦截集成

```typescript
// 工具调用前的权限拦截 (在 ToolIntegrationFacade 中调用)
async function executeWithPermissionCheck<I, O>(
  tool: ToolDefinition<I, O>,
  input: I,
  sandbox: PermissionSandbox,
  context: ToolUseContext,
): Promise<ToolResult<O>> {
  // Step 1: 工具自身的权限检查 (ToolDefinition.checkPermissions)
  const permissionResult = await tool.checkPermissions(input, context);
  if (permissionResult.behavior === 'deny') {
    throw new PermissionDeniedError(tool.name, /* ... */);
  }

  // Step 2: 沙箱级别的标签检查
  const tags = inferPermissionTags(tool, input);
  const sandboxResult = sandbox.checkAll(tags);
  if (!sandboxResult.allowed) {
    throw new PermissionDeniedError(tool.name, /* ... */);
  }

  // Step 3: 输入校验
  if (tool.validateInput) {
    const validation = await tool.validateInput(input, context);
    if (!validation.result) {
      throw new ToolValidationError(tool.name, validation.errors ?? []);
    }
  }

  // Step 4: 执行
  return tool.call(input, context);
}
```

### 6.3 验收标准

- [ ] `denied` 优先级严格高于 `allowed`
- [ ] `fork()` 只能缩减权限，不能扩展
- [ ] 路径白名单正确处理相对路径、符号链接和 `..` 逃逸
- [ ] 覆盖测试：20+ 个测试用例覆盖所有边界

---

## 7. M4 — 工具集成层

### 7.1 L0: Shell Executor

**Phase 0 范围**：实现基础的命令执行和只读/破坏性检测。
完整的 AST 安全分析和沙箱化执行延迟到 Phase 0.5 迭代。

```typescript
// src/tools/shell/ShellExecutor.ts

import { spawn } from 'child_process';

export class DefaultShellExecutor implements ShellExecutor {
  async exec(command: string, options: ShellOptions): Promise<ShellResult> {
    const timeout = options.timeoutMs ?? 30_000;
    const cwd = options.cwd ?? process.cwd();
    const maxChars = options.maxResultSizeChars ?? 100_000;

    return new Promise((resolve, reject) => {
      const child = spawn('sh', ['-c', command], {
        cwd,
        env: { ...process.env },
        timeout,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      let interrupted = false;

      child.stdout.on('data', chunk => {
        stdout += chunk.toString();
        if (stdout.length > maxChars) {
          stdout = stdout.slice(0, maxChars) + '\n... [output truncated]';
          child.kill('SIGTERM');
          interrupted = true;
        }
      });

      child.stderr.on('data', chunk => { stderr += chunk.toString(); });

      child.on('close', code => {
        resolve({ stdout, stderr, exitCode: code ?? 1, interrupted });
      });

      child.on('error', reject);
    });
  }

  isReadOnly(command: string): boolean {
    const base = command.trim().split(/\s+/)[0] ?? '';
    return READ_ONLY_COMMANDS.has(base);
  }

  isDestructive(command: string): boolean {
    const base = command.trim().split(/\s+/)[0] ?? '';
    return DESTRUCTIVE_COMMANDS.has(base);
  }
}

const READ_ONLY_COMMANDS = new Set([
  'ls', 'cat', 'head', 'tail', 'find', 'grep', 'rg', 'ag', 'wc',
  'stat', 'file', 'tree', 'du', 'which', 'whereis', 'echo', 'pwd',
]);

const DESTRUCTIVE_COMMANDS = new Set([
  'rm', 'rmdir', 'mv', 'dd', 'mkfs', 'fdisk',
  'chmod', 'chown', 'chgrp',
]);
```

### 7.2 L1: MCP Tool Registry

**Phase 0 范围**：支持 `stdio` Transport 的 MCP Server 连接管理。
`sse` 和 `streamable-http` Transport 延迟到 Phase 0.5。

```typescript
// src/tools/mcp/MCPToolRegistry.ts

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export class DefaultMCPToolRegistry implements MCPToolRegistry {
  private connections = new Map<string, MCPConnection>();
  private tools = new Map<string, ToolDefinition>();

  async connect(config: MCPServerConfig): Promise<MCPConnection> {
    if (config.transport !== 'stdio') {
      throw new ConfigError(`Transport "${config.transport}" not yet supported in Phase 0`);
    }

    const transport = new StdioClientTransport({
      command: config.command!,
      args: config.args ?? [],
    });

    const client = new Client({ name: 'kyberkit', version: '0.1.0' });
    await client.connect(transport);

    // 获取 Server 暴露的工具列表
    const { tools } = await client.listTools();
    const wrappedTools = tools.map(t => this.wrapMCPTool(config.name, t, client));

    for (const tool of wrappedTools) {
      this.tools.set(tool.name, tool);
    }

    const conn: MCPConnection = { config, client, transport, tools: wrappedTools };
    this.connections.set(config.name, conn);
    return conn;
  }

  async disconnect(serverName: string): Promise<void> {
    const conn = this.connections.get(serverName);
    if (!conn) return;
    await conn.client.close();
    for (const tool of conn.tools) {
      this.tools.delete(tool.name);
    }
    this.connections.delete(serverName);
  }

  listTools(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  findTool(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  // ... wrapMCPTool: 将 MCP Tool schema 转换为 KyberKit ToolDefinition
}
```

### 7.3 L2: Skill Registry

**Phase 0 范围**：支持从项目本地 `skills/` 目录加载 SKILL.md 文件。
条件激活 (`activationPaths`) 和 MCP Skill 来源延迟到 Phase 1。

```typescript
// src/tools/skill/SkillLoader.ts

import { parseFrontmatter } from './FrontmatterParser.js';

export async function loadSkillFromDirectory(
  skillDir: string,
  source: SkillSource,
): Promise<SkillDefinition | null> {
  const skillFilePath = join(skillDir, 'SKILL.md');
  let content: string;
  try {
    content = await readFile(skillFilePath, 'utf-8');
  } catch {
    return null; // SKILL.md 不存在，跳过
  }

  const { frontmatter, body } = parseFrontmatter(content);
  const skillName = basename(skillDir);

  return {
    name: skillName,
    displayName: frontmatter.name ?? undefined,
    description: frontmatter.description ?? `Skill: ${skillName}`,
    whenToUse: frontmatter.when_to_use ?? undefined,
    allowedTools: parseAllowedTools(frontmatter['allowed-tools']),
    activationPaths: undefined, // Phase 1
    executionMode: frontmatter.context === 'fork' ? 'fork' : 'inline',
    agent: frontmatter.agent ?? undefined,
    model: frontmatter.model ?? undefined,
    hooks: undefined, // Phase 1
    source,
    async execute(args, context) {
      // 替换 ${ARGUMENTS} 占位符
      const rendered = body.replace(/\$\{ARGUMENTS\}/g, args);
      return { type: 'prompt', content: [{ type: 'text', text: rendered }] };
    },
  };
}
```

### 7.4 Facade 统一门面

```typescript
// src/tools/facade/ToolIntegrationFacade.ts

export class DefaultToolIntegrationFacade implements ToolIntegrationFacade {
  constructor(
    readonly shell: ShellExecutor,
    readonly mcp: MCPToolRegistry,
    readonly skills: SkillRegistry,
  ) {}

  findTool(query: string): ToolDefinition | SkillDefinition | null {
    // 优先级：Skill > MCP > Shell (内置)
    const skill = this.skills.find(query);
    if (skill) return skill;
    const mcpTool = this.mcp.findTool(query);
    if (mcpTool) return mcpTool;
    return null;
  }

  listAll(filter?: ToolFilter): Array<ToolDefinition | SkillDefinition> {
    return [
      ...this.skills.list(),
      ...this.mcp.listTools(),
    ];
  }
}
```

### 7.5 验收标准

- [ ] Shell: 可执行 `ls -la`，正确返回 stdout 和 exitCode
- [ ] Shell: 超时机制生效（设置 100ms 超时，执行 `sleep 5` 应触发中断）
- [ ] MCP: 可连接一个 stdio MCP Server，列出工具，调用工具并收到结果
- [ ] Skill: 从 `skills/example/SKILL.md` 加载 skill，正确解析 frontmatter
- [ ] Facade: `findTool()` 可跨三层查找

---

## 8. M5 — 模型接口层

### 8.1 Anthropic 默认实现

```typescript
// src/model/AnthropicProvider.ts

import Anthropic from '@anthropic-ai/sdk';

export class AnthropicProvider implements ModelProvider {
  readonly name = 'anthropic';
  readonly supportedModels = ['claude-sonnet-4-20250514', 'claude-haiku-35-20241022'];
  private client: Anthropic;

  constructor(config: { apiKey: string; baseUrl?: string }) {
    this.client = new Anthropic({ apiKey: config.apiKey, baseURL: config.baseUrl });
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      system: request.systemPrompt,
      messages: request.messages,
      tools: request.tools?.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })),
    });
    return this.mapResponse(response);
  }

  async *chatStream(request: ChatRequest): AsyncIterable<ChatStreamChunk> {
    const stream = this.client.messages.stream({
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      system: request.systemPrompt,
      messages: request.messages,
      tools: request.tools?.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      })),
    });
    for await (const event of stream) {
      yield this.mapStreamEvent(event);
    }
  }

  capabilities(): ModelCapabilities {
    return {
      maxContextTokens: 200_000,
      supportsTools: true,
      supportsVision: true,
      supportsStreaming: true,
      supportsThinking: true,
    };
  }

  async countTokens(content: MessageContent): Promise<number> {
    const result = await this.client.messages.countTokens({
      model: 'claude-sonnet-4-20250514',
      messages: [{ role: 'user', content }],
    });
    return result.input_tokens;
  }
}
```

### 8.2 验收标准

- [ ] 可通过 `AnthropicProvider.chat()` 完成一次完整对话
- [ ] 流式输出 `chatStream()` 能逐块返回 token
- [ ] 工具调用 (tool_use) 的请求和响应正确序列化/反序列化
- [ ] `ModelProviderRegistry` 支持注册多个 Provider，按名称查找

---

## 9. M6 — Agent 生命周期

### 9.1 纯状态机 (无副作用)

```typescript
// src/agent/AgentStateMachine.ts

/** 合法的状态转移表 */
const TRANSITIONS: Record<AgentStatus, Partial<Record<string, AgentStatus>>> = {
  created:      { start: 'initializing' },
  initializing: { ready: 'running', init_error: 'failed' },
  running:      { pause: 'paused', task_done: 'completing', kill: 'killed', error: 'failed' },
  paused:       { resume: 'running', kill: 'killed' },
  completing:   { verified: 'completed', verification_failed: 'running', kill: 'killed' },
  completed:    {},  // terminal
  failed:       {},  // terminal
  killed:       {},  // terminal
};

export function transition(current: AgentStatus, action: string): AgentStatus {
  const next = TRANSITIONS[current]?.[action];
  if (!next) {
    throw new InvalidTransitionError(current, action);
  }
  return next;
}

export function isTerminal(status: AgentStatus): boolean {
  return status === 'completed' || status === 'failed' || status === 'killed';
}
```

### 9.2 Agent 推理循环

```typescript
// src/agent/AgentLoop.ts (伪代码)

export async function runAgentLoop(
  agent: AgentInstance,
  model: ModelProvider,
  tools: ToolIntegrationFacade,
  sandbox: PermissionSandbox,
): Promise<void> {
  while (!isTerminal(agent.status)) {
    // 1. Sense: 收集当前上下文
    const context = buildContext(agent);

    // 2. Think: 调用模型
    const response = await model.chat({
      model: agent.definition.model,
      systemPrompt: agent.definition.systemPrompt,
      messages: context.messages,
      tools: tools.listAll().map(toModelToolSchema),
    });

    // 3. Act: 处理模型输出
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        const tool = tools.findTool(block.name);
        if (!tool) {
          appendToolError(agent, block.id, `Unknown tool: ${block.name}`);
          continue;
        }
        try {
          const result = await executeWithPermissionCheck(tool, block.input, sandbox, agent.context);
          appendToolResult(agent, block.id, result);
        } catch (e) {
          appendToolError(agent, block.id, e);
        }
      } else if (block.type === 'text') {
        appendAssistantText(agent, block.text);
      }
    }

    // 4. 检查终止条件
    if (response.stopReason === 'end_turn') {
      agent.transition('task_done');
      // Phase 0: 简化验证——直接 transition('verified')
      // Phase 1 将引入 VerificationPipeline
      agent.transition('verified');
    }
  }
}
```

### 9.3 验收标准

- [ ] 状态机: 8 种状态 × 所有 action 的转移正确性 (表驱动测试)
- [ ] 状态机: 非法转移抛出 `InvalidTransitionError`
- [ ] 推理循环: 可完成一个 "echo hello" 级别的端到端对话
- [ ] 推理循环: 工具调用 → 权限检查 → 执行 → 结果插入 消息链正确

---

## 10. M7 — 配置加载器

### 10.1 Config Schema (Zod)

```typescript
// src/types/config.ts

import { z } from 'zod';

export const KyberConfigSchema = z.object({
  /** 框架版本 */
  version: z.string().default('0.1'),

  /** 模型配置 */
  model: z.object({
    provider: z.string().default('anthropic'),
    name: z.string().default('claude-sonnet-4-20250514'),
    apiKey: z.string().optional(), // 支持 env var 展开: ${ANTHROPIC_API_KEY}
    baseUrl: z.string().optional(),
    maxTokens: z.number().default(4096),
  }),

  /** 权限配置 */
  permissions: z.object({
    allowed: z.array(z.string()).default([
      'read_fs', 'exec_shell', 'read_net', 'read_env',
    ]),
    denied: z.array(z.string()).default([]),
    allowedPaths: z.array(z.string()).default(['./']),
    allowedDomains: z.array(z.string()).default([]),
  }).default({}),

  /** MCP Server 配置 */
  mcp: z.object({
    servers: z.array(z.object({
      name: z.string(),
      transport: z.enum(['stdio', 'sse', 'streamable-http']).default('stdio'),
      command: z.string().optional(),
      args: z.array(z.string()).default([]),
      url: z.string().optional(),
      trustLevel: z.enum(['trusted', 'sandboxed', 'untrusted']).default('sandboxed'),
    })).default([]),
  }).default({}),

  /** Skill 加载路径 */
  skills: z.object({
    paths: z.array(z.string()).default(['./skills']),
  }).default({}),

  /** Agent 定义 */
  agent: z.object({
    name: z.string().default('default'),
    systemPrompt: z.string().optional(),
    systemPromptFile: z.string().optional(), // 指向 KK.md
  }).default({}),
});

export type KyberConfig = z.infer<typeof KyberConfigSchema>;
```

### 10.2 验收标准

- [ ] 最小配置 (`version: "0.1"` + `model.apiKey`) 即可启动
- [ ] 环境变量展开：`${ANTHROPIC_API_KEY}` 正确替换
- [ ] 无效配置抛出 `ConfigError`，附带人类可读的 Zod 校验错误

---

## 11. M8 — Runtime 引导

### 11.1 Bootstrap 序列

```typescript
// src/runtime/KyberRuntime.ts

export class KyberRuntime {
  private bus!: TypedEventBus<KyberEvents>;
  private tools!: ToolIntegrationFacade;
  private model!: ModelProvider;
  private sandbox!: PermissionSandbox;
  private config!: KyberConfig;

  async bootstrap(configPath?: string): Promise<void> {
    // Step 1: 加载配置
    this.config = await loadConfig(configPath ?? 'kyberkit.config.yaml');

    // Step 2: 初始化事件总线
    this.bus = new TypedEventBus<KyberEvents>();

    // Step 3: 构建权限沙箱
    this.sandbox = buildSandbox(this.config.permissions);

    // Step 4: 初始化模型提供者
    this.model = await buildModelProvider(this.config.model);

    // Step 5: 初始化工具集成层
    const shell = new DefaultShellExecutor();
    const mcp = new DefaultMCPToolRegistry();
    const skills = new DefaultSkillRegistry();

    // Step 5a: 加载 MCP Servers
    for (const serverConfig of this.config.mcp.servers) {
      await mcp.connect(serverConfig);
      this.bus.emit('mcp.connected', { serverName: serverConfig.name });
    }

    // Step 5b: 加载 Skills
    for (const skillPath of this.config.skills.paths) {
      await skills.loadFromDirectory(skillPath, 'project');
    }

    this.tools = new DefaultToolIntegrationFacade(shell, mcp, skills);

    // Step 6: Ready
    console.log(`[KyberKit] Runtime bootstrapped (${mcp.listTools().length} MCP tools, ${skills.list().length} skills)`);
  }

  async createAgent(definition?: Partial<AgentDefinition>): Promise<AgentInstance> {
    const fullDef = mergeWithConfigDefaults(definition, this.config);
    const agent = new AgentInstance(fullDef, this.sandbox.fork({}));
    this.bus.emit('agent.created', { agentId: agent.id, definition: fullDef });
    return agent;
  }

  async runAgent(agent: AgentInstance): Promise<void> {
    await runAgentLoop(agent, this.model, this.tools, agent.sandbox);
  }

  async shutdown(): Promise<void> {
    // 断开所有 MCP 连接
    // 清理事件监听器
    this.bus.removeAllListeners();
  }
}
```

### 11.2 验收标准

- [ ] `KyberRuntime.bootstrap()` 可从 `kyberkit.config.yaml` 引导完整运行时
- [ ] `createAgent()` → `runAgent()` 可完成一次端到端对话
- [ ] `shutdown()` 正确释放所有资源（MCP 连接、事件监听器）

---

## 12. M9 — CLI 脚手架

### 12.1 实现

```typescript
// src/cli/init.ts

import { mkdir, writeFile, copyFile } from 'fs/promises';
import { join } from 'path';

export async function initProject(projectName: string): Promise<void> {
  const root = join(process.cwd(), projectName);

  // 创建目录结构
  await mkdir(join(root, 'src', 'tools'), { recursive: true });
  await mkdir(join(root, 'src', 'prompts'), { recursive: true });
  await mkdir(join(root, 'skills', 'example'), { recursive: true });
  await mkdir(join(root, 'mcp'), { recursive: true });
  await mkdir(join(root, 'tests'), { recursive: true });

  // 写入模板文件
  await writeFile(join(root, 'kyberkit.config.yaml'), CONFIG_TEMPLATE);
  await writeFile(join(root, 'KK.md'), KK_MD_TEMPLATE);
  await writeFile(join(root, 'src', 'agent.ts'), AGENT_TS_TEMPLATE);
  await writeFile(join(root, 'skills', 'example', 'SKILL.md'), SKILL_EXAMPLE_TEMPLATE);
  await writeFile(join(root, 'package.json'), PACKAGE_JSON_TEMPLATE(projectName));
  await writeFile(join(root, 'tsconfig.json'), TSCONFIG_TEMPLATE);
  await writeFile(join(root, '.env.example'), ENV_EXAMPLE_TEMPLATE);

  console.log(`\n✓ Project "${projectName}" created at ${root}`);
  console.log(`\nNext steps:`);
  console.log(`  cd ${projectName}`);
  console.log(`  bun install`);
  console.log(`  cp .env.example .env  # 填写 ANTHROPIC_API_KEY`);
  console.log(`  bun run src/agent.ts`);
}
```

### 12.2 验收标准

- [ ] `kyberkit init my-agent` 生成完整的目录结构
- [ ] 生成的项目可直接 `bun install && bun run src/agent.ts` 正常启动
- [ ] `kyberkit.config.yaml` 包含所有必要的默认配置

---

## 13. 实现顺序与里程碑

```
Week 1-2  ▓▓▓▓▓▓▓▓▓▓  M1 Types + M2 Events + M3 Permission
Week 3-4  ▓▓▓▓▓▓▓▓▓▓  M4.L0 Shell + M4.L2 Skill (本地加载)
Week 5-6  ▓▓▓▓▓▓▓▓▓▓  M4.L1 MCP + M4 Facade + M5 Model Provider
Week 7-8  ▓▓▓▓▓▓▓▓▓▓  M6 Agent Lifecycle + M7 Config + M8 Runtime
Week 9-10 ▓▓▓▓▓▓▓▓▓▓  M9 CLI + 集成测试 + E2E 验证 + 文档
```

| 里程碑 | 周次 | 交付物 | 验收 |
|--------|------|--------|------|
| **Alpha** | W4 | Shell + Skill 可独立执行 | 单元测试全绿 |
| **Beta** | W6 | MCP 连接 + 模型调用 + 权限拦截 | 集成测试全绿 |
| **RC** | W8 | 端到端 Agent Loop 运行 | E2E 场景通过 |
| **GA** | W10 | CLI 脚手架 + 文档 + 发布准备 | MVP 验收场景通过 |

---

## 14. 验证计划

### 14.1 单元测试

每个模块 (`M1`-`M9`) 均有对应的 `.test.ts`，使用 **Vitest** 框架。

```bash
bun run vitest --coverage
```

目标覆盖率：**≥ 85% (lines)**，核心模块 (M3 Permission, M6 StateMachine) **≥ 95%**。

### 14.2 集成测试

```typescript
// tests/integration/runtime-bootstrap.test.ts

test('KyberRuntime 端到端引导', async () => {
  const rt = new KyberRuntime();
  await rt.bootstrap('fixtures/minimal-config.yaml');

  const agent = await rt.createAgent({
    systemPrompt: 'You are a test assistant. Reply with "HELLO" to any message.',
  });

  // 验证 Agent 状态转移
  expect(agent.status).toBe('created');
  await rt.runAgent(agent);
  expect(agent.status).toBe('completed');

  await rt.shutdown();
});
```

### 14.3 E2E 验证场景

| 场景 | 步骤 | 预期结果 |
|------|------|----------|
| **脚手架生成** | `kyberkit init test-agent` | 生成完整目录，`bun install` 成功 |
| **最小对话** | 配置 Anthropic key，启动 AgentLoop | 模型回复，Agent 状态到达 `completed` |
| **工具调用** | Agent 执行 `ls -la` (Shell) | 权限检查通过，stdout 正确返回 |
| **权限拦截** | Agent 尝试 `rm -rf /`，denied 权限 | 抛出 `PermissionDeniedError`，Agent 不崩溃 |
| **MCP 集成** | 连接一个 `@modelcontextprotocol/server-filesystem` | 工具列表正确加载，文件读取成功 |
| **Skill 加载** | 定义一个 `skills/greet/SKILL.md` | Skill 注册成功，可通过 `findTool('greet')` 发现 |

---

## 附录 A — 核心数据流

### A.1 Agent 推理循环 (Sense-Think-Act)

```
User Input
    │
    ▼
┌────────────────┐
│  Context Build  │  ← 上下文组装 (系统提示 + 历史消息 + 工具列表)
└───────┬────────┘
        │
        ▼
┌────────────────┐
│  Model.chat()  │  ← LLM 推理 (可能返回 text 或 tool_use)
└───────┬────────┘
        │
        ├── [text]    → 追加到消息历史 → 检查 end_turn
        │
        └── [tool_use] → ┌──────────────────────────────┐
                         │  Permission Sandbox Check    │
                         └───────────┬──────────────────┘
                                     │
                              ┌──────┴──────┐
                              │ Denied      │ Allowed
                              ▼             ▼
                    PermissionDenied   ┌───────────────┐
                    Error 追加到       │ Tool.validate │
                    消息历史          │ + Tool.call() │
                                      └───────┬───────┘
                                              │
                                   ToolResult 追加到消息历史
                                              │
                                      ┌───────▼───────┐
                                      │  继续循环     │
                                      │  (下一轮推理) │
                                      └───────────────┘
```

### A.2 Bootstrap 引导序列

```
kyberkit.config.yaml
        │
        ▼
  ConfigLoader.load()     ← Zod Schema 校验 + 环境变量展开
        │
        ▼
  EventBus 初始化          ← 全局事件通道
        │
        ▼
  PermissionSandbox 构建   ← 从 config.permissions 创建
        │
        ▼
  ModelProvider 初始化     ← Anthropic SDK 实例化
        │
        ▼
  ShellExecutor 初始化     ← 无状态，直接构造
        │
        ▼
  MCPToolRegistry 初始化   ← 遍历 config.mcp.servers，逐个 connect
        │
        ▼
  SkillRegistry 初始化     ← 遍历 config.skills.paths，加载 SKILL.md
        │
        ▼
  ToolIntegrationFacade    ← 组装三层
        │
        ▼
  Runtime Ready ✓
```

---

## 附录 B — 外部依赖清单

| 依赖 | 版本 | 用途 | 包大小 |
|------|------|------|--------|
| `zod` | ^3.x | Schema 校验 | ~60KB |
| `@anthropic-ai/sdk` | ^0.39.x | Anthropic API 客户端 | ~400KB |
| `@modelcontextprotocol/sdk` | ^1.x | MCP 协议客户端 | ~200KB |
| `yaml` | ^2.x | YAML 配置文件解析 | ~120KB |
| `vitest` | ^3.x | 测试框架 (devDependency) | — |

> **零框架原则**: Phase 0 不引入 Express、Fastify 等 HTTP 框架。
> 不引入 React、Ink 等 TUI 框架。KyberKit Kernel 是纯 Headless 库。

---

> **文档状态**: Phase 0 实现规范 v0.1 Draft。待 User 审批后进入 TDD 编码阶段。
