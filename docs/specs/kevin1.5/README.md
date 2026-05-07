# Kevin v1.5 规格索引

本目录沉淀 **Kevin v1.5**（KyberKit 桌面终端 — 三层资产、Skill Forge、HITL、异步任务）的产品与**工程契约**。实现代码分散在仓库根目录的 `app/`、`src-sidecar/`、`src/runtime/`、`agents/kevin/` 与 `~/.kyberkit/`（用户层）及 Space 数据目录。

## 先读这些

| 文档 | 用途 |
|------|------|
| [kevin-v1.5-prd-rev2.md](./kevin-v1.5-prd-rev2.md) | **产品需求文档（PRD）**：范围、GUI、Skill、Sign-off、验收指标 |
| [tier-architecture.md](./tier-architecture.md) | **三层资产架构**：Global / User / Space 物理路径、迁移、初始化 |
| [skill-architecture.md](./skill-architecture.md) | **SKILL.md 规范**、三级 scope、加载器、Forge / Store API |
| [task-lifecycle.md](./task-lifecycle.md) | **异步任务状态机**、Cron、SSE、`space_id` 隔离 |
| [signoff-contract.md](./signoff-contract.md) | **HITL Sign-off**、审计日志、Actuator 风险分级 |

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

**维护约定**：架构或 API 有重大变更时，先更新本目录工程契约（`tier-architecture.md` / `skill-architecture.md` / `task-lifecycle.md` / `signoff-contract.md`），再同步实现与 [../kevin1.0/kevin-system-design.md](../kevin1.0/kevin-system-design.md)（或后续独立的 `kevin-v1.5-system-design.md`）。
