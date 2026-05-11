import { PanelResizeHandle } from 'react-resizable-panels'

export function ResizeHandle() {
  return (
    <PanelResizeHandle className="group flex w-2 items-center justify-center bg-j-cream outline-none">
      <span className="h-10 w-px rounded-full bg-j-muted/20 transition-colors group-data-[panel-resize-handle-active]:bg-j-accent" />
    </PanelResizeHandle>
  )
}
