import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Panel, PanelGroup } from 'react-resizable-panels'
import { ResizeHandle } from './ResizeHandle'
import { useFlow } from '../flow/FlowContext'
import { CdMicroTabRow } from '../components/cd/CdMicroTabRow'
import { KevinMoreMenu } from '../components/cd/KevinMoreMenu'
import { WorkspaceOverviewBody } from '../components/workspace/WorkspaceOverviewBody'
import { KevinBrandCompact } from '../components/brand/KevinBrand'
import { CdChatThread } from '../components/cd/CdChatThread'

type FileLeaf = {
  id: string
  kind: 'file'
  name: string
  /** 树内相对路径，用于预览标题 */
  pathLabel: string
  meta: string
  preview: string
  /** 索引中有「Kevin 生成」等角色，非文件名约定 */
  kevinOutput?: boolean
  /** 可进入 Artifact Focus 结构化视图（与路径散落存放正交） */
  artifact?: boolean
}

type FolderNode = {
  id: string
  kind: 'folder'
  name: string
  /** 挂载说明、连接器类型等 */
  hint?: string
  children: TreeNode[]
}

type TreeNode = FileLeaf | FolderNode

function isFolder(n: TreeNode): n is FolderNode {
  return n.kind === 'folder'
}

/** 统一对象树：Kevin 输出与材料同一资料库、按项目习惯散落各文件夹；角色由索引识别（非文件名）。 */
const OBJECT_TREE: TreeNode[] = [
  {
    id: 'lib',
    kind: 'folder',
    name: '资料库',
    hint: '~/KevinSpaces/growth-q2',
    children: [
      {
        id: 'lib-mat',
        kind: 'folder',
        name: 'materials',
        children: [
          {
            id: 'f1',
            kind: 'file',
            name: 'interviews_growth.md',
            pathLabel: 'materials/interviews_growth.md',
            meta: 'Markdown · 2h',
            preview:
              '访谈摘录与排期相关段落；可作为 PRD Problem 的 EvidenceRef 来源。与对话中 @ 引用同一管线（占位）。',
          },
          {
            id: 'f2',
            kind: 'file',
            name: 'dw_dau_weekly.json',
            pathLabel: 'materials/dw_dau_weekly.json',
            meta: 'JSON · 数仓导出',
            preview: 'DAU WoW 指标序列；工作包默认查询范围与字段说明见侧栏元数据（占位）。',
          },
          {
            id: 'f-brief',
            kind: 'file',
            name: 'Q2_feature_brief.md',
            pathLabel: 'materials/Q2_feature_brief.md',
            meta: 'Markdown · 1d',
            preview: 'Feature brief 摘录；PRD 与实验纪要的交叉引用锚点。',
          },
        ],
      },
      {
        id: 'lib-specs',
        kind: 'folder',
        name: 'specs',
        children: [
          {
            id: 'f-prd',
            kind: 'file',
            name: 'Q2-增长-PRD.md',
            pathLabel: 'specs/Q2-增长-PRD.md',
            meta: 'Markdown · review · 索引：Kevin 输出',
            preview:
              '与日常 PRD 文档无分栏差异；物理路径在 specs/。系统用 Workspace 索引（及可选 frontmatter / 侧车）标记角色与签批状态，**不依赖**文件名含 Kevin。对话列输出卡与此文件同一对象。',
            kevinOutput: true,
            artifact: true,
          },
          {
            id: 'f-spec',
            kind: 'file',
            name: 'metrics_catalog.yaml',
            pathLabel: 'specs/metrics_catalog.yaml',
            meta: 'YAML',
            preview: '指标目录与连接器字段映射（占位）。',
          },
        ],
      },
      {
        id: 'lib-reviews',
        kind: 'folder',
        name: 'reviews',
        children: [
          {
            id: 'f-weekly',
            kind: 'file',
            name: 'weekly_ops_review_w18.md',
            pathLabel: 'reviews/weekly_ops_review_w18.md',
            meta: 'Markdown · draft · 索引：Kevin 输出',
            preview: '周报草稿在 reviews/ 与材料散落一致；签批前不写入飞书投影。',
            kevinOutput: true,
          },
          {
            id: 'f-deck',
            kind: 'file',
            name: 'exec_review_Q2.pptx',
            pathLabel: 'reviews/exec_review_Q2.pptx',
            meta: 'pptx · draft · 索引：Kevin 输出',
            preview: '演示稿与周报复盘同目录习惯；结构化预览在画布态打开（占位）。',
            kevinOutput: true,
            artifact: true,
          },
        ],
      },
    ],
  },
  {
    id: 'feishu',
    kind: 'folder',
    name: '飞书',
    hint: '连接器 · 只读投影',
    children: [
      {
        id: 'fs-docs',
        kind: 'folder',
        name: '云文档',
        children: [
          {
            id: 'f-feishu-doc',
            kind: 'file',
            name: '实验纪要-增长组',
            pathLabel: '飞书/云文档/实验纪要-增长组',
            meta: 'Docx 投影 · cached',
            preview: '外链缓存为只读 ref；与本地树同一选中 / 预览交互；异步完成后刷新摘要（占位）。',
          },
          {
            id: 'f-feishu-prd',
            kind: 'file',
            name: 'Roadmap 对齐纪要',
            pathLabel: '飞书/云文档/Roadmap 对齐纪要',
            meta: 'Docx 投影',
            preview: '多文档场景下按文件夹组织，避免与本地文件名扁平混在一起（占位）。',
          },
        ],
      },
      {
        id: 'fs-bitable',
        kind: 'folder',
        name: '多维表格',
        children: [
          {
            id: 'f-base',
            kind: 'file',
            name: '实验排期.base',
            pathLabel: '飞书/多维表格/实验排期',
            meta: 'Bitable · 同步 10m',
            preview: '二维表作为一等对象：预览首屏行/列与关键视图名；深层格网在制品或专用预览中打开（占位）。',
          },
          {
            id: 'f-okr',
            kind: 'file',
            name: 'OKR_2025_Q2.base',
            pathLabel: '飞书/多维表格/OKR_2025_Q2',
            meta: 'Bitable',
            preview: 'OKR 与实验表分表挂载，避免单表过载（占位）。',
          },
        ],
      },
    ],
  },
]

function collectFolderIds(nodes: TreeNode[], out: string[] = []): string[] {
  for (const n of nodes) {
    if (isFolder(n)) {
      out.push(n.id)
      collectFolderIds(n.children, out)
    }
  }
  return out
}

function findFirstFile(nodes: TreeNode[]): FileLeaf | undefined {
  for (const n of nodes) {
    if (isFolder(n)) {
      const hit = findFirstFile(n.children)
      if (hit) return hit
    } else {
      return n
    }
  }
  return undefined
}

function buildFileMap(nodes: TreeNode[], acc: Record<string, FileLeaf> = {}): Record<string, FileLeaf> {
  for (const n of nodes) {
    if (isFolder(n)) buildFileMap(n.children, acc)
    else acc[n.id] = n
  }
  return acc
}

const FILE_MAP = buildFileMap(OBJECT_TREE)
const DEFAULT_EXPANDED = collectFolderIds(OBJECT_TREE)

const CHAT_SESSIONS = [
  { id: 's1', tab: '增长数据' },
  { id: 's2', tab: 'PRD 补证' },
] as const

/** 原型说明：未来可替换为正式功能帮助 */
const PROTO_HELP_WORKSPACE =
  'Kevin 输出与材料同为资料库里的文件，按习惯落在 specs/、reviews/ 等路径，不设单独 artifacts/ 文件夹。角色由 Workspace 索引识别（可选 frontmatter / 侧车），不依赖文件名。飞书等为挂载子树。'

function WorkspaceDocPreview({ file }: { file: FileLeaf | undefined }) {
  if (file == null) {
    return <p className="text-[11px] text-cd-muted">在左侧选择文件以预览</p>
  }
  const lower = file.name.toLowerCase()

  const frame = (children: ReactNode) => (
    <div className="overflow-hidden rounded-lg border border-cd-border bg-white shadow-sm">
      <div className="flex items-center gap-1 border-b border-cd-border bg-cd-page px-2 py-1">
        <span className="h-2 w-2 rounded-full bg-red-400/80" />
        <span className="h-2 w-2 rounded-full bg-amber-400/80" />
        <span className="h-2 w-2 rounded-full bg-emerald-500/70" />
        <span className="ml-2 truncate font-mono text-[10px] text-cd-muted">{file.pathLabel}</span>
      </div>
      {children}
    </div>
  )

  if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) {
    return frame(
      <div className="flex aspect-[16/10] flex-col items-center justify-center gap-2 bg-gradient-to-br from-cd-page to-cd-surface p-6">
        <div className="text-3xl text-cd-muted">▣</div>
        <p className="text-center text-[12px] font-medium text-j-ink">幻灯片预览</p>
        <p className="text-center text-[10px] text-cd-muted">结构化画布见 Artifact 全屏视图</p>
      </div>,
    )
  }

  if (lower.endsWith('.json') || lower.endsWith('.yaml') || lower.endsWith('.yml')) {
    return frame(
      <pre className="max-h-[min(18rem,42vh)] overflow-auto bg-cd-page p-3 font-mono text-[10px] leading-relaxed text-j-ink">
        {lower.endsWith('.json')
          ? `{\n  "metric": "DAU_WOW",\n  "range_days": 7,\n  "source": "dw_export"\n}`
          : `metrics:\n  - id: DAU_WOW\n    connector: data_warehouse\n`}
      </pre>,
    )
  }

  if (lower.endsWith('.base') || file.pathLabel.includes('多维表格')) {
    return frame(
      <div className="bg-white p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase text-cd-muted">表格预览（示意）</p>
        <div className="overflow-hidden rounded border border-cd-border text-[10px]">
          <div className="grid grid-cols-4 bg-cd-page font-medium text-j-ink">
            {['实验', '负责人', '状态', '排期'].map((h) => (
              <div key={h} className="border-b border-r border-cd-border px-2 py-1.5 last:border-r-0">
                {h}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 text-cd-muted">
            {['增长 A/B', '王某', '进行中', '05-12'].map((c, i) => (
              <div key={i} className="border-b border-r border-cd-border px-2 py-1.5 last:border-r-0">
                {c}
              </div>
            ))}
          </div>
        </div>
      </div>,
    )
  }

  if (!lower.includes('.') || file.pathLabel.startsWith('飞书')) {
    return frame(
      <div className="space-y-3 bg-white p-4 text-[12px] text-j-ink">
        <p className="text-[10px] font-semibold uppercase text-cd-muted">云文档投影</p>
        <p className="leading-relaxed text-cd-muted">
          与图 1 类似：此处为只读渲染帧；编辑在飞书打开。连接器同步状态见下方元数据。
        </p>
        <div className="rounded-md border border-cd-border bg-cd-page/80 p-3 text-[11px] text-j-ink shadow-inner">
          <p className="font-medium">{file.name}</p>
          <p className="mt-2 text-cd-muted">摘要段落占位…</p>
        </div>
      </div>,
    )
  }

  if (lower.endsWith('.md') && file.id === 'f-prd') {
    return frame(
      <div className="max-h-[min(22rem,48vh)] overflow-auto bg-white p-4 text-[12px] text-j-ink">
        <p className="text-[10px] font-semibold uppercase text-cd-muted">文档预览（示意）</p>
        <h1 className="mt-2 font-display text-lg font-semibold tracking-tight">Q2 增长 PRD</h1>
        <p className="mt-1 text-[11px] text-cd-muted">specs/Q2-增长-PRD.md · Markdown</p>
        <hr className="my-3 border-cd-border" />
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-j-ink">Problem</h2>
          <p className="leading-relaxed text-cd-muted">
            排期不透明导致实验窗口压缩；访谈摘录见 materials/interviews_growth.md（EvidenceRef 占位）。
          </p>
        </section>
        <section className="mt-4 space-y-2">
          <h2 className="text-sm font-semibold text-j-ink">Goals</h2>
          <ul className="list-inside list-disc space-y-1 text-cd-muted">
            <li>DAU WoW 止跌（数仓指标已挂载）</li>
            <li>飞书实验纪要与 PRD 双向引用</li>
          </ul>
        </section>
        <div className="mt-4 rounded-md border border-dashed border-cd-border bg-cd-page/50 p-2 text-[10px] text-cd-muted">
          以下为画布内 Block 编辑区示意，非完整 PRD 正文。
        </div>
      </div>,
    )
  }

  if (lower.endsWith('.md')) {
    return frame(
      <div className="max-h-[min(20rem,46vh)] overflow-auto bg-white p-4 text-[12px] leading-relaxed text-j-ink">
        <p className="text-[10px] font-semibold uppercase text-cd-muted">文档预览（示意）</p>
        <h2 className="mt-2 font-semibold text-j-ink">{file.name.replace(/\.md$/i, '')}</h2>
        <p className="mt-3 text-cd-muted">
          摘录：与排期、实验迭代相关的段落将出现在此预览窗；完整编辑在本地或结构化视图中打开。
        </p>
        <blockquote className="mt-3 border-l-2 border-j-brand/50 pl-3 text-[11px] text-cd-muted">
          「我们希望把决策依据留在同一资料库里，而不是散落在聊天窗口。」
        </blockquote>
      </div>,
    )
  }

  return frame(
    <div className="p-4 text-[12px] text-cd-muted">
      <p>此类型的内嵌预览占位；元数据见标题区。</p>
    </div>,
  )
}

function TreeRows({
  nodes,
  depth,
  expanded,
  toggle,
  selectedId,
  onSelectFile,
}: {
  nodes: TreeNode[]
  depth: number
  expanded: Set<string>
  toggle: (id: string) => void
  selectedId: string
  onSelectFile: (id: string) => void
}) {
  const pad = 6 + depth * 12
  return (
    <ul className="space-y-0">
      {nodes.map((n) => {
        if (isFolder(n)) {
          const open = expanded.has(n.id)
          return (
            <li key={n.id} className="select-none">
              <button
                type="button"
                onClick={() => toggle(n.id)}
                className="flex w-full items-center gap-1 rounded-sm py-0.5 text-left font-mono text-[11px] text-j-ink hover:bg-cd-page/90"
                style={{ paddingLeft: pad, paddingRight: 4 }}
              >
                <span className="w-3 shrink-0 text-cd-muted" aria-hidden>
                  {open ? '▾' : '▸'}
                </span>
                <span className="min-w-0 truncate font-medium">{n.name}/</span>
                {n.hint != null && n.hint !== '' && (
                  <span className="ml-1 shrink-0 truncate text-[9px] font-sans font-normal text-cd-muted">{n.hint}</span>
                )}
              </button>
              {open && n.children.length > 0 && (
                <TreeRows
                  nodes={n.children}
                  depth={depth + 1}
                  expanded={expanded}
                  toggle={toggle}
                  selectedId={selectedId}
                  onSelectFile={onSelectFile}
                />
              )}
            </li>
          )
        }
        const active = n.id === selectedId
        return (
          <li key={n.id}>
            <button
              type="button"
              onClick={() => onSelectFile(n.id)}
              className={`flex w-full flex-col rounded-md border py-1 text-left transition-colors ${
                active ? 'border-j-brand bg-cd-page shadow-sm' : 'border-transparent hover:border-cd-border hover:bg-cd-page/70'
              }`}
              style={{ paddingLeft: pad + 12, paddingRight: 6 }}
            >
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="shrink-0 text-[10px] text-cd-muted" aria-hidden>
                  {n.kevinOutput ? '◆' : '·'}
                </span>
                <span className="min-w-0 truncate font-mono text-[11px] font-medium text-j-ink">{n.name}</span>
                {n.kevinOutput && (
                  <span className="shrink-0 rounded bg-j-brand/15 px-1 py-px text-[9px] font-sans font-semibold text-j-brand">
                    Kevin 生成
                  </span>
                )}
              </span>
              <span className="mt-0.5 truncate pl-4 font-sans text-[10px] text-cd-muted">{n.meta}</span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

export function WorkspaceStage() {
  const { go } = useFlow()
  const first = findFirstFile(OBJECT_TREE)
  const [deckOpen, setDeckOpen] = useState(false)
  const [deckTab, setDeckTab] = useState<'overview' | 'settings'>('overview')
  const [expanded, setExpanded] = useState(() => new Set(DEFAULT_EXPANDED))
  const [selectedId, setSelectedId] = useState<string>(first?.id ?? '')
  const [chatSessionId, setChatSessionId] = useState<(typeof CHAT_SESSIONS)[number]['id']>('s1')

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selected = FILE_MAP[selectedId] ?? first

  const [protoHelpOpen, setProtoHelpOpen] = useState(false)
  const [workspaceMainTab, setWorkspaceMainTab] = useState<'browse' | 'artifact'>('browse')
  const protoHelpRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!protoHelpOpen) return
    const onDown = (e: MouseEvent) => {
      if (protoHelpRef.current != null && !protoHelpRef.current.contains(e.target as Node)) {
        setProtoHelpOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [protoHelpOpen])

  const sessionHelpLine =
    chatSessionId === 's1' ? '当前线程：增长与数据 · 主会话（示意）' : '当前线程：Q2 PRD 证据与引用补全（示意）'

  const chatTopTabs = (
    <div className="flex h-8 shrink-0 items-center gap-0 border-b border-cd-border bg-cd-surface px-1">
      {CHAT_SESSIONS.map((s) => {
        const active = s.id === chatSessionId
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => setChatSessionId(s.id)}
            className={`relative shrink-0 px-2.5 py-1.5 text-[11px] font-medium ${
              active ? 'text-j-ink' : 'text-cd-muted hover:text-j-ink'
            }`}
          >
            {s.tab}
            {active && <span className="absolute bottom-0 left-1.5 right-1.5 h-0.5 rounded-full bg-j-brand" />}
          </button>
        )
      })}
      <button type="button" className="ml-auto shrink-0 px-2 text-cd-muted hover:text-j-ink" aria-label="新会话" title="新会话">
        +
      </button>
    </div>
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-cd-page">
      <CdMicroTabRow
        left={
          <span className="flex min-w-0 max-w-[min(100vw-10rem,42rem)] items-center gap-1.5 px-0.5">
            <KevinBrandCompact />
            <span className="shrink-0 text-cd-muted">·</span>
            <span className="shrink-0 text-[11px] font-medium text-j-ink">工作区</span>
            <span className="shrink-0 text-cd-muted">·</span>
            <span className="min-w-0 truncate text-[11px] text-cd-muted">增长与数据 · Q2</span>
          </span>
        }
        center={null}
        right={
          <>
            <div className="relative shrink-0" ref={protoHelpRef}>
              <button
                type="button"
                onClick={() => setProtoHelpOpen((v) => !v)}
                className="flex h-5 w-5 items-center justify-center rounded-full border border-cd-border text-[10px] font-bold text-cd-muted hover:border-j-brand hover:text-j-ink"
                aria-expanded={protoHelpOpen}
                aria-label="原型说明与帮助"
                title="原型说明（未来：功能帮助）"
              >
                ?
              </button>
              {protoHelpOpen && (
                <div
                  role="tooltip"
                  className="absolute right-0 top-[calc(100%+6px)] z-[60] w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-cd-border bg-cd-surface p-3 text-[11px] leading-relaxed text-cd-muted shadow-xl"
                >
                  <p className="font-semibold text-j-ink">原型说明</p>
                  <p className="mt-1 text-[10px] text-cd-muted">正式版可替换为功能说明与快捷键。</p>
                  <hr className="my-2 border-cd-border" />
                  <p className="font-medium text-j-ink">多会话 Tab</p>
                  <p className="mt-0.5">{sessionHelpLine}</p>
                  <hr className="my-2 border-cd-border" />
                  <p className="font-medium text-j-ink">工作区 · 浏览</p>
                  <p className="mt-0.5">{PROTO_HELP_WORKSPACE}</p>
                </div>
              )}
            </div>
            <button
              type="button"
              className="rounded border border-cd-border px-1.5 py-0 text-[10px] text-cd-muted hover:bg-cd-page hover:text-j-ink"
              title="占位"
            >
              灵动岛
            </button>
            <button
              type="button"
              className="rounded border border-cd-border px-1.5 py-0 text-[10px] text-cd-muted hover:bg-cd-page hover:text-j-ink"
              title="占位"
            >
              搜索
            </button>
            <button
              type="button"
              onClick={() => setDeckOpen(true)}
              className="rounded border border-cd-border bg-cd-page px-1.5 py-0 text-[10px] font-medium text-j-ink hover:bg-cd-surface"
            >
              工作区 ▾
            </button>
            <KevinMoreMenu />
          </>
        }
      />

      <div className="min-h-0 flex-1 p-2">
        <PanelGroup direction="horizontal" className="h-full overflow-hidden rounded-lg border border-cd-border bg-cd-surface shadow-sm">
          <Panel defaultSize={34} minSize={24} maxSize={44}>
            <CdChatThread variant="workspace" onOpenArtifact={() => go('artifact')} topTabs={chatTopTabs} />
          </Panel>

          <ResizeHandle />

          <Panel defaultSize={66} minSize={48}>
            <div className="flex h-full min-h-0 flex-col border-l border-cd-border bg-cd-surface">
              <div className="flex h-8 shrink-0 items-center gap-2 border-b border-cd-border bg-cd-surface px-2">
                <span className="shrink-0 text-[11px] font-semibold text-j-ink">工作区</span>
                <div className="flex min-w-0 items-center gap-0">
                  {(
                    [
                      { id: 'browse' as const, label: '浏览' },
                      { id: 'artifact' as const, label: 'Artifact' },
                    ] as const
                  ).map((t) => {
                    const active = workspaceMainTab === t.id
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setWorkspaceMainTab(t.id)}
                        className={`relative shrink-0 px-2.5 py-1.5 text-[11px] font-medium ${
                          active ? 'text-j-ink' : 'text-cd-muted hover:text-j-ink'
                        }`}
                      >
                        {t.label}
                        {active && <span className="absolute bottom-0 left-1.5 right-1.5 h-0.5 rounded-full bg-j-brand" />}
                      </button>
                    )
                  })}
                </div>
              </div>

              {workspaceMainTab === 'browse' && (
                <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
                  <div className="flex min-h-0 w-full min-w-0 flex-col border-cd-border lg:w-[min(38%,20rem)] lg:max-w-[min(100%,20rem)] lg:shrink-0 lg:border-r">
                    <div className="proto-scroll flex-1 overflow-auto p-2">
                      <TreeRows
                        nodes={OBJECT_TREE}
                        depth={0}
                        expanded={expanded}
                        toggle={toggle}
                        selectedId={selectedId}
                        onSelectFile={setSelectedId}
                      />
                    </div>
                  </div>
                  <div className="flex min-h-0 min-w-0 flex-1 flex-col border-t border-cd-border lg:border-t-0">
                    <div className="shrink-0 border-b border-cd-border px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase text-cd-muted">预览</p>
                      <p className="mt-0.5 truncate font-mono text-[12px] font-medium text-j-ink">{selected?.pathLabel}</p>
                      <p className="font-sans text-[10px] text-cd-muted">{selected?.meta}</p>
                    </div>
                    <div className="proto-scroll flex-1 space-y-3 overflow-auto p-3 text-sm leading-relaxed text-j-ink">
                      <WorkspaceDocPreview file={selected} />
                      <p className="text-[11px] text-cd-muted">{selected?.preview}</p>
                      {selected?.artifact && (
                        <button
                          type="button"
                          onClick={() => go('artifact')}
                          className="text-[11px] font-semibold text-j-brand hover:underline"
                        >
                          打开结构化视图（Artifact）→
                        </button>
                      )}
                      {!selected?.artifact && (
                        <p className="font-mono text-[10px] text-cd-muted">与 @ 引用、签批与索引同一对象模型（占位）</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {workspaceMainTab === 'artifact' && (
                <div className="proto-scroll flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4 text-[12px] text-cd-muted">
                  <p className="text-j-ink">
                    与 Claude Design 类似：右侧 <strong className="font-medium">Artifact</strong> Tab
                    承载结构化块、版本、签批入口；与「浏览」中的选中文件同源。
                  </p>
                  <p>原型阶段全屏画布仍走现有路由；此处为内嵌占位。</p>
                  <button
                    type="button"
                    onClick={() => go('artifact')}
                    className="self-start rounded-md border border-cd-border bg-cd-page px-3 py-1.5 text-[11px] font-semibold text-j-ink hover:bg-cd-surface"
                  >
                    进入 Artifact 全屏视图 →
                  </button>
                </div>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>

      {deckOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/25 p-2 sm:p-4"
          role="presentation"
          onClick={() => setDeckOpen(false)}
        >
          <div
            role="dialog"
            aria-labelledby="workspace-deck-title"
            className="flex h-full max-h-[92vh] w-full max-w-[min(72rem,calc(100vw-1rem))] flex-col rounded-lg border border-cd-border bg-cd-surface shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-cd-border px-3 py-2">
              <h2 id="workspace-deck-title" className="text-sm font-semibold text-j-ink">
                工作区菜单
              </h2>
              <button
                type="button"
                onClick={() => setDeckOpen(false)}
                className="rounded-md px-2 py-1 text-[11px] text-cd-muted hover:bg-cd-page hover:text-j-ink"
              >
                关闭
              </button>
            </div>
            <div className="flex shrink-0 gap-0 border-b border-cd-border px-2">
              {(
                [
                  { id: 'overview' as const, label: '概览' },
                  { id: 'settings' as const, label: '空间设置' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setDeckTab(t.id)}
                  className={`relative px-3 py-2 text-[11px] font-medium ${
                    deckTab === t.id ? 'text-j-ink' : 'text-cd-muted hover:text-j-ink'
                  }`}
                >
                  {t.label}
                  {deckTab === t.id && (
                    <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-j-brand" />
                  )}
                </button>
              ))}
            </div>
            <div className="proto-scroll flex min-h-0 flex-1 flex-col overflow-auto p-3 text-sm">
              {deckTab === 'overview' && (
                <div className="flex min-h-0 flex-1 flex-col">
                  <p className="mb-2 shrink-0 text-[11px] text-cd-muted">概览（无独立路由）：从「工作区 ▾」或底栏打开。</p>
                  <WorkspaceOverviewBody go={go} />
                </div>
              )}
              {deckTab === 'settings' && (
                <div className="space-y-3 text-[12px] text-j-ink">
                  <p className="text-[11px] text-cd-muted">
                    挂载根路径、连接器范围、索引与侧车策略、飞书表同步粒度等（占位）。
                  </p>
                  <ul className="list-inside list-disc space-y-1 text-cd-muted">
                    <li>资料库挂载与重扫</li>
                    <li>飞书：文档空间 / 表格列表</li>
                    <li>Kevin 输出角色：索引 / frontmatter / 侧车（不强制文件名约定）</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => {
          setDeckTab('overview')
          setDeckOpen(true)
        }}
        className="shrink-0 border-t border-cd-border bg-cd-surface py-1.5 text-center text-[11px] text-cd-muted hover:text-j-brand"
      >
        ← 概览
      </button>
    </div>
  )
}
