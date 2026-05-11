import type { ReactNode } from 'react'
import { KevinBrandLarge } from '../brand/KevinBrand'

/** CD 式：无通栏分割条；可选大规格品牌区 + 页内标题（方案 B1） */
export function KevinFloatingChrome({
  brand = 'none',
  headline,
  subtitle,
  /** @deprecated 使用 headline */
  title,
  right,
}: {
  brand?: 'none' | 'large'
  headline?: ReactNode
  subtitle?: ReactNode
  title?: ReactNode
  right?: ReactNode
}) {
  const h = headline ?? title

  return (
    <header className="flex shrink-0 items-end justify-between gap-4 px-5 pt-5 pb-2 sm:px-8">
      <div className="flex min-w-0 flex-1 flex-wrap items-stretch gap-x-5 gap-y-3 sm:gap-x-6">
        {brand === 'large' && <KevinBrandLarge className="shrink-0" />}
        {brand === 'large' && (h != null && h !== '') && (
          <div className="flex min-w-0 min-h-0 flex-1 items-stretch gap-4 sm:gap-5">
            <div className="w-px shrink-0 bg-cd-border" aria-hidden />
            <div className="flex min-w-0 flex-col justify-end gap-0.5 pb-px">
              <div className="text-[0.9375rem] font-semibold leading-snug text-j-ink sm:text-base">{h}</div>
              {subtitle != null && subtitle !== '' && (
                <div className="text-[10px] leading-snug text-cd-muted sm:text-[11px]">{subtitle}</div>
              )}
            </div>
          </div>
        )}
        {brand === 'none' && (
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0">
              <span className="font-display text-xl tracking-tight text-j-ink">Kevin</span>
              {h != null && h !== '' && (
                <span className="truncate text-sm font-semibold text-j-ink sm:text-base">{h}</span>
              )}
            </div>
            {subtitle != null && subtitle !== '' && <div className="mt-1 text-[11px] text-cd-muted">{subtitle}</div>}
          </div>
        )}
        {brand === 'large' && (h == null || h === '') && subtitle != null && subtitle !== '' && (
          <div className="w-full text-[11px] text-cd-muted sm:w-auto">{subtitle}</div>
        )}
      </div>
      {right != null && (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 pb-px">{right}</div>
      )}
    </header>
  )
}
