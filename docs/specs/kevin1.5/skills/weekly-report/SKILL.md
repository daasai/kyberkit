---
name: weekly-report
description: 当用户需要在周末根据个人 OKR 汇总整周系统数据与任务进展、生成绩效周报时使用。会自动框定本周时间范围，严格读取 OKR 文档中的 KR 目标值进行差值计算。
allowed-tools:
  - artifact.markdown
  - artifact.feishu-doc

kevin:
  risk: medium
  triggers:
    - manual
    - "cron:0 17 * * 5"
  sensors:
    required: [local-fs.okr, feishu.task-board]
    optional: [dwh.query, tracking.events]
    fallback: csv-import
  learning:
    enabled: true
    scope: local
  schema: ./schema.json
---

# weekly-report

## 执行要点

1. 框定本周时间范围；从 OKR Markdown 读取 KR 目标值并做差值。
2. OKR 格式不符时提示用户修正，禁止静默失败。
3. 输出：实际 vs 目标对比表 + LLM 归因 + 下周重点。
4. 周五 17:00 cron 触发完整链路（见 PRD §15.2.3）。
