import { PanelResizeHandle } from 'react-resizable-panels'

export function ResizeHandle() {
  return (
    <PanelResizeHandle className="group flex w-2 items-center justify-center bg-cd-page outline-none">
      <span className="h-10 w-px rounded-full bg-cd-muted/20 transition-colors group-data-[panel-resize-handle-active]:bg-j-brand" />
    </PanelResizeHandle>
  )
}
