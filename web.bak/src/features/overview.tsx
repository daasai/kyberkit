import { useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";
import { apiClient } from "../lib/apiClient";

const dismissKey = "kyberkit.console.overview.dismissed:default";

export function useOverviewModal() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!localStorage.getItem(dismissKey)) {
      setOpen(true);
    }
  }, []);

  return {
    open,
    openNow: () => setOpen(true),
    closeAndDismiss: () => {
      localStorage.setItem(dismissKey, "1");
      setOpen(false);
    },
    closeOnly: () => setOpen(false),
  };
}

export function OverviewModal({
  open,
  onClose,
  onDismiss,
}: {
  open: boolean;
  onClose: () => void;
  onDismiss: () => void;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [growth, setGrowth] = useState({ memories: 0, skills: 0, permits: 0 });
  const [sparkline, setSparkline] = useState<number[]>([]);
  const [events, setEvents] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement | null>(null);
  useFocusTrap(open, ref.current);

  useEffect(() => {
    if (!open) return;
    void apiClient.aggregateGrowthSince().then(setGrowth);
    void apiClient.growth7d().then(setSparkline);
    const id = window.setInterval(() => {
      setEvents((prev) => [`${new Date().toLocaleTimeString()} · contract.run.due`, ...prev].slice(0, 8));
    }, reducedMotion ? 3000 : 2000);
    return () => window.clearInterval(id);
  }, [open, reducedMotion]);

  useEffect(() => {
    if (!open) return;
    const source = new EventSource("/api/events/stream");
    source.addEventListener("heartbeat", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { ts: number; event: string };
      setEvents((prev) => [`${new Date(payload.ts).toLocaleTimeString()} · ${payload.event}`, ...prev].slice(0, 8));
    });
    return () => source.close();
  }, [open]);

  const points = useMemo(
    () =>
      sparkline
        .map((v, i) => `${(i / Math.max(1, sparkline.length - 1)) * 280},${80 - v * 2}`)
        .join(" "),
    [sparkline],
  );

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div ref={ref} role="dialog" aria-modal="true" className="max-h-[85vh] w-full max-w-[960px] overflow-auto rounded-md bg-bg-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-semibold">工作区概览</h2>
          <button type="button" onClick={onClose} className="rounded border border-border-default px-2 py-1 text-sm">
            关闭
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Card title="Memories 7d" value={growth.memories} />
          <Card title="Skills 7d" value={growth.skills} />
          <Card title="Permits 7d" value={growth.permits} />
        </div>
        <div className="mt-4 rounded border border-border-default p-3">
          <div className="mb-2 text-sm font-semibold">7 天增长趋势</div>
          <svg viewBox="0 0 280 80" className="w-full">
            <title>过去 7 天增长趋势</title>
            <polyline points={points} fill="none" stroke="hsl(var(--accent))" strokeWidth="2" />
          </svg>
        </div>
        <div className="mt-4 rounded border border-border-default p-3">
          <div className="mb-2 text-sm font-semibold">实时事件流</div>
          <div className="space-y-1 text-xs text-fg-secondary">
            {events.length === 0 ? <div>等待事件…</div> : events.map((event) => <div key={event}>{event}</div>)}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-border-default px-3 py-1.5 text-sm">
            稍后再说
          </button>
          <button type="button" onClick={onDismiss} className="rounded bg-accent px-3 py-1.5 text-sm text-white">
            开始使用
          </button>
        </div>
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded border border-border-default bg-slate-50 p-3">
      <div className="text-xs text-fg-secondary">{title}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
