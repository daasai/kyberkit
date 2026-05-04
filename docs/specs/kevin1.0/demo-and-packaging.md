# Kevin — 演示流程与打包说明

> **对应任务**: Sprint 4 Task 4.2 / 4.4 / 4.5（部分）  
> **系统设计**: [kevin-system-design.md](kevin-system-design.md)

---

## 1. 演示前健康检查

在仓库根（或任意终端）执行：

```bash
curl -sS http://127.0.0.1:3001/health | head -c 400
```

期望 JSON 内含 `status: ok`，且 `sessionCount`（或兼容字段 `sessions`）为数字。

前端默认连接 `http://localhost:3001`；若 Sidecar 仅绑定 `127.0.0.1`，一般仍可互通；若遇 CORS 或连接问题，在 `app` 侧使用 `VITE_SIDECAR_URL=http://127.0.0.1:3001`。

---

## 2. 推荐演示路径（15 分钟内）

1. **多会话**：左侧「新建会话」→ 确认列表出现新条目 → 再建一条，切换高亮。
2. **快速启动**：右侧「快速启动」→「起草产品升级 Spec」→ 观察轨迹与中间画布流式更新（依赖 LLM 与 MCP 已配置）。
3. **持久化**：生成含 `<artifact>` 的文档后，重启 Sidecar → `GET /sessions` 仍能看到会话；点选历史会话，中间栏恢复内容。
4. **桌面壳（可选）**：`cd app && npm run tauri:dev` — 确认 WebView 加载 Vite；若未手动起 Sidecar，Tauri 将尝试自动 `bun` 拉起（见系统设计 §7）。

---

## 3. macOS 打包（Tauri）

```bash
cd app
npm run build
npm run tauri:build
```

产物位于 `app/src-tauri/target/release/bundle/`（`.app`、`.dmg` 等，视 `tauri.conf.json` 的 `bundle.targets` 而定）。

**当前限制（实现态）**：

- 自动 Sidecar 仍依赖本机 **`bun`** 与**可解析的仓库路径**；分发到无开发环境机器前，需完成「Sidecar 二进制化 + 资源路径 + `KYBER_SPACES_ROOT` 指向应用数据目录」改造（见 [kevin-system-design.md](kevin-system-design.md) §7.4）。

---

## 4. 与 `./app/kevin` 脚本的关系

- `./app/kevin start`：在仓库上下文下同时管理 Sidecar 与 Vite，适合纯 Web 开发。
- `tauri dev`：Tauri 自带 `npm run dev`；Sidecar 由 Rust `setup` 尝试启动，**或与 `kevin` 并行**（此时端口 `3001` 已占用则跳过自动 spawn）。

避免重复启动 **两个** Vite（均占 `5173`）：不要同时运行 `kevin start` 的 Vite 与 `tauri dev` 内嵌的 `npm run dev`，除非改端口。

---

## 5. 修订记录

| 日期 | 内容 |
|------|------|
| 2026-05-04 | 初版：健康检查、演示顺序、Tauri 构建注意 |
