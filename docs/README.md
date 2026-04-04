# KyberKit 架构文档

下一代通用 AI Agent 操作系统框架的技术架构文档。

## 文档索引

| 文档 | 说明 | 状态 |
|------|------|------|
| [design.md](./design.md) | 总体架构设计规范 (v1.2) | ✅ 已完成 |
| [phase0-kernel-spec.md](./phase0-kernel-spec.md) | Phase 0 微内核详细实现规范 (v0.1) | 📝 评审中 |
| phase1-reliability-spec.md | Phase 1 可靠性层详细实现规范 | ⏳ 待产出 |

## 架构概览

```
KyberKit = Micro-Kernel + Pluggable Modules

Phase 0 (Kernel)       → Runtime Lifecycle, Tool Integration Layer, Permission Sandbox
Phase 1 (Reliability)  → Memory, Checkpoint, Validation, Exception Handling
Phase 2 (Observability)→ OpenTelemetry, Health Dashboard, Trajectory Store
Phase 3 (Intelligence) → Context Engineering, Planner, Workflow Engine
Phase 4 (Scale)        → Multi-Agent, Long-Running, Security Domain
```

## 工具集成层 — 三层架构

```
┌─────────────────────────────────────────────────┐
│  L2 意图层 — Skill Registry                     │  "完成一个任务"
│  Markdown + YAML Frontmatter                    │  面向知识工作者
├─────────────────────────────────────────────────┤
│  L1 能力层 — MCP Tool Registry                  │  "调用一个能力"
│  JSON Schema + JSON-RPC 2.0                     │  面向集成开发者
├─────────────────────────────────────────────────┤
│  L0 原语层 — Shell Executor                     │  "执行一个命令"
│  Shell 命令 + 安全防护                           │  面向系统操作
└─────────────────────────────────────────────────┘

依赖方向：Skill → MCP → Shell（单向）
统一入口：ToolIntegrationFacade
```

## 关键设计原则

1. **确定性优先** — 组件标注 `[D]`/`[P]`，概率性组件不得出现在关键路径
2. **微内核可剥离** — 智能逻辑以可插拔模块存在，可随模型能力迭代移除
3. **三层工具集成** — Shell / MCP / Skills 三层各有明确职责，均为一等公民
4. **SPI 驱动** — 25+ 个标准化 Service Provider Interface，全部可替换默认实现
5. **分阶段交付** — Phase 0 (8-10w) 是 MVP，后续按需迭代
