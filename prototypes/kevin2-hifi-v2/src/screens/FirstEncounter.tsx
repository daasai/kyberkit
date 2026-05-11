import { useFlow } from '../flow/FlowContext'
import { CdMicroTabRow } from '../components/cd/CdMicroTabRow'
import { CdChatThread } from '../components/cd/CdChatThread'
import { KevinFloatingChrome } from '../components/cd/KevinFloatingChrome'

export function FirstEncounter() {
  const { go } = useFlow()

  const scanTabs = (
    <CdMicroTabRow
      left={<span className="text-[10px] font-semibold uppercase text-cd-muted">Scan log</span>}
      center={<span className="text-[11px] text-cd-muted">streaming · 示意</span>}
      right={null}
    />
  )

  return (
    <div className="flex h-full min-h-0 flex-col bg-cd-page">
      <KevinFloatingChrome
        brand="large"
        headline="第一次见面"
        subtitle="资料库认知 · 无通栏顶栏"
        right={
          <>
            <button
              type="button"
              onClick={() => go('workspace')}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-j-brand hover:bg-cd-surface"
            >
              完成
            </button>
            <button
              type="button"
              onClick={() => go('workspace')}
              className="rounded-full px-3 py-1.5 text-sm text-cd-muted hover:bg-cd-surface hover:text-j-ink"
            >
              跳过
            </button>
          </>
        }
      />

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 lg:grid-cols-[1fr_minmax(300px,42%)]">
        <div className="proto-scroll flex min-h-0 flex-col gap-2 overflow-auto">
          <div className="rounded-lg border border-cd-border bg-cd-surface p-3 font-mono text-[11px] text-cd-muted shadow-sm">
            <p className="text-j-ink">{'>'} 看到 142 个文件 · 抽样 README · 读取 docs/specs …</p>
            <p className="mt-1">{'>'} 索引队列：后台继续</p>
          </div>

          <div className="rounded-lg border border-cd-border bg-cd-surface p-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase text-cd-muted">首屏认知</p>
            <div className="mt-3 space-y-2 text-sm leading-relaxed text-j-ink">
              <p>
                <span className="font-medium text-j-brand">[识别]</span> 产品规范项目，Kevin 2.0 PRD 与 UX。
              </p>
              <p>
                <span className="font-medium text-j-brand">[规模]</span> 核心文件 11 个，今天上午有更新。
              </p>
              <p>
                <span className="font-medium text-j-brand">[发现]</span> 06 与 02 字段未对齐引用。
              </p>
              <p>
                <span className="font-medium text-j-brand">[确认]</span> hermes/ 草稿待读。
              </p>
              <p>
                <span className="font-medium text-j-brand">[问题]</span> 先对齐 02 或先看 hermes？
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-cd-border bg-cd-surface p-3 shadow-sm">
            <p className="text-[10px] font-semibold uppercase text-cd-muted">进度</p>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-cd-canvas">
              <div className="h-full w-[72%] rounded-full bg-j-brand" />
            </div>
            <ul className="mt-3 space-y-1 text-[11px] text-cd-muted">
              <li className="flex gap-2">
                <span className="text-j-brand">✓</span> README
              </li>
              <li className="flex gap-2">
                <span className="text-j-brand">✓</span> docs/specs/kevin2.0
              </li>
              <li>… hermes/</li>
            </ul>
          </div>
        </div>

        <div className="flex min-h-[260px] flex-col border-t border-cd-border bg-cd-surface lg:min-h-0 lg:border-l lg:border-t-0">
          <CdChatThread variant="firstEncounter" topTabs={scanTabs} />
        </div>
      </div>
    </div>
  )
}
