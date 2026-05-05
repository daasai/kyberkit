import { EmptyState, ErrorState, KbdHint, StatusDot } from "../components/common";

export function ComponentsGalleryPage() {
  return (
    <main className="p-4">
      <h1 className="mb-3 text-lg font-semibold">Components Gallery</h1>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded border border-border-default bg-bg-panel p-3">
          <h2 className="mb-2 text-sm font-semibold">状态点</h2>
          <div className="flex items-center gap-3">
            <StatusDot tone="success" />
            <StatusDot tone="warning" />
            <StatusDot tone="danger" />
            <StatusDot tone="info" />
          </div>
        </div>
        <div className="rounded border border-border-default bg-bg-panel p-3">
          <h2 className="mb-2 text-sm font-semibold">键盘提示</h2>
          <KbdHint text="g s" /> <KbdHint text="?" />
        </div>
        <EmptyState title="暂无数据空态示例" />
        <ErrorState reason="加载失败示例" />
      </div>
    </main>
  );
}
