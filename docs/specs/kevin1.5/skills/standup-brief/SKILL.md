---
name: standup-brief
description: 当用户需要在每日站会前快速准备一份业务数据简报时使用。会自动跨飞书任务看板和数仓拉取昨日数据，输出含核心指标对比、任务进展摘要、3 条关键洞察的结构化简报。触发关键词：站会、晨会、昨日数据、业务简报。
allowed-tools:
  - artifact.markdown
  - artifact.feishu-doc

kevin:
  risk: medium
  triggers:
    - manual
    - "cron:0 9 * * 1-5"
  sensors:
    required: [feishu.task-board]
    optional: [dwh.query, tracking.events, wechat-work.consult]
    fallback: csv-import
  learning:
    enabled: true
    scope: local
  schema: ./schema.json
---

# standup-brief

## 执行要点

1. 识别「昨日」时间窗并提取核心指标。
2. 若 P1 Sensor（数仓/埋点/企微）未就绪，对应数据块标注 `⚠️ 数据获取失败，可手动上传 CSV`，不阻断整体流程。
3. 输出：Markdown 数据表 + 异动高亮 + 3 条洞察 + 1 条关注建议。
4. Sign-off：仅当用户选择「推送到飞书」时触发 medium 风险签批。
