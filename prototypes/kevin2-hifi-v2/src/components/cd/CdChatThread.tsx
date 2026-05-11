import { useState, type ReactNode } from 'react'
import { CdChatComposer } from './CdChatComposer'

export type CdChatVariant = 'workspace' | 'artifact' | 'home' | 'homeEmpty' | 'firstEncounter'

export type CdChatThreadProps = {
  variant: CdChatVariant
  /** Workspace / Artifact：点击 Open 进入结构化视图 */
  onOpenArtifact?: () => void
  /** 外侧 Chat | Comments 等 */
  topTabs?: ReactNode
  /** Workspace：多会话示意，顶条下方一行弱提示 */
  workspaceSessionLabel?: string
}

type ToolStatus = 'running' | 'done' | 'error'

function ToolRow({
  icon,
  label,
  detail,
  status,
}: {
  icon: string
  label: string
  detail: string
  status: ToolStatus
}) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-cd-border bg-cd-page px-2 py-1.5 font-mono text-[11px] text-j-ink">
      <span className="shrink-0 text-cd-muted">{icon}</span>
      <div className="min-w-0 flex-1">
        <span className="font-medium text-j-ink">{label}</span>
        <span className="text-cd-muted"> · </span>
        <span className="break-all text-cd-muted">{detail}</span>
      </div>
      <span
        className={
          status === 'done'
            ? 'shrink-0 text-j-brand'
            : status === 'running'
              ? 'shrink-0 animate-pulse text-cd-muted'
              : 'shrink-0 text-j-danger'
        }
      >
        {status === 'done' ? '✓' : status === 'running' ? '…' : '!'}
      </span>
    </div>
  )
}

function ThinkingBlock({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="mb-2 overflow-hidden rounded-lg border border-cd-border bg-cd-page">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] font-medium text-cd-muted hover:bg-cd-surface/60"
      >
        <span className="w-3 text-cd-muted">{open ? '▾' : '▸'}</span>
        <span>思考</span>
      </button>
      {open && <div className="border-t border-cd-border px-2.5 py-2 text-[11px] leading-relaxed text-cd-muted">{children}</div>}
    </div>
  )
}

function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[min(100%,34rem)] rounded-2xl rounded-tr-md border border-cd-border bg-cd-surface px-3 py-2 text-sm text-j-ink shadow-sm">
        {children}
      </div>
    </div>
  )
}

function AssistantBlock({
  thinking,
  tools,
  children,
  footer,
}: {
  thinking?: ReactNode
  tools?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="max-w-[min(100%,42rem)]">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-cd-muted">Kevin</span>
        <span className="h-px flex-1 bg-cd-border" />
      </div>
      {thinking}
      {tools && <div className="mb-2 space-y-1">{tools}</div>}
      <div className="text-sm leading-relaxed text-j-ink">{children}</div>
      {footer}
    </div>
  )
}

function ArtifactInlineCard({
  title,
  subtitle,
  onOpen,
}: {
  title: string
  subtitle: string
  onOpen?: () => void
}) {
  return (
    <div className="mt-3 rounded-lg border border-cd-border bg-cd-surface p-3 shadow-sm">
      <p className="text-[10px] font-semibold uppercase text-cd-muted">输出</p>
      <p className="mt-0.5 font-medium text-j-ink">{title}</p>
      <p className="text-[11px] text-cd-muted">{subtitle}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onOpen}
          className="rounded-md bg-j-brand px-2.5 py-1 text-[11px] font-semibold text-j-cream hover:bg-j-brand/90"
        >
          打开
        </button>
        <button type="button" className="rounded-md border border-cd-border px-2.5 py-1 text-[11px] hover:bg-cd-page">
          预览
        </button>
        <button type="button" className="rounded-md border border-cd-border px-2.5 py-1 text-[11px] hover:bg-cd-page">
          固定
        </button>
      </div>
    </div>
  )
}

/** Claude Design 式对话区：思考折叠、工具行、结果、输出卡、底部输入框 */
export function CdChatThread({ variant, onOpenArtifact, topTabs, workspaceSessionLabel }: CdChatThreadProps) {
  const [srcOpen, setSrcOpen] = useState(false)

  const workspaceDemo = (
    <>
      <UserBubble>基于本周数仓结果和飞书上的实验纪要，生成 Weekly Ops Review 草稿；并帮我把 Q2 PRD 的 Problem 段补上证据引用。</UserBubble>
      <AssistantBlock
        thinking={
          <ThinkingBlock>
            需要先确认当前 Workspace 已挂载的 Library 与启用的 Connectors；优先读 Materials 中最新数仓导出与飞书实验纪要，再决定生成顺序。避免在缺少
            EvidenceRef 时直接改写 PRD 必填块。
          </ThinkingBlock>
        }
        tools={
          <>
            <ToolRow icon="◇" label="list_materials" detail='glob "*.md" · mount ~/…/growth-q2' status="done" />
            <ToolRow icon="◇" label="connector_query" detail="DataWarehouse · metrics=DAU_WOW · range=7d" status="done" />
            <ToolRow icon="◇" label="read_doc" detail="飞书 · 实验纪要（cached ref feishu://…）" status="done" />
            <ToolRow icon="◇" label="artifact_draft" detail="weekly_ops_review · template v1" status="running" />
          </>
        }
      >
        <p>
          已读取 <span className="font-medium text-j-brand">Data Warehouse / Query Metrics</span> 与{' '}
          <span className="font-medium text-j-brand">飞书 Read Docs</span>。周报草稿已排队生成；PRD 侧我已定位 2 段可写入 Problem 的访谈摘录。
        </p>
        <ArtifactInlineCard
          title="Q2 增长 PRD"
          subtitle="type: prd · state: review"
          onOpen={onOpenArtifact}
        />
      </AssistantBlock>
    </>
  )

  const artifactDemo = (
    <>
      <UserBubble>把 Problem block 补一段来自访谈笔记的证据引用，并在 Materials 里标出段落锚点。</UserBubble>
      <AssistantBlock
        thinking={
          <ThinkingBlock>
            在 `访谈笔记-增长组.md` 中检索与「排期不透明」相关的段落；与 PRD Problem 现有表述对齐，避免重复用户原话过长；输出 EvidenceRef
            片段 id。
          </ThinkingBlock>
        }
        tools={
          <>
            <ToolRow icon="◇" label="read_file" detail="materials/interviews_growth.md" status="done" />
            <ToolRow icon="◇" label="semantic_search" detail='query="排期 实验 迭代"' status="done" />
            <ToolRow icon="◇" label="apply_block_patch" detail="artifact:Q2-PRD · block=problem · mode=evidence" status="done" />
          </>
        }
      >
        <p>已在 Problem 下插入 2 条 EvidenceRef；建议在 Review 画布中过一遍措辞。下方可展开 Chat Sources 核对引用片段。</p>
      </AssistantBlock>
    </>
  )

  const homeDemo = (
    <>
      <UserBubble>帮我扫一眼本周材料、待签批动作，以及我最该先处理哪条输出。</UserBubble>
      <AssistantBlock
        thinking={
          <ThinkingBlock>
            Home 卡片数据来自 Workspace 索引：Recent Artifacts、Pending ActionRequest、Materials staleness、Suggested Next Step
            规则（05 §4.1.1）。不发起新写入，仅汇总与排序建议。
          </ThinkingBlock>
        }
        tools={
          <>
            <ToolRow icon="◇" label="workspace_snapshot" detail="cards=home_v1" status="done" />
            <ToolRow icon="◇" label="policy_check" detail="signoff_queue · medium=1" status="done" />
          </>
        }
      >
        <p>
          当前有 <span className="font-medium">1</span> 条待签批飞书投影；材料里{' '}
          <span className="font-medium">1</span> 项数仓结果可能 stale。建议优先处理 Suggested Next Step 中的 Problem 证据缺口。
        </p>
      </AssistantBlock>
    </>
  )

  const homeEmptyDemo = (
    <AssistantBlock
      thinking={
        <ThinkingBlock>
          冷启动 Workspace：尚无 Materials 与 Artifact。根据 05 §4.1 空状态，应引导命名、拖入文件、陈述目标三步，而非跳入空对话。
        </ThinkingBlock>
      }
      tools={<ToolRow icon="◇" label="workspace_init" detail="state=empty · onboarding=v1" status="done" />}
    >
      <p>请先完成上方「帮 Kevin 了解你的工作」三步；完成后我会基于目录再跑 directory_cognition。你也可以先去「进入主工作区」添加材料。</p>
    </AssistantBlock>
  )

  const firstEncounterDemo = (
    <>
      <UserBubble>指到这个目录了，帮我在 10 秒内告诉我这是什么项目、缺什么、下一步做什么。</UserBubble>
      <AssistantBlock
        thinking={
          <ThinkingBlock>
            执行 directory_cognition：抽样 README、统计文件年龄、检测 docs/specs 交叉引用；低置信领域不强行归类为 PM 场景（14
            WorkType Pack）。
          </ThinkingBlock>
        }
        tools={
          <>
            <ToolRow icon="◇" label="scan_tree" detail="depth=2 · n=142 files" status="done" />
            <ToolRow icon="◇" label="read_file" detail="README.md · head=4k" status="done" />
            <ToolRow icon="◇" label="read_file" detail="docs/specs/kevin2.0/05-ux-ia-alignment.md" status="done" />
            <ToolRow icon="◇" label="infer_worktype" detail="confidence=0.82 · pack=product_design" status="done" />
            <ToolRow icon="◇" label="write_cognition" detail=".kevin/cognition.md · streaming" status="running" />
          </>
        }
      >
        <p>
          这是一个 <span className="font-medium">产品规范 / Kevin 2.0</span> 项目；核心文档 11 份，今天上午有更新。发现 06 与 02
          字段存在未对齐引用；hermes/ 下草稿尚未被规范引用。你可先对齐 02，或让我继续读完 hermes 再汇总。
        </p>
      </AssistantBlock>
    </>
  )

  const body =
    variant === 'workspace'
      ? workspaceDemo
      : variant === 'artifact'
        ? artifactDemo
        : variant === 'home'
          ? homeDemo
          : variant === 'homeEmpty'
            ? homeEmptyDemo
            : firstEncounterDemo

  return (
    <div className="flex h-full min-h-0 flex-col bg-cd-surface">
      {topTabs}
      {variant === 'workspace' && workspaceSessionLabel != null && workspaceSessionLabel !== '' && (
        <div className="shrink-0 border-b border-cd-border bg-cd-page/60 px-3 py-1 text-[10px] text-cd-muted">
          {workspaceSessionLabel}
        </div>
      )}
      <div className="proto-scroll flex-1 space-y-4 overflow-auto p-3">
        {body}
        {variant === 'artifact' && (
          <div className="border-t border-cd-border pt-2">
            <button
              type="button"
              onClick={() => setSrcOpen((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg border border-cd-border bg-cd-page px-2 py-1.5 text-left text-[11px] text-cd-muted"
            >
              <span>Chat Sources（材料来源 · 05）</span>
              <span>{srcOpen ? '▾' : '▸'}</span>
            </button>
            {srcOpen && (
              <ul className="mt-1 space-y-1 rounded-lg border border-cd-border bg-cd-page p-2 text-[11px] text-cd-muted">
                <li>访谈笔记-增长组.md · §3</li>
                <li>Q2_feature_brief.md · Goals</li>
              </ul>
            )}
          </div>
        )}
      </div>
      <CdChatComposer />
    </div>
  )
}
