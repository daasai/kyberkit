/**
 * Quick-start prompts for Kevin onboarding (Sprint 3 Task 3.7).
 * Paths are relative to workspace data root (see Filesystem MCP / standup templates).
 */

export interface QuickTemplate {
  id: string
  label: string
  icon: string
  prompt: string
}

export const QUICK_TEMPLATES: QuickTemplate[] = [
  {
    id: 'standup',
    label: '生成今日站会数据',
    icon: 'bar_chart',
    prompt:
      '请读取 templates/standup-data.md 中的昨日数据，生成一份简洁的今日站会数据卡片，包含关键指标和异常摘要。使用 <artifact>...</artifact> 包裹输出。',
  },
  {
    id: 'spec',
    label: '起草产品升级 Spec',
    icon: 'description',
    prompt:
      '请读取 templates/standup-data.md 中的业务数据和 templates/product-spec-template.md 模板，基于这些信息为贝易转产品生成一份产品升级 Spec 文档。使用 <artifact>...</artifact> 包裹输出。',
  },
  {
    id: 'rca',
    label: '发起异常 RCA 分析',
    icon: 'bug_report',
    prompt:
      '请帮我起草一份 RCA 报告模板，包含：问题描述、时间线、根因分析（5 Why）、影响范围、修复方案、预防措施。使用 <artifact>...</artifact> 包裹输出。',
  },
]
