# Filesystem MCP — 启用与验收（Kevin）

> **对应任务**: Sprint 2 Task 2.2、Sprint 3 Task 3.5  
> **关联设计**: [kevin-system-design.md](kevin-system-design.md) §8、[sprint2-Context&MCP.md](sprint2-Context%26MCP.md)

本 runbook 描述如何在开发者机器上启用 **官方 `@modelcontextprotocol/server-filesystem`**，并做一次 **`read_file` 端到端验收**。不在 CI 中强依赖（需本机 API Key 与网络拉包）。

---

## 1. 前置条件

- 仓库根目录已配置 KyberKit **`.env`**（含 LLM 与 `KYBER_AGENT_DEF` 等），可参考根目录 `.env.example`。
- 已安装 **Node/npm**（用于 `npx` 拉起 MCP 子进程）与 **Bun**（Sidecar）。

---

## 2. 配置 Filesystem MCP

在仓库根 `.env` 中取消注释并填写（路径请按本机修改）：

```bash
KYBER_MCP_SERVER_1_NAME=filesystem
KYBER_MCP_SERVER_1_TRANSPORT=stdio
KYBER_MCP_SERVER_1_COMMAND=npx
KYBER_MCP_SERVER_1_ARGS=-y,@modelcontextprotocol/server-filesystem,<ABS_PATH_TO_WORKSPACE_DATA>
KYBER_MCP_SERVER_1_TRUST=sandboxed
```

**推荐 `<ABS_PATH_TO_WORKSPACE_DATA>`**：指向本仓库 `spaces/default/data` 的**绝对路径**，与 Kevin 模板、站会模拟数据一致。

**与 `KYBER_SPACES_ROOT` 的关系**：

- Sidecar / SQLite 使用 `KYBER_SPACES_ROOT` 推导 `spaces/<user>/.kyberkit/`（见 `src-sidecar/db.ts`）。
- Filesystem MCP 的 `npx ... server-filesystem <path>` 决定 Agent **可列出/读取的根目录**，两者宜对齐在同一「用户工作区」语义下，避免 Agent 读到与 Kevin DB 不一致的树。

---

## 3. 启动顺序

1. 保存 `.env`。
2. 启动 Sidecar（任选其一）：
   - `cd <repo> && bun src-sidecar/index.ts`
   - 或 `cd app && ./kevin start`
3. 启动前端：`cd app && npm run dev`（或 Tauri：`npm run tauri:dev`）。

---

## 4. 验收步骤

1. 打开 Kevin UI，确认 `GET http://127.0.0.1:3001/health` 返回 `ok`。
2. 新建会话，在右侧输入：

   > 请读取 `templates/standup-data.md`（或 `commands/README.md`）的要点并三句话总结。不要编造文件里不存在的数据。

3. **通过标准**：
   - 轨迹区出现 **`read_file`**（或等价工具）调用记录；
   - 回答内容与文件实际内容一致。

若工具未出现：检查 `npx` 是否在 PATH、MCP 行是否被注释、`ARGS` 路径是否存在空格/权限问题。

---

## 5. 故障排查速查

| 现象 | 可能原因 |
|------|----------|
| Sidecar 启动报错 MCP | `KYBER_MCP_SERVER_1_NAME` 未设置或拼写错误 |
| 工具调用失败 | MCP 根路径未包含目标文件；或 trust 级别与 Runtime 策略不匹配 |
| 模型不调用工具 | 模型/温度/提示词导致；可明确要求「必须先 read_file」 |

---

## 6. 修订记录

| 日期 | 内容 |
|------|------|
| 2026-05-04 | 初版：从 sprint2 规格抽出为独立 runbook |
