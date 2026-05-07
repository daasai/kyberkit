---
name: prd-draft
description: 当用户需要基于会议决策结论或既定输入，按照公司规范起草产品需求文档或运营方案草案时使用。会优先从文档库命中预设模板，强制结构化输出。
allowed-tools:
  - artifact.markdown
  - artifact.feishu-doc

kevin:
  risk: medium
  triggers:
    - manual
  sensors:
    required: [local-fs.template]
    optional: [feishu.docs, prior-skill-output]
  learning:
    enabled: true
    scope: local
  schema: ./schema.json
---

# prd-draft

## 执行要点

1. 必须在文档库中命中预设模板（强模板契约）；缺失则拒绝执行并要求用户补充。
2. 若当前会话包含 `standup-brief` 的输出，自动作为草稿背景注入。
3. 输出标准格式 PRD/方案 Artifact；支持 Share 推送飞书（medium → Sign-off）。
