import type { ReactNode } from 'react'

/** Claude Design 式极薄顶栏 / 工具条（约 32px） */
export function CdMicroTabRow({
  left,
  center,
  right,
}: {
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-cd-border bg-cd-surface px-2 text-xs">
      <div className="flex shrink-0 items-center gap-1">{left}</div>
      <div className="min-w-0 flex-1 truncate text-center text-cd-muted">{center}</div>
      <div className="flex shrink-0 items-center justify-end gap-1">{right}</div>
    </div>
  )
}
