import { fmtRelativeTime } from "../lib/utils";
import type { SessionMessage } from "../mock/types";
import { StatusDot } from "./common";

export function RunSummaryBar() {
  return <RunSummaryBarWithState phase="tooling" nextStep="生成可审阅制成品" />;
}

export function RunSummaryBarWithState({
  phase,
  nextStep,
}: {
  phase: "planning" | "tooling" | "awaiting_approval" | "responding" | "completed" | "error";
  nextStep: string;
}) {
  return (
    <div className="mb-3 flex items-center justify-between rounded-md border border-border-default bg-bg-panel px-3 py-2 text-xs">
      <span>阶段: {phase}</span>
      <span className="text-fg-secondary">下一步: {nextStep}</span>
    </div>
  );
}

export function MessageStream({
  messages,
  onOpenArtifact,
  onApprovalAction,
  pendingApprovalId,
}: {
  messages: SessionMessage[];
  onOpenArtifact: (artifactId: string) => void;
  onApprovalAction: (approvalId: string, action: "approve" | "deny") => void;
  pendingApprovalId: string | null;
}) {
  return (
    <div role="log" aria-live="polite" className="space-y-3">
      {messages.map((message) => {
        if (message.kind === "user") {
          return (
            <div key={message.id} className="flex justify-end" data-anchor={message.id}>
              <div className="max-w-[70%] rounded-md bg-accent/10 px-3 py-2 text-sm">{message.content}</div>
            </div>
          );
        }
        if (message.kind === "assistant") {
          return (
            <div key={message.id} className="max-w-[80%] rounded-md bg-bg-panel px-3 py-2 text-sm" data-anchor={message.id}>
              {message.content}
            </div>
          );
        }
        if (message.kind === "approval_banner") {
          const approvalId = message.approvalId ?? message.id;
          return (
            <div key={message.id} className="rounded border border-warning/40 bg-warning/10 px-3 py-2 text-sm" data-anchor={approvalId}>
              <div>待审批: 工具 {message.toolName} 需要你的显式批准</div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  className="rounded bg-accent px-2 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={pendingApprovalId === approvalId}
                  onClick={() => onApprovalAction(approvalId, "approve")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="rounded border border-danger/40 px-2 py-1 text-xs text-danger disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={pendingApprovalId === approvalId}
                  onClick={() => onApprovalAction(approvalId, "deny")}
                >
                  Deny
                </button>
              </div>
            </div>
          );
        }
        if (message.kind === "tool_call") {
          const toolAnchor = message.toolName ? `tool:${message.toolName}` : message.id;
          return (
            <details key={message.id} data-anchor={message.id} className="rounded-md border border-border-default bg-bg-panel p-2 text-xs">
              <summary className="cursor-pointer">
                <span className="mr-2 inline-flex items-center gap-1">
                  <StatusDot tone={message.status === "success" ? "success" : message.status === "error" ? "danger" : "warning"} />
                  {message.toolName}
                </span>
                <span className="text-fg-secondary">{fmtRelativeTime(message.createdAt)}</span>
              </summary>
              <pre className="mt-2 overflow-auto rounded bg-slate-50 p-2">{message.args}</pre>
              <pre className="mt-2 overflow-auto rounded bg-slate-50 p-2">{message.result ?? "执行中..."}</pre>
              <div data-anchor={toolAnchor} />
              {message.audit ? (
                <div className="mt-2 rounded border border-border-default p-2">
                  <div>effectivePermission: {message.audit.effectivePermission}</div>
                  <div>policyDecision: {message.audit.policyDecision.code}</div>
                  <div className="text-fg-secondary">{message.audit.policyDecision.reason}</div>
                </div>
              ) : null}
            </details>
          );
        }
        if (message.kind === "artifact_card" && message.artifact) {
          const artifact = message.artifact;
          return (
            <button
              type="button"
              key={message.id}
              className="w-full rounded-md border border-border-default bg-bg-panel p-3 text-left hover:border-accent"
              onClick={() => onOpenArtifact(artifact.artifactId)}
            >
              <div className="text-sm font-medium">{artifact.path}</div>
              <div className="mt-1 text-xs text-fg-secondary">
                {artifact.mimeType} · {(artifact.size / 1024).toFixed(1)} KB
              </div>
            </button>
          );
        }
        return (
          <div key={message.id} className="rounded bg-slate-100 px-2 py-1 text-xs text-fg-secondary">
            系统事件: {message.content ?? message.kind}
          </div>
        );
      })}
    </div>
  );
}
