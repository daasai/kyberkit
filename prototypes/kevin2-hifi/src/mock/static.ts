/** 静态演示数据 — 不代表真实 API */

export const mockArtifacts = [
  {
    id: 'a1',
    type: 'PRD',
    title: 'Q2 增长 PRD',
    state: 'review' as const,
    updatedAt: '今天 09:12',
  },
  {
    id: 'a2',
    type: 'Weekly Ops Review',
    title: '运营周报 · 第 18 周',
    state: 'draft' as const,
    updatedAt: '昨天',
  },
  {
    id: 'a3',
    type: 'PRD',
    title: 'Connector 能力矩阵',
    state: 'approved' as const,
    updatedAt: '3 天前',
  },
]

export const mockPendingActions = [
  {
    id: 'ar1',
    title: '将 PRD 投影到飞书文档',
    artifact: 'Q2 增长 PRD',
    risk: 'medium' as const,
  },
]

export const mockConnectors = [
  { id: 'feishu', name: '飞书', status: 'connected' as const },
  { id: 'dw', name: 'Data Warehouse', status: 'degraded' as const },
  { id: 'local', name: 'Local Files', status: 'connected' as const },
]

export const mockMaterials = [
  { name: '访谈笔记-增长组.md', stale: false },
  { name: 'Q2_feature_brief.md', stale: false },
  { name: '数仓查询 · DAU 周趋势', stale: true },
]

export const mockMaterialsUsed = [
  { id: 'm1', name: '访谈笔记-增长组.md', snippet: '§3 用户痛点：排期不透明…' },
  { id: 'm2', name: 'Q2_feature_brief.md', snippet: 'Goals: 提升激活率…' },
]

export const mockSuggestedStep = {
  title: 'Q2 增长 PRD 的 Problem block 还缺材料引用',
  body: '你上周上传的访谈笔记里有 2 段相关内容，可一键关联为证据。',
  cta: '继续',
}
