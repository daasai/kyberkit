# Kevin 智能体分层架构备忘（Agent Network）

更新时间：2026-05-03  
适用范围：Kevin 1.0（并为 Peter/XX 等智能体预留统一架构）

**实现态姊妹文档**：[kevin-system-design.md](kevin-system-design.md) — Kevin 1.0 当前进程拓扑、Sidecar API/SSE、持久化路径、Tauri 与 Sidecar 生命周期及环境变量（与本文「应然」架构互为补充）。

## 1. 目标与背景

KyberKit 从 2.0 开始向多租户、多用户演进，`Workspace` 的核心职责是隔离用户私有资产（上下文、记忆、知识库、技能库）。  
本次 Kevin `<artifact>` 协议丢失问题，暴露了一个架构混淆：Agent 产品定义被放入了 `.env`，导致与基础设施配置耦合。

本备忘的目标是统一后续约束：**将 Agent 产品定义下沉到 `agents/<agent-id>/`，运行时只负责加载和执行。**

## 2. 四层模型（职责边界）

1. Runtime 层（KyberKit 引擎）
   - 负责 AgentLoop、PromptAssembler、Memory、Tool、PermissionSandbox 等执行能力。
   - 不承载某个具体 Agent 的业务人格定义。
2. Agent Definition 层（产品定义）
   - 目录形态：`agents/kevin/`, `agents/peter/`, `agents/xx/`。
   - 承载 Agent 的名称、平台级输出协议、权限策略等“产品决策”。
3. Workspace 层（用户私有资产）
   - 目录形态：`spaces/<user>/<workspace>/...`。
   - 承载用户记忆、知识库、技能库、偏好。
4. Terminal 层（交互终端）
   - Kevin 桌面端 `app/` 只是 Kevin 智能体的一种终端，不是 Runtime 本体。

## 3. 配置归属原则

应保留在 `.env`（基础设施）：
- API Key、模型服务地址、模型名称
- MCP Server 连接参数（含环境路径）

应迁移到 `agents/kevin/`（Agent 产品定义）：
- Agent 名称（如 `Kevin`）
- 平台级输出协议（如 `<artifact>...</artifact>`）
- Agent 级权限策略（如 `denied: ['write_fs']`）

## 4. 本次问题的根因

已有链路中，`KYBER_AGENT_SYSTEM_PROMPT` 被加载到 `config.agent.systemPrompt`，但启用 `PromptAssembler` 后最终 system prompt 由 assembler 结果决定。  
由于 assembler 中没有“平台级指令”专属 provider，`.env` 中的 `<artifact>` 指令没有稳定进入最终提示词，导致模型输出偏离协议。

## 5. 本次修复方案（中期方案落地）

1. 新增 `AgentProductDef` 类型，作为 Runtime 与 Agent Definition 的契约。
2. 建立 `agents/kevin/`：
   - `directives.md`：保存 `<artifact>` 协议文本
   - `kevin.agent.ts`：导出 Kevin 定义（name/platformDirective/permissions）
3. 新增 `PlatformDirectiveProvider`（priority=0）：
   - 专门注入平台级输出协议
   - 与 `IdentityProvider`（workspace 身份）解耦
4. `KyberRuntime.bootstrap()` 支持从 `KYBER_AGENT_DEF` 动态加载 Agent 定义：
   - 优先应用 `name`
   - 优先应用 `permissions`
   - 透传 `platformDirective` 到 PromptAssembler 上下文
5. `.env` 删除 Agent 产品定义字段，仅保留基础设施字段，并新增：
   - `KYBER_AGENT_DEF=./agents/kevin/kevin.agent.ts`

## 6. 长期演进建议

1. 将 `bootstrap()` 升级为显式参数模式：`bootstrap({ agentDef })`，逐步降低 env 驱动。
2. 引入 `agents/registry`，支持多 Agent 路由（Kevin/Peter/XX）。
3. 在平台化部署中按租户动态装配 Agent Definition + Workspace，避免硬编码单 Agent。
4. 为 Agent Definition 增加 schema 校验与版本字段，降低运行时加载风险。

