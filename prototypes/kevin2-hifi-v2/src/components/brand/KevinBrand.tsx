/**
 * 字标 Logo：几何无衬线 Montserrat，偏克制字重（非 Black），与副标紧凑编排。
 */

const TAGLINE = '不止 Chat，始终 Always-on'

/** Montserrat Bold（比 Black 更轻一档，仍保持字标感） */
const wordmarkClass =
  '[font-family:var(--font-body)] font-bold tracking-[-0.03em] text-j-ink antialiased'

/** 大规格：初始化 / Workspace / Settings */
export function KevinBrandLarge({ className }: { className?: string }) {
  return (
    <div className={`min-w-0 ${className ?? ''}`}>
      <div className={`text-[1.625rem] leading-[1.05] sm:text-[1.875rem] md:text-[2rem] ${wordmarkClass}`}>Kevin</div>
      <p className="mt-0.5 max-w-[min(100%,22rem)] text-[10px] leading-snug text-cd-muted sm:text-[11px]">{TAGLINE}</p>
    </div>
  )
}

/** 小规格：Artifact 顶栏 */
export function KevinBrandCompact({ className }: { className?: string }) {
  return (
    <span className={`inline-block text-sm font-bold leading-none tracking-[-0.03em] sm:text-[0.9375rem] ${wordmarkClass} ${className ?? ''}`}>
      Kevin
    </span>
  )
}
