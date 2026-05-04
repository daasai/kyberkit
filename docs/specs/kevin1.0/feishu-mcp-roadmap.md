# 飞书文档 MCP — 路线图（Sprint 4 P1）

> **状态**: 未实现 — 占位规格  
> **来源**: [sprint-plan-v2.md](sprint-plan-v2.md) Sprint 4 Task 4.3；[sprint3-Sessions&ScenarioA.md](sprint3-Sessions%26ScenarioA.md) Out of Scope

---

## 1. 目标（MVP）

为 Kevin Agent 提供 **只读** 访问飞书云文档的能力（标题、正文纯文本/Markdown 导出、文档元数据），用于站会/PRD 等「活文档」拉取，而非双向编辑。

---

## 2. 技术选项（待选型）

| 方向 | 优点 | 风险 / 成本 |
|------|------|-------------|
| 官方 / 社区 MCP Server（若存在稳定实现） | 与现有 `KYBER_MCP_SERVER_*` 配置一致 | 依赖维护与鉴权模型 |
| 自建轻量 MCP（Rust/TS stdio） | 可控、可最小权限 | 开发 + 飞书开放平台审核 |

---

## 3. 安全与配置

- **Token**：仅通过环境变量或 OS Keychain 注入，不写入仓库。
- **最小权限**：仅文档只读 scope；明确禁止写接口在 MVP 阶段暴露给 Agent。
- **Workspace 边界**：与 Filesystem MCP 相同，在 `directives.md` 中写清「飞书文档仅作引用源，落盘产物仍在 `<artifact>` / Workspace 规则内」。

---

## 4. 验收草案（未来）

1. 在测试飞书租户创建一篇固定结构的测试文档。
2. Agent 在轨迹中展示飞书读工具调用，返回内容与文档一致。
3. 错误场景：token 失效、无权限 — UI 轨迹可读、不崩溃。

---

## 5. 修订记录

| 日期 | 内容 |
|------|------|
| 2026-05-04 | 初版：占位路线图，待 Sprint 4 中段排期 |
