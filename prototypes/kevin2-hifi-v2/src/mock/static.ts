/** 静态演示数据 */

export const mockArtifacts = [
  { id: 'a1', type: 'PRD', title: 'Q2 增长 PRD', state: 'review' as const, updatedAt: '今天 09:12' },
  { id: 'a2', type: 'Weekly Ops Review', title: '运营周报 · 第 18 周', state: 'draft' as const, updatedAt: '昨天' },
  { id: 'a3', type: 'PRD', title: 'Connector 能力矩阵', state: 'approved' as const, updatedAt: '3 天前' },
]

export const mockPendingActions = [
  { id: 'ar1', title: '将 PRD 投影到飞书文档', artifact: 'Q2 增长 PRD', risk: 'medium' as const },
]

export const mockConnectors = [
  { id: 'feishu', name: '飞书', status: 'connected' as const, detail: 'OAuth 正常' },
  { id: 'dw', name: 'Data Warehouse', status: 'degraded' as const, detail: '查询延迟升高 · 可重试' },
  { id: 'local', name: 'Local Files', status: 'connected' as const, detail: '挂载只读' },
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

export const mockDashboardKpis = [
  { label: '活跃 Artifact', value: '3', hint: '本周有编辑' },
  { label: '待签批', value: '1', hint: 'ActionRequest' },
  { label: '材料 stale', value: '1', hint: '建议刷新数仓' },
]

export const mockAsyncJobs = [
  { id: 'j1', name: '每周数仓快照', state: 'watching' as const, trigger: 'cron · 周一 08:00' },
  { id: 'j2', name: '飞书评论监听', state: 'running' as const, trigger: 'connector_event' },
]

export const mockAuditEvents = [
  { t: '10:02', type: 'material_added', detail: 'dw_dau_weekly.json' },
  { t: '09:40', type: 'artifact_updated', detail: 'Q2 增长 PRD · Problem' },
  { t: '昨天', type: 'action_approved', detail: 'Export PDF · low' },
]
