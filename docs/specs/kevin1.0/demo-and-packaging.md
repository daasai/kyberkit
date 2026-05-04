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
npm run tauri:build
```

`tauri build` 会先执行 `beforeBuildCommand`（`npm run build && npm run build:sidecar`）：Vite 产物进 `dist/`，Sidecar 编译为 **单文件原生二进制** 并作为 `externalBin` 打入应用包。

**产物路径**：`app/src-tauri/target/release/bundle/macos/Kevin.app`

**Sidecar 冒烟（不启动 GUI）** — 使用与发布包相同的编译二进制、仓库根 `.env`（若存在）：

```bash
cd app
npm run verify:kevin
```

期望输出 `[verify-kevin-release] PASS` 且 `curl` 到的 `health.status === "ok"`。执行前请确保 **`3001` 端口未被占用**。

### 3.1 `.dmg` 说明

仓库当前将 `bundle.targets` 设为 **`["app"]`**，以避免部分环境缺少 DMG 打包依赖导致 `bundle_dmg.sh` 失败。需要磁盘映像分发时，在已配置 Tauri DMG 依赖的 macOS 上把 `targets` 改回包含 `"dmg"` 再构建。

### 3.2 发布包内密钥与 `kevin.env`

首次从 Finder 启动 Kevin 时，请将含 `ANTHROPIC_API_KEY`（等）的 dotenv 文件保存为：

`~/Library/Application Support/ai.kyberkit.kevin/Kevin/kevin.env`

（具体 `Application Support` 子路径以 Tauri `identifier` `ai.kyberkit.kevin` 为准，见 [kevin-system-design.md](kevin-system-design.md) §7。）

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
