import type { ReactNode, SVGProps } from 'react'
import { useFlow } from '../flow/FlowContext'
import { KevinFloatingChrome } from '../components/cd/KevinFloatingChrome'
import { KevinBrandLarge, KevinBrandCompact } from '../components/brand/KevinBrand'
import {
  DECOR_OPTIONS,
  LOGO_OPTIONS,
  WORK_PACK_OPTIONS,
} from '../components/brand/WorkPackSvgCatalog'

function Tile({
  title,
  subtitle,
  children,
  sizes = [32, 48, 64],
}: {
  title: string
  subtitle?: string
  children: (props: SVGProps<SVGSVGElement>) => ReactNode
  sizes?: number[]
}) {
  return (
    <div className="rounded-xl border border-cd-border bg-cd-surface p-4 shadow-sm">
      <p className="font-medium text-j-ink">{title}</p>
      {subtitle && <p className="mt-0.5 text-xs text-cd-muted">{subtitle}</p>}
      <div className="mt-3 flex flex-wrap items-end gap-4 text-j-brand">
        {sizes.map((sz) => (
          <div key={sz} className="flex flex-col items-center gap-1">
            <span className="text-[10px] text-cd-muted">{sz}px</span>
            <div className="flex h-[72px] w-[72px] items-center justify-center rounded-lg bg-cd-page">{children({ width: sz, height: sz })}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SvgGallery() {
  const { go } = useFlow()

  return (
    <div className="flex h-full min-h-0 flex-col bg-cd-page">
      <KevinFloatingChrome
        brand="large"
        headline="SVG 图库"
        subtitle="筛选 Logo / 装饰 / 各工作包图标后，可把选定 id 告知实现"
        right={
          <button
            type="button"
            onClick={() => go('workspace')}
            className="rounded-full px-3 py-1.5 text-sm text-cd-muted hover:bg-cd-surface hover:text-j-ink"
          >
            关闭
          </button>
        }
      />

      <div className="proto-scroll flex-1 space-y-10 overflow-auto px-5 py-6 sm:px-8">
        <section>
          <h2 className="font-display text-xl text-j-ink">组合预览（当前组件）</h2>
          <p className="mt-1 max-w-2xl text-sm text-cd-muted">以下为线上正在使用的 React 组件，非孤立 SVG。</p>
          <div className="mt-4 flex flex-wrap gap-6 rounded-xl border border-cd-border bg-cd-surface p-6">
            <div>
              <p className="text-[10px] font-semibold uppercase text-cd-muted">大规格</p>
              <KevinBrandLarge className="mt-2" />
            </div>
            <div className="border-l border-cd-border pl-6">
              <p className="text-[10px] font-semibold uppercase text-cd-muted">Artifact 小规格</p>
              <div className="mt-2 rounded-lg border border-cd-border bg-cd-page px-3 py-2">
                <KevinBrandCompact />
              </div>
            </div>
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl text-j-ink">Logo 图标候选（实验）</h2>
          <p className="mt-1 max-w-2xl text-sm text-cd-muted">
            产品主 Logo 已改为粗几何字标「Kevin」（见上方组合预览）。以下为可选图形实验，未接入顶栏。
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {LOGO_OPTIONS.map((o) => (
              <Tile key={o.id} title={o.label} subtitle={`id: ${o.id}`}>
                {(p) => <o.Svg {...p} className="text-j-brand" />}
              </Tile>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl text-j-ink">装饰简笔画候选</h2>
          <p className="mt-1 max-w-2xl text-sm text-cd-muted">用于资料库控件旁、工作包标题侧等占位装饰。</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {DECOR_OPTIONS.map((o) => (
              <Tile key={o.id} title={o.label} subtitle={`id: ${o.id}`}>
                {(p) => <o.Svg {...p} className="text-j-brand/40" />}
              </Tile>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-display text-xl text-j-ink">工作包类型 · 每类多套候选</h2>
          <p className="mt-1 max-w-2xl text-sm text-cd-muted">
            每个工作包选<strong>一个</strong>最终图标即可；记下对应 <code className="rounded bg-cd-page px-1 font-mono text-xs">id</code>。
          </p>
          {WORK_PACK_OPTIONS.map((group) => (
            <div key={group.packId} className="mt-8">
              <h3 className="border-b border-cd-border pb-2 font-display text-lg text-j-ink">{group.packLabel}</h3>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((o) => (
                  <Tile key={o.id} title={o.label} subtitle={`id: ${group.packId} / ${o.id}`}>
                    {(p) => <o.Svg {...p} className="text-j-brand" />}
                  </Tile>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="rounded-xl border border-dashed border-cd-border bg-cd-surface/50 p-4 text-sm text-cd-muted">
          <p>
            其他零散 SVG：Composer 内「+ / 回形针 / 发送旁」等见{' '}
            <code className="rounded bg-cd-page px-1 font-mono text-xs">CdChatComposer.tsx</code>，多为 24×24 线框通用图标，未在此重复展开。
          </p>
        </section>
      </div>
    </div>
  )
}
