import { useMemo, useState } from 'react'
import { useFlow } from '../flow/FlowContext'
import { KevinFloatingChrome } from '../components/cd/KevinFloatingChrome'
import { Decor_folder, WORK_PACK_CARD_ICON } from '../components/brand/WorkPackSvgCatalog'

const STEPS = [
  { n: '①', title: '基础与工作包', subtitle: '资料库与工作包' },
  { n: '②', title: '连接器', subtitle: '目录与连接' },
  { n: '③', title: '功能', subtitle: '风险与签批' },
  { n: '④', title: '审阅并创建', subtitle: '确认契约' },
] as const

const WORK_PACKS = [
  {
    id: 'general',
    label: '通用包',
    desc: '轻量起步',
    templateDefault: '空白起步',
    signSummary: '按功能页为主（默认宽松）',
  },
  {
    id: 'product',
    label: '产品设计包',
    desc: 'PRD、路线图、评审',
    templateDefault: '标准 PRD 包',
    signSummary: '中风险及以上写入 → 签批',
  },
  {
    id: 'data',
    label: '数据分析包',
    desc: '指标、看板、复盘',
    templateDefault: '指标看板包',
    signSummary: '中风险及以上写入 → 签批',
  },
  {
    id: 'content',
    label: '内容运营包',
    desc: '选题、脚本、发布',
    templateDefault: '选题与脚本包',
    signSummary: '中风险及以上写入 → 签批',
  },
] as const

type ConnectorRow = {
  id: string
  name: string
  subtitle: string
  status: 'connected' | 'needs_config' | 'disconnected'
  kind: 'feishu' | 'warehouse' | 'mcp' | 'skill' | 'local'
}

const INITIAL_CONNECTORS: ConnectorRow[] = [
  { id: 'feishu', name: '飞书', subtitle: '文档与消息', status: 'connected', kind: 'feishu' },
  { id: 'wh', name: '数仓', subtitle: '指标与告警', status: 'connected', kind: 'warehouse' },
  { id: 'mcp', name: 'MCP', subtitle: '自定义工具服务', status: 'needs_config', kind: 'mcp' },
  { id: 'skill', name: 'Skill 源', subtitle: '技能包声明', status: 'disconnected', kind: 'skill' },
  { id: 'local', name: '本地资料库', subtitle: '随资料库挂载', status: 'connected', kind: 'local' },
]

const DIRECTORY_CARDS = [
  { name: '飞书', tag: '官方', desc: '文档、表格与消息', category: 'connector' as const },
  { name: '数仓', tag: '官方', desc: '查询指标、监听阈值', category: 'connector' as const },
  { name: 'MCP 端点', tag: '协议', desc: '按 MCP 标准接入工具', category: 'mcp' as const },
  { name: 'Skill 市场', tag: 'Skill', desc: '可复用技能包', category: 'skill' as const },
  { name: 'Slack', tag: '社区', desc: '频道与消息（示意）', category: 'connector' as const },
  { name: 'Google 云端硬盘', tag: '官方', desc: '搜索、读取与上传', category: 'connector' as const },
]

type FuncRow = {
  id: string
  label: string
  on: boolean
  risk: 'low' | 'medium' | 'high' | 'na'
  signMode: 'inherit' | 'required' | 'none' | 'async'
}

const FUNC_GROUPS: { connectorId: string; title: string; rows: FuncRow[] }[] = [
  {
    connectorId: 'feishu',
    title: '飞书',
    rows: [
      { id: 'fr', label: '读取文档', on: true, risk: 'low', signMode: 'none' },
      { id: 'fw', label: '写入文档', on: true, risk: 'medium', signMode: 'inherit' },
      { id: 'fs', label: '发送消息', on: false, risk: 'na', signMode: 'none' },
    ],
  },
  {
    connectorId: 'wh',
    title: '数仓',
    rows: [
      { id: 'wq', label: '查询指标', on: true, risk: 'low', signMode: 'none' },
      { id: 'ww', label: '监听阈值', on: true, risk: 'low', signMode: 'async' },
      { id: 'wb', label: '回写', on: false, risk: 'na', signMode: 'none' },
    ],
  },
  {
    connectorId: 'local',
    title: '本地资料库',
    rows: [{ id: 'ls', label: '感知资料库挂载', on: true, risk: 'low', signMode: 'none' }],
  },
]

const MOCK_FOLDERS = [
  { id: 'root', label: 'KevinWorkspaces', path: '~/Library/KevinWorkspaces' },
  { id: 'g1', label: 'growth-q2', path: '~/Library/KevinWorkspaces/growth-q2' },
  { id: 'g2', label: 'personal-notes', path: '~/Library/KevinWorkspaces/personal-notes' },
]

function statusLabel(s: ConnectorRow['status']) {
  if (s === 'connected') return '已连接'
  if (s === 'needs_config') return '需配置'
  return '未连接'
}

export function SetupWorkspace() {
  const { go } = useFlow()
  const [step, setStep] = useState(0)
  const [workPackIdx, setWorkPackIdx] = useState(0)
  const [workspaceName, setWorkspaceName] = useState('增长与数据 · Q2')
  const [libraryPath, setLibraryPath] = useState('')
  const [libraryPickerOpen, setLibraryPickerOpen] = useState(false)
  const [pickerSelection, setPickerSelection] = useState(MOCK_FOLDERS[1].path)

  const [connectors, setConnectors] = useState<ConnectorRow[]>(INITIAL_CONNECTORS)
  const [selectedConnectorId, setSelectedConnectorId] = useState<string | null>('feishu')
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const [directoryCategory, setDirectoryCategory] = useState<'connector' | 'mcp' | 'skill'>('connector')
  const [connectorsDeferred, setConnectorsDeferred] = useState(false)
  const [funcOverrides, setFuncOverrides] = useState<Record<string, 'inherit' | 'required' | 'none' | 'async'>>({})

  const pack = WORK_PACKS[workPackIdx]
  const templatePack = pack.templateDefault

  const selected = useMemo(
    () => connectors.find((c) => c.id === selectedConnectorId) ?? null,
    [connectors, selectedConnectorId],
  )

  const previewConnectorsLine = connectorsDeferred
    ? '已跳过：外部连接器可稍后在首页配置'
    : connectors.filter((c) => c.kind !== 'local').map((c) => `${c.name}（${statusLabel(c.status)}）`).join('、')

  return (
    <div className="flex h-full min-h-0 flex-col bg-cd-page">
      <KevinFloatingChrome
        brand="large"
        headline="创建工作区"
        right={
          <button
            type="button"
            onClick={() => go('workspace')}
            className="rounded-full px-3 py-1.5 text-sm text-cd-muted hover:bg-cd-surface hover:text-j-ink"
          >
            取消
          </button>
        }
      />

      <div className="proto-scroll grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-auto lg:grid-cols-[minmax(0,1fr)_minmax(300px,38%)]">
        <div className="flex min-h-0 min-w-0 flex-col gap-6 px-5 pb-8 pt-2 sm:px-8">
          {/* ① */}
          {step === 0 && (
            <section className="space-y-6 rounded-2xl border border-cd-border bg-cd-surface p-6 shadow-sm">
              <h2 className="font-display text-xl text-j-ink">基础与工作包</h2>

              <div>
                <label className="block text-xs font-medium text-cd-muted">工作区名称</label>
                <input
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  className="mt-1 w-full max-w-xl rounded-xl border border-cd-border bg-cd-page px-3 py-2.5 text-sm outline-none focus:border-j-brand focus:ring-1 focus:ring-j-brand/30"
                />
              </div>

              <div className="max-w-xl">
                <label className="block text-xs font-medium text-cd-muted">资料库</label>
                <button
                  type="button"
                  onClick={() => setLibraryPickerOpen(true)}
                  className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl border border-cd-border bg-cd-page px-3 py-3 text-left shadow-sm transition-colors hover:border-j-brand/40 focus:border-j-brand focus:outline-none focus:ring-1 focus:ring-j-brand/25"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cd-border bg-cd-surface text-j-brand"
                      aria-hidden
                    >
                      <Decor_folder width={26} height={22} className="text-j-brand/85" />
                    </span>
                    <span className={`min-w-0 truncate font-mono text-xs ${libraryPath ? 'text-j-ink' : 'text-cd-muted'}`}>
                      {libraryPath || '选择资料库文件夹…'}
                    </span>
                  </span>
                  <span className="shrink-0 text-cd-muted" aria-hidden>
                    ▾
                  </span>
                </button>
                <p className="mt-1.5 text-xs text-cd-muted">点击后弹出系统目录选择（原型用对话框模拟）。可写 · 将写入 .kevin 元数据。</p>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-cd-muted">工作包</label>
                <div className="grid max-w-xl gap-3 sm:grid-cols-2">
                  {WORK_PACKS.map((wp, i) => {
                    const PackIcon = WORK_PACK_CARD_ICON[wp.id as keyof typeof WORK_PACK_CARD_ICON]
                    return (
                    <button
                      key={wp.id}
                      type="button"
                      onClick={() => setWorkPackIdx(i)}
                      className={`flex flex-col rounded-2xl border-2 p-4 text-left transition-all ${
                        i === workPackIdx
                          ? 'border-j-brand bg-j-brand/5 shadow-sm ring-1 ring-j-brand/15'
                          : 'border-cd-border bg-cd-page/60 hover:border-j-brand/25'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cd-border bg-cd-surface text-j-brand">
                          <PackIcon width={28} height={28} className="text-j-brand" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="font-display text-lg text-j-ink">{wp.label}</span>
                          <span className="mt-1 block text-xs text-cd-muted">{wp.desc}</span>
                        </div>
                      </div>
                      <span className="mt-3 text-[10px] font-medium uppercase tracking-wide text-cd-muted">默认模板</span>
                      <span className="text-xs text-j-brand">{wp.templateDefault}</span>
                    </button>
                    )
                  })}
                </div>
                <div className="mt-3 max-w-xl rounded-lg border border-j-brand/15 bg-j-brand/5 px-3 py-2 text-xs text-j-ink">
                  <span className="font-medium">Kevin：</span>工作包将绑定默认制品模板与写入签批倾向（
                  {pack.signSummary}）。细则在「功能」步按连接器调整。
                </div>
              </div>

              <div className="flex justify-end border-t border-cd-border pt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="rounded-xl bg-j-brand px-5 py-2.5 text-sm font-semibold text-j-cream shadow-sm hover:bg-j-brand/90"
                >
                  下一步
                </button>
              </div>
            </section>
          )}

          {/* ② */}
          {step === 1 && (
            <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-cd-border bg-cd-surface shadow-sm">
              <div className="border-b border-cd-border px-4 py-3">
                <h2 className="font-display text-lg text-j-ink">连接器</h2>
                <p className="mt-0.5 text-xs text-cd-muted">凭证仅存 credentials_ref，不在界面暴露密钥。</p>
              </div>

              <div className="grid min-h-0 flex-1 grid-cols-1 divide-y divide-cd-border lg:grid-cols-[minmax(280px,420px)_1fr] lg:divide-x lg:divide-y-0">
                <div className="flex min-h-0 max-h-[min(560px,70vh)] flex-col p-3 lg:max-h-none">
                  <div className="relative shrink-0">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-cd-muted">⌕</span>
                    <input
                      type="search"
                      placeholder="搜索已选连接器…"
                      className="w-full rounded-lg border border-cd-border bg-cd-page py-2 pl-8 pr-2 text-xs outline-none focus:border-j-brand/40"
                    />
                  </div>
                  <p className="mt-3 text-[10px] font-semibold uppercase text-cd-muted">已选连接器</p>
                  <ul className="mt-1 min-h-0 flex-1 space-y-1 overflow-auto">
                    {connectors.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedConnectorId(c.id)}
                          className={`flex w-full flex-col rounded-lg border px-2.5 py-2 text-left text-sm transition-colors ${
                            selectedConnectorId === c.id
                              ? 'border-j-brand bg-j-brand/5 ring-1 ring-j-brand/20'
                              : 'border-transparent hover:bg-cd-page'
                          }`}
                        >
                          <span className="font-medium text-j-ink">{c.name}</span>
                          <span className="text-[11px] text-cd-muted">{c.subtitle}</span>
                          <span
                            className={`mt-1 inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              c.status === 'connected'
                                ? 'bg-j-accent/15 text-j-brand'
                                : c.status === 'needs_config'
                                  ? 'bg-j-warn-bg text-j-warn'
                                  : 'bg-cd-page text-cd-muted'
                            }`}
                          >
                            {statusLabel(c.status)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setDirectoryOpen(true)}
                    className="mt-3 w-full shrink-0 rounded-lg border border-dashed border-cd-border py-2.5 text-xs font-medium text-j-brand hover:bg-cd-page"
                  >
                    + 打开连接器目录
                  </button>
                  <p className="mt-2 shrink-0 text-[10px] text-cd-muted">预置：本地资料库随资料库自动可用。选中一项后，右侧进行连接与测试。</p>
                </div>

                <div className="flex min-h-[240px] flex-col border-t border-cd-border bg-cd-page/30 p-4 lg:min-h-0 lg:border-t-0">
                  {!selected ? (
                    <p className="text-sm text-cd-muted">请从左侧选择连接器，或打开目录添加。</p>
                  ) : (
                    <ConnectorDetailPanel
                      row={selected}
                      onSimulateConnect={() => {
                        setConnectors((prev) =>
                          prev.map((c) => (c.id === selected.id ? { ...c, status: 'connected' as const } : c)),
                        )
                      }}
                    />
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-cd-border px-4 py-3">
                <button type="button" onClick={() => setStep(0)} className="text-sm text-cd-muted hover:text-j-ink">
                  上一步
                </button>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setConnectorsDeferred(true)
                      setStep(2)
                    }}
                    className="rounded-lg border border-cd-border bg-cd-surface px-4 py-2 text-sm font-semibold text-j-ink hover:bg-cd-page"
                  >
                    稍后配置
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConnectorsDeferred(false)
                      setStep(2)
                    }}
                    className="rounded-lg bg-j-brand px-4 py-2 text-sm font-semibold text-j-cream hover:bg-j-brand/90"
                  >
                    下一步
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* ③ */}
          {step === 2 && (
            <section className="space-y-4 rounded-2xl border border-cd-border bg-cd-surface p-6 shadow-sm">
              <h2 className="font-display text-xl text-j-ink">功能</h2>
              <div className="rounded-lg border border-cd-border bg-cd-page/60 px-3 py-2 text-xs text-cd-muted">
                当前工作包「{pack.label}」写入签批倾向：<span className="font-medium text-j-ink">{pack.signSummary}</span>
                。下表「继承工作包默认」即沿用此倾向。
              </div>
              <p className="text-sm text-cd-muted">写入类须展示风险与签批；可逐条覆盖。</p>

              {connectorsDeferred && (
                <div className="rounded-lg border border-j-warn-bg bg-j-warn-bg/50 px-3 py-2 text-xs text-j-warn">
                  你已选择稍后配置外部连接器。以下仅展示资料库；完整功能可稍后在首页 &gt; 连接器 完成。
                </div>
              )}

              <div className="space-y-6">
                {FUNC_GROUPS.filter((g) => !connectorsDeferred || g.connectorId === 'local').map((group) => (
                  <div key={group.connectorId}>
                    <h3 className="border-b border-cd-border pb-2 font-display text-base text-j-ink">{group.title}</h3>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full min-w-[520px] text-left text-sm">
                        <thead>
                          <tr className="text-[10px] uppercase tracking-wide text-cd-muted">
                            <th className="py-2 pr-3">功能</th>
                            <th className="py-2 pr-3">开关</th>
                            <th className="py-2 pr-3">风险</th>
                            <th className="py-2">签批</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-cd-border">
                          {group.rows.map((row) => {
                            const effective = funcOverrides[row.id] ?? row.signMode
                            return (
                              <tr key={row.id}>
                                <td className="py-2.5 pr-3 font-medium">{row.label}</td>
                                <td className="py-2.5 pr-3">
                                  <span className={row.on ? 'text-j-brand' : 'text-cd-muted'}>{row.on ? '开' : '关'}</span>
                                </td>
                                <td className="py-2.5 pr-3">
                                  {row.risk === 'low' && (
                                    <span className="rounded bg-cd-page px-1.5 py-0.5 text-xs text-cd-muted">低</span>
                                  )}
                                  {row.risk === 'medium' && (
                                    <span className="rounded bg-j-warn-bg px-1.5 py-0.5 text-xs text-j-warn">中</span>
                                  )}
                                  {row.risk === 'na' && <span className="text-xs text-cd-muted">—</span>}
                                </td>
                                <td className="py-2.5">
                                  {row.risk === 'na' ? (
                                    <span className="text-xs text-cd-muted">不支持</span>
                                  ) : (
                                    <div className="flex flex-wrap items-center gap-2">
                                      <select
                                        value={effective}
                                        onChange={(e) =>
                                          setFuncOverrides((o) => ({
                                            ...o,
                                            [row.id]: e.target.value as 'inherit' | 'required' | 'none' | 'async',
                                          }))
                                        }
                                        className="max-w-[200px] rounded border border-cd-border bg-cd-page px-2 py-1 text-xs outline-none focus:border-j-brand"
                                      >
                                        <option value="inherit">继承工作包默认</option>
                                        <option value="required">必填签批</option>
                                        <option value="none">无需签批</option>
                                        <option value="async">告警 → 异步任务</option>
                                      </select>
                                      {funcOverrides[row.id] !== undefined && (
                                        <span className="rounded bg-j-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-j-brand">
                                          已覆盖
                                        </span>
                                      )}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between border-t border-cd-border pt-4">
                <button type="button" onClick={() => setStep(1)} className="text-sm text-cd-muted hover:text-j-ink">
                  上一步
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="rounded-lg bg-j-brand px-4 py-2 text-sm font-semibold text-j-cream hover:bg-j-brand/90"
                >
                  下一步
                </button>
              </div>
            </section>
          )}

          {/* ④ */}
          {step === 3 && (
            <section className="space-y-5 rounded-2xl border border-cd-border bg-cd-surface p-6 shadow-sm">
              <h2 className="font-display text-xl text-j-ink">审阅并创建</h2>
              <div className="rounded-lg border border-cd-border bg-cd-page/50 p-4 text-sm">
                <p className="font-medium text-j-ink">工作区契约（摘要）</p>
                <ul className="mt-3 list-inside list-disc space-y-1.5 text-cd-muted">
                  <li>
                    <span className="text-j-ink">工作区名称：</span>
                    {workspaceName || '（未填写）'}
                  </li>
                  <li>
                    <span className="text-j-ink">资料库：</span>
                    {libraryPath || '（未选择）'}
                  </li>
                  <li>
                    <span className="text-j-ink">工作包：</span>
                    {pack.label} · 模板 {templatePack}
                  </li>
                  <li>
                    <span className="text-j-ink">写入签批倾向：</span>
                    {pack.signSummary}
                  </li>
                  <li>
                    <span className="text-j-ink">连接器：</span>
                    {previewConnectorsLine}
                  </li>
                </ul>
              </div>
              {!libraryPath.trim() && (
                <p className="rounded-lg border border-j-danger/30 bg-j-danger-bg px-3 py-2 text-xs text-j-danger">
                  阻断：请选择资料库文件夹。
                </p>
              )}
              <div className="flex justify-between border-t border-cd-border pt-4">
                <button type="button" onClick={() => setStep(2)} className="text-sm text-cd-muted hover:text-j-ink">
                  上一步
                </button>
                <button
                  type="button"
                  disabled={!libraryPath.trim()}
                  onClick={() => go('firstEncounter')}
                  className="rounded-xl bg-j-brand px-5 py-2.5 text-sm font-semibold text-j-cream shadow-sm hover:bg-j-brand/90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  创建工作区
                </button>
              </div>
            </section>
          )}
        </div>

        {/* 右栏：步骤导航 + 契约摘要 */}
        <aside className="flex flex-col border-t border-cd-border bg-cd-surface lg:border-l lg:border-t-0">
          <div className="border-b border-cd-border p-4">
            <p className="font-display text-base text-j-ink">进度</p>
            <p className="mt-0.5 text-[11px] text-cd-muted">横排点击切换 · 无聊天流</p>
            <nav className="mt-3 flex flex-wrap gap-2 xl:flex-nowrap xl:overflow-x-auto">
              {STEPS.map((s, i) => (
                <button
                  key={s.title}
                  type="button"
                  onClick={() => setStep(i)}
                  className={`flex min-w-0 flex-1 basis-[calc(50%-0.25rem)] flex-col rounded-xl border px-2.5 py-2 text-left transition-colors sm:basis-0 sm:flex-none xl:min-w-0 xl:flex-1 xl:basis-0 ${
                    i === step
                      ? 'border-j-brand bg-j-brand/5 ring-1 ring-j-brand/20'
                      : 'border-cd-border bg-cd-page/50 hover:border-j-brand/25'
                  }`}
                >
                  <span className={`font-display text-sm leading-none ${i === step ? 'text-j-brand' : 'text-cd-muted'}`}>{s.n}</span>
                  <span className={`mt-1 block truncate text-[11px] font-semibold ${i === step ? 'text-j-ink' : 'text-cd-muted'}`}>
                    {s.title}
                  </span>
                </button>
              ))}
            </nav>
          </div>

          <div className="proto-scroll flex-1 space-y-4 overflow-auto p-4">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-cd-muted">契约摘要</p>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-[10px] uppercase text-cd-muted">Space id</dt>
                <dd className="mt-0.5 font-mono text-xs text-j-ink">8f2c…e41a</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase text-cd-muted">工作区名称</dt>
                <dd className="mt-0.5 truncate text-j-ink">{workspaceName || '—'}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase text-cd-muted">资料库</dt>
                <dd className="mt-0.5 break-all font-mono text-xs text-j-ink">{libraryPath || '未选'}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase text-cd-muted">工作包</dt>
                <dd className="mt-0.5 text-j-ink">{pack.label}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase text-cd-muted">模板</dt>
                <dd className="mt-0.5 text-xs text-j-ink">{templatePack}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase text-cd-muted">连接器</dt>
                <dd className="mt-0.5 text-xs leading-snug text-cd-muted">{previewConnectorsLine}</dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase text-cd-muted">签批倾向</dt>
                <dd className="mt-0.5 text-xs text-j-ink">{pack.signSummary}</dd>
              </div>
            </dl>

            <div className="rounded-lg border border-cd-border bg-cd-page/60 p-3 text-[11px] leading-relaxed text-cd-muted">
              右栏同时承担<strong className="text-j-ink">步骤导航</strong>与<strong className="text-j-ink">契约快照</strong>；主区专注表单与连接器三栏。
            </div>
          </div>
        </aside>
      </div>

      {libraryPickerOpen && (
        <LibraryPickerModal
          selection={pickerSelection}
          onSelect={setPickerSelection}
          onClose={() => setLibraryPickerOpen(false)}
          onConfirm={() => {
            setLibraryPath(pickerSelection)
            setLibraryPickerOpen(false)
          }}
        />
      )}

      {directoryOpen && (
        <DirectoryModal
          category={directoryCategory}
          onCategory={setDirectoryCategory}
          onClose={() => setDirectoryOpen(false)}
          onAdd={(name) => {
            window.alert(`已添加（示意）：${name}`)
            setDirectoryOpen(false)
          }}
        />
      )}
    </div>
  )
}

function LibraryPickerModal({
  selection,
  onSelect,
  onClose,
  onConfirm,
}: {
  selection: string
  onSelect: (path: string) => void
  onClose: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/35 p-4" role="dialog" aria-modal aria-labelledby="lib-picker-title">
      <div className="w-full max-w-md rounded-2xl border border-cd-border bg-cd-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-cd-border px-4 py-3">
          <h2 id="lib-picker-title" className="font-display text-lg text-j-ink">
            选择资料库
          </h2>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-cd-muted hover:bg-cd-page" aria-label="关闭">
            ✕
          </button>
        </div>
        <div className="p-4">
          <p className="text-xs text-cd-muted">原型：模拟系统文件夹选择。正式版由 Tauri / 系统 API 打开目录选择器。</p>
          <ul className="mt-3 space-y-1 rounded-lg border border-cd-border bg-cd-page p-2">
            {MOCK_FOLDERS.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onSelect(f.path)}
                  className={`flex w-full rounded-md px-2 py-2 text-left font-mono text-xs ${
                    selection === f.path ? 'bg-j-brand/10 font-medium text-j-brand' : 'text-j-ink hover:bg-cd-surface'
                  }`}
                >
                  {f.path}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end gap-2 border-t border-cd-border px-4 py-3">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-cd-muted hover:bg-cd-page">
            取消
          </button>
          <button type="button" onClick={onConfirm} className="rounded-lg bg-j-brand px-4 py-1.5 text-sm font-semibold text-j-cream hover:bg-j-brand/90">
            确定
          </button>
        </div>
      </div>
    </div>
  )
}

function ConnectorDetailPanel({ row, onSimulateConnect }: { row: ConnectorRow; onSimulateConnect: () => void }) {
  return (
    <div className="space-y-3">
      <p className="font-display text-base text-j-ink">{row.name}</p>
      <p className="text-xs text-cd-muted">{row.subtitle}</p>
      <p className="text-xs">
        状态：
        <span className="font-medium text-j-ink">{statusLabel(row.status)}</span>
      </p>

      {row.kind === 'local' && (
        <p className="text-xs text-cd-muted">本地资料库随资料库挂载自动可用，无需额外授权。</p>
      )}

      {(row.kind === 'feishu' || row.kind === 'warehouse') && row.status === 'connected' && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-lg border border-cd-border bg-cd-surface px-3 py-1.5 text-xs font-medium hover:bg-cd-page"
          >
            测试连接
          </button>
          <button type="button" className="text-xs text-cd-muted underline hover:text-j-ink">
            断开
          </button>
        </div>
      )}

      {row.status === 'needs_config' && (
        <div className="rounded-lg border border-j-warn-bg bg-j-warn-bg/40 p-3 text-xs text-j-warn">
          <p>需完成配置后测试连接。</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onSimulateConnect}
              className="rounded bg-j-brand px-2 py-1 text-j-cream hover:bg-j-brand/90"
            >
              模拟连接成功
            </button>
            <button type="button" className="rounded border border-cd-border px-2 py-1">
              重试
            </button>
          </div>
        </div>
      )}

      {row.kind === 'mcp' && (
        <div className="space-y-2 text-xs">
          <label className="block text-cd-muted">MCP 传输</label>
          <select className="w-full rounded border border-cd-border bg-cd-surface px-2 py-1.5">
            <option>stdio</option>
            <option>sse</option>
          </select>
          <label className="mt-2 block text-cd-muted">命令 / URL（占位）</label>
          <input className="w-full rounded border border-cd-border px-2 py-1.5 font-mono" placeholder="npx -y @modelcontextprotocol/…" />
        </div>
      )}

      {row.kind === 'skill' && (
        <div className="space-y-2 text-xs">
          <label className="block text-cd-muted">Skill 源 URL / 路径</label>
          <input className="w-full rounded border border-cd-border px-2 py-1.5 font-mono" placeholder="./skills 或 https://…" />
          <button type="button" onClick={onSimulateConnect} className="rounded bg-j-brand px-2 py-1 text-j-cream">
            校验并启用
          </button>
        </div>
      )}

      <details className="text-xs text-cd-muted">
        <summary className="cursor-pointer text-j-ink">高级</summary>
        <p className="mt-2">允许的功能范围以服务端契约为准（占位说明）。</p>
      </details>
    </div>
  )
}

function DirectoryModal({
  category,
  onCategory,
  onClose,
  onAdd,
}: {
  category: 'connector' | 'mcp' | 'skill'
  onCategory: (c: 'connector' | 'mcp' | 'skill') => void
  onClose: () => void
  onAdd: (name: string) => void
}) {
  const filtered = DIRECTORY_CARDS.filter((c) => c.category === category)
  const nav = [
    { id: 'connector' as const, label: '连接器' },
    { id: 'mcp' as const, label: 'MCP' },
    { id: 'skill' as const, label: 'Skill' },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4" role="dialog" aria-modal>
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-cd-border bg-cd-surface shadow-xl">
        <div className="flex items-center justify-between border-b border-cd-border px-4 py-3">
          <h2 className="font-display text-lg text-j-ink">连接器目录</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-cd-muted hover:bg-cd-page hover:text-j-ink"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <nav className="flex shrink-0 gap-1 border-b border-cd-border p-3 md:w-44 md:flex-col md:border-b-0 md:border-r">
            {nav.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onCategory(item.id)}
                className={`rounded-lg px-3 py-2 text-left text-sm font-medium ${
                  category === item.id ? 'bg-cd-page text-j-ink' : 'text-cd-muted hover:bg-cd-page/60'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-4">
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-cd-muted">⌕</span>
              <input
                type="search"
                placeholder="搜索连接器、MCP、Skill…"
                className="w-full rounded-lg border border-cd-border bg-cd-page py-2 pl-8 pr-2 text-sm outline-none focus:border-j-brand/40"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-j-ink px-2 py-1 text-cd-surface">全部</span>
              <span className="rounded-full border border-cd-border px-2 py-1 text-cd-muted">筛选</span>
              <span className="rounded-full border border-cd-border px-2 py-1 text-cd-muted">排序</span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {filtered.map((card) => (
                <article
                  key={card.name}
                  className="flex flex-col rounded-xl border border-cd-border bg-cd-page/50 p-4 transition hover:border-j-brand/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-j-ink">{card.name}</p>
                      <p className="mt-0.5 text-[11px] text-cd-muted">{card.tag}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onAdd(card.name)}
                      className="shrink-0 rounded-full border border-cd-border px-2 py-0.5 text-lg leading-none text-j-brand hover:bg-cd-surface"
                      aria-label={`添加 ${card.name}`}
                    >
                      +
                    </button>
                  </div>
                  <p className="mt-2 flex-1 text-xs text-cd-muted">{card.desc}</p>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
