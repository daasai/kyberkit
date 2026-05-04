# Kevin 1.0 规格索引

本目录沉淀 **Kevin MVP（KyberKit 桌面终端）** 的产品与技术规格。实现代码分散在仓库根目录的 `app/`、`src-sidecar/`、`agents/kevin/` 与 `spaces/`。

## 先读这些

| 文档 | 用途 |
|------|------|
| [sprint-plan-v2.md](sprint-plan-v2.md) | 总路线图：Sprint 1–4 状态与任务表 |
| [kevin-system-design.md](kevin-system-design.md) | **系统设计主文档**：进程拓扑、API、SSE、环境变量、Tauri 与 Sidecar 生命周期 |
| [agent-network-architecture.md](agent-network-architecture.md) | 四层职责边界（Runtime / Agent Def / Workspace / Terminal） |

## Sprint 设计规格

| Sprint | 文档 |
|--------|------|
| 1 | [sprint1-Foundation&UI Shell.md](sprint1-Foundation%26UI%20Shell.md) |
| 2 | [sprint2-Context&MCP.md](sprint2-Context%26MCP.md) |
| 3 | [sprint3-Sessions&ScenarioA.md](sprint3-Sessions%26ScenarioA.md) |

## 运行、验收与封版

| 文档 | 用途 |
|------|------|
| [mcp-filesystem-runbook.md](mcp-filesystem-runbook.md) | Filesystem MCP 启用与 `read_file` 验收步骤 |
| [demo-and-packaging.md](demo-and-packaging.md) | 演示流程、健康检查、`npm run verify:kevin`、Tauri `.app` 构建与可选 DMG |
| [feishu-mcp-roadmap.md](feishu-mcp-roadmap.md) | Sprint 4 P1：飞书文档 MCP（占位与范围） |

## 产品与探索

| 文档 | 用途 |
|------|------|
| [kevin-product-plan-mvp.md](kevin-product-plan-mvp.md) | MVP 产品叙述与 Scenario A |
| [artifact-discovery-upgrade.md](artifact-discovery-upgrade.md) | 产物发现能力升级备忘 |

---

**维护约定**：对架构、数据流、部署有重大变更时，**优先更新** [kevin-system-design.md](kevin-system-design.md)，再在 `sprint-plan-v2.md` 中调整任务状态，避免 sprint 分册与实现脱节。
