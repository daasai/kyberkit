# KyberKit

**KyberKit** 是 Kevin 使用的 **Agent 控制论底座 (Cybernetic Harness)**：为智能体提供权限沙箱、工具门面（Shell / MCP / Skills）、分层记忆、检查点、可观测性与资源预算等能力。本目录为 **npm workspace 包** `kyberkit`，可被同仓 `src-sidecar` 或其它包以 `workspace:*` 依赖。

Kevin 产品说明与仓库总览见 [仓库根 `README.md`](../../README.md)。

---

## 核心哲学：确定性优先

- **概率性层**：仅 LLM 推理、规划与压缩。
- **确定性层**：任务执行、权限、状态机与校验由纯代码保证；任务图悖论在执行前拦截。

---

## 架构概要（五层）

1. **Micro-Kernel**：生命周期、沙箱、L0 Shell / L1 MCP / L2 Skills。  
2. **Reliability**：分层记忆、原子检查点（write-then-rename）。  
3. **Observability**：本地轨迹 SQLite（`KYBER_TELEMETRY_TRAJECTORY_*` 控制）；REPL `/stats`；CLI `trajectory export`。  
4. **Intelligence**：确定性 DAG、上下文预算。  
5. **Scale**：消息总线、资源硬熔断。

---

## CLI

从**仓库根**执行（根 `package.json` 已转发到本包）：

```bash
bun run chat
bun run chat:no-tui
```

在本包目录内：

```bash
bun run bin/kyberkit --help
```

---

## 测试

```bash
cd packages/kyberkit && bun test ./src
```

---

## 变更记录

见 [CHANGELOG.md](./CHANGELOG.md)。
