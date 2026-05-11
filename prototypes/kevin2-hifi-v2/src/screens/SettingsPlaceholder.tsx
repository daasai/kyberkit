import { useFlow } from '../flow/FlowContext'
import { KevinFloatingChrome } from '../components/cd/KevinFloatingChrome'

export function SettingsPlaceholder() {
  const { go } = useFlow()

  return (
    <div className="flex h-full min-h-0 flex-col bg-cd-page">
      <KevinFloatingChrome
        brand="large"
        headline={<span className="text-base font-semibold text-j-ink">设置</span>}
        right={
          <button
            type="button"
            onClick={() => go('workspace')}
            className="rounded-full px-3 py-1.5 text-sm text-cd-muted hover:bg-cd-surface hover:text-j-ink"
          >
            完成
          </button>
        }
      />
      <div className="proto-scroll flex-1 overflow-auto px-5 py-6 sm:px-8">
        <p className="max-w-lg text-sm text-cd-muted">Settings 全屏占位：与 PRD 对齐的后续迭代；顶栏已使用大规格 Kevin 品牌区。</p>
      </div>
    </div>
  )
}
