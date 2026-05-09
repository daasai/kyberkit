# Kevin v1.5 规格索引

本目录沉淀 **Kevin v1.5**（KyberKit 桌面终端 — 资产分层、Skill Forge、HITL、异步任务）的产品与**工程契约**。实现代码分散在仓库根目录的 `app/`、`src-sidecar/`、`src/runtime/`、`agents/kevin/` 与 **`${KEVIN_NODE_ROOT}`**（默认 `~/.kyberkit/kevin/`，见 [tier-architecture.md](./tier-architecture.md)）及 Library 挂载目录。

## 先读这些

| 文档 | 用途 |
|------|------|
| [kevin-v1.5-prd-rev2.md](./kevin-v1.5-prd-rev2.md) | **产品需求文档（PRD）主本**：范围、GUI、Skill、Sign-off、验收指标 |
| [kevin-v1.5-prd-rev3.md](./kevin-v1.5-prd-rev3.md) | **PRD Rev3 — 架构补丁**：Space/Library、`KYBER_SPACES_ROOT` 边界、本机路径 `~/.kyberkit/kevin/`；与 Rev2 冲突时 **以 Rev3 为准** |
| [tier-architecture.md](./tier-architecture.md) | **资产分层与路径契约（Rev3）**：`KEVIN_NODE_ROOT`、`lib-<libraryId>/`、Library 挂载 |
| [kevin-v1.5-system-refactor-spec.md](./kevin-v1.5-system-refactor-spec.md) | **Rev3 系统重构规格**：阶段划分、API/数据增量、验收闸门 |
| [skill-architecture.md](./skill-architecture.md) | **SKILL.md 规范**、三级 scope、加载器、Forge / Store API |
| [task-lifecycle.md](./task-lifecycle.md) | **异步任务状态机**、Cron、SSE、`space_id` 隔离 |
| [signoff-contract.md](./signoff-contract.md) | **HITL Sign-off**、审计日志、Actuator 风险分级 |
| [UAT/uat_mvp_rc_2026-05-09.md](./UAT/uat_mvp_rc_2026-05-09.md) | **MVP-RC UAT 报告**（C 方案 5 个 Sprint，S-1~S-12 全量交付，2026-05-09） |

## v1.0 对照

| 文档 | 用途 |
|------|------|
| [../kevin1.0/sprint-plan-v2.md](../kevin1.0/sprint-plan-v2.md) | MVP Sprint 1–4 完成状态 |
| [../kevin1.0/kevin-system-design.md](../kevin1.0/kevin-system-design.md) | v1.0 系统设计（Sidecar API、SSE、持久化） |

## 示例 Skill 契约（蓝本，不预装）

PRD §9.1：以下目录供研发与 IT 手动安装参考，**主版本 Onboarding 不预装**。

| 目录 | 场景 |
|------|------|
| [skills/standup-brief/](./skills/standup-brief/) | 站会数据简报 |
| [skills/prd-draft/](./skills/prd-draft/) | PRD / 运营方案起草 |
| [skills/weekly-report/](./skills/weekly-report/) | 周报生成 |

---

**维护约定**：架构或 API 有重大变更时，先更新 **Rev3** 相关契约（`kevin-v1.5-prd-rev3.md`、`tier-architecture.md`、`kevin-v1.5-system-refactor-spec.md`）及 `skill-architecture.md` / `task-lifecycle.md` / `signoff-contract.md`，再同步实现与 [../kevin1.0/kevin-system-design.md](../kevin1.0/kevin-system-design.md)（或后续独立的 `kevin-v1.5-system-design.md`）。
