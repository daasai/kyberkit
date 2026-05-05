import type { ReactNode } from "react";
import { cn } from "../lib/utils";

export function StatusDot({ tone }: { tone: "success" | "warning" | "danger" | "info" | "muted" }) {
  const map = {
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
    info: "bg-info",
    muted: "bg-slate-400",
  };
  return <span className={cn("inline-block h-2 w-2 rounded-full", map[tone])} />;
}

export function KbdHint({ text }: { text: string }) {
  return <kbd className="rounded border border-border-default bg-slate-50 px-1.5 py-0.5 text-xs text-fg-secondary">{text}</kbd>;
}

export function EmptyState({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-border-default bg-bg-panel p-6 text-center">
      <p className="text-sm text-fg-secondary">{title}</p>
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ reason, onRetry }: { reason: string; onRetry?: () => void }) {
  return (
    <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
      <div>{reason}</div>
      {onRetry ? (
        <button className="mt-2 rounded bg-danger px-3 py-1 text-white" onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  );
}

export function StateWrapper({
  status,
  loading,
  empty,
  error,
  partial,
  children,
}: {
  status: "loading" | "empty" | "error" | "partial" | "ready";
  loading?: ReactNode;
  empty?: ReactNode;
  error?: ReactNode;
  partial?: ReactNode;
  children: ReactNode;
}) {
  if (status === "loading") return <>{loading}</>;
  if (status === "empty") return <>{empty}</>;
  if (status === "error") return <>{error}</>;
  return (
    <>
      {status === "partial" ? partial : null}
      {children}
    </>
  );
}
