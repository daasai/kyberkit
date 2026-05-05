import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { EmptyState, KbdHint, StateWrapper } from "../components/common";
import { PreviewPane } from "../components/preview";
import { MessageStream, RunSummaryBarWithState } from "../components/sessions";
import { useDeepLinkAnchor } from "../hooks/useDeepLinkAnchor";
import { useConsoleEvents } from "../hooks/useConsoleEvents";
import type { SessionMessage } from "../mock/types";
import { apiClient } from "../lib/apiClient";
import { fmtRelativeTime } from "../lib/utils";

export function SessionsPage() {
  useDeepLinkAnchor();
  const { sessionId } = useParams();
  const [sessions, setSessions] = useState<Array<{ id: string }>>([]);
  const [messages, setMessages] = useState<SessionMessage[]>([]);
  const [artifact, setArtifact] = useState<{ mimeType: string; name: string; content: string } | null>(null);
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [pendingApprovalId, setPendingApprovalId] = useState<string | null>(null);
  const selectedId = sessionId ?? sessions[0]?.id;

  const loadSessions = useCallback(async () => {
    try {
      const rows = await apiClient.listSessions();
      setSessions(rows.map((r) => ({ id: r.id })));
      setError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "会话加载失败";
      setError(message);
    }
  }, []);

  const loadMessages = useCallback(
    async (id: string) => {
      try {
        const rows = await apiClient.getSessionMessages(id);
        setMessages(rows);
        setError(null);
      } catch (e) {
        const message = e instanceof Error ? e.message : "消息加载失败";
        setError(message);
      }
    },
    [],
  );

  const events = useConsoleEvents((name, payload) => {
    const payloadSessionId =
      typeof payload === "object" && payload !== null && "sessionId" in payload
        ? String((payload as { sessionId?: string }).sessionId ?? "")
        : "";
    if (
      selectedId &&
      (name === "session.updated" || name === "audit.appended" || name === "approval.updated") &&
      (!payloadSessionId || payloadSessionId === selectedId)
    ) {
      void loadMessages(selectedId);
    }
    if (name === "contract.updated" || name === "session.updated" || name === "approval.updated") {
      void loadSessions();
    }
  });

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);
  useEffect(() => {
    if (!selectedId) return;
    void loadMessages(selectedId);
  }, [selectedId, loadMessages]);
  useEffect(() => {
    if (!artifactId) {
      setArtifact(null);
      return;
    }
    void apiClient
      .getArtifactContent(artifactId)
      .then((result) => {
        setArtifact(result ?? null);
        setError(null);
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : "预览加载失败";
        setError(message);
      });
  }, [artifactId]);

  const runContext = useMemo(() => {
    const latest = messages[messages.length - 1];
    if (!latest) {
      return {
        phase: "planning",
        nextStep: "等待输入任务",
        touchedFiles: [],
        toolSummary: "暂无",
      };
    }
    const toolCalls = messages.filter((item) => item.kind === "tool_call");
    const artifacts = messages.filter(
      (item): item is SessionMessage & { artifact: NonNullable<SessionMessage["artifact"]> } =>
        item.kind === "artifact_card" && Boolean(item.artifact),
    );
    const touchedFiles = artifacts.map((item) => item.artifact.path);
    const statusCount = toolCalls.reduce<Record<string, number>>((acc, item) => {
      const key = item.status ?? "running";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    return {
      phase:
        latest.kind === "tool_call" && latest.status === "running"
          ? "tooling"
          : latest.kind === "approval_banner"
            ? "awaiting_approval"
            : latest.kind === "tool_call" && latest.status === "error"
              ? "error"
              : latest.kind === "artifact_card"
                ? "completed"
                : "responding",
      nextStep:
        latest.kind === "approval_banner"
          ? "审批后继续执行"
          : latest.kind === "tool_call" && latest.status === "running"
            ? `等待 ${latest.toolName ?? "工具"} 返回`
            : latest.kind === "artifact_card"
              ? "检查制品并继续下一轮"
              : "生成下一步结果",
      touchedFiles,
      toolSummary: Object.entries(statusCount)
        .map(([key, value]) => `${key} x${value}`)
        .join(", ") || "暂无",
    };
  }, [messages]);

  const summary = useMemo(() => {
    if (!messages.length) return { phase: "planning" as const, nextStep: "等待会话事件到达" };
    const latest = messages[messages.length - 1];
    if (latest.kind === "approval_banner") return { phase: "awaiting_approval" as const, nextStep: "等待审批后继续执行" };
    if (latest.kind === "tool_call" && latest.status === "running") return { phase: "tooling" as const, nextStep: `执行工具 ${latest.toolName ?? ""}` };
    if (latest.kind === "tool_call" && latest.status === "error") return { phase: "error" as const, nextStep: "检查错误并重试任务" };
    if (latest.kind === "assistant") return { phase: "responding" as const, nextStep: "等待完整输出并生成制成品" };
    if (latest.kind === "artifact_card") return { phase: "completed" as const, nextStep: "审阅制成品并继续下一轮" };
    return { phase: "planning" as const, nextStep: "推导下一步执行计划" };
  }, [messages]);

  const handleSend = async () => {
    if (!selectedId || !composer.trim() || submitting) return;
    setSubmitting(true);
    try {
      await apiClient.sendSessionMessage(selectedId, composer.trim());
      setComposer("");
      setError(null);
      await loadMessages(selectedId);
      await loadSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "发送失败");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = async () => {
    if (!selectedId || submitting) return;
    setSubmitting(true);
    try {
      await apiClient.cancelSessionRun(selectedId);
      setError(null);
      await loadMessages(selectedId);
      await loadSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "取消失败");
    } finally {
      setSubmitting(false);
    }
  };

  const onApprovalAction = async (approvalId: string, action: "approve" | "deny") => {
    if (!selectedId) return;
    setPendingApprovalId(approvalId);
    try {
      await apiClient.decideApproval(approvalId, action);
      setError(null);
      await loadMessages(selectedId);
      await loadSessions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "审批操作失败");
    } finally {
      setPendingApprovalId(null);
    }
  };

  if (!selectedId) {
    if (error) {
      return (
        <div className="p-4">
          <div className="mb-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
            <p className="font-medium">无法加载会话列表</p>
            <p className="mt-1 text-xs">{error}</p>
            <p className="mt-2 text-xs text-fg-secondary">
              请确认已启动控制台 API（例如仓库根目录执行 <code className="rounded bg-bg-panel px-1">bun run web:api</code>
              ），且 Vite 代理指向该端口（环境变量 <code className="rounded bg-bg-panel px-1">VITE_API_PROXY_TARGET</code>）。
            </p>
            <button type="button" className="mt-3 text-xs underline" onClick={() => void loadSessions()}>
              重试
            </button>
          </div>
        </div>
      );
    }
    return (
      <div className="p-4">
        <EmptyState title="还没有会话，点击“新会话”开始。" />
      </div>
    );
  }

  return (
    <div className="grid h-[calc(100vh-3rem)] grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px]">
      <section className="overflow-auto border-r border-border-default p-4">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-lg font-semibold">会话: {selectedId}</h1>
          <div className="space-x-1 text-xs text-fg-secondary">
            <KbdHint text="g s" /> <span>打开设置</span> · <span>SSE: {events.status}</span>
          </div>
        </div>
        <div className="mb-2 text-xs text-fg-secondary">
          事件数: {events.count}
          {events.lastEventAt ? ` · 最近事件: ${fmtRelativeTime(events.lastEventAt)}` : ""}
        </div>
        {error ? (
          <div className="mb-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
            <div>{error}</div>
            <button type="button" className="mt-2 underline" onClick={() => selectedId && void loadMessages(selectedId)}>
              重试加载
            </button>
          </div>
        ) : null}
        <RunSummaryBarWithState phase={summary.phase} nextStep={summary.nextStep} />
        <StateWrapper
          status={messages.length ? "ready" : "empty"}
          empty={<EmptyState title="当前会话暂无消息。" />}
        >
          <MessageStream
            messages={messages}
            onOpenArtifact={setArtifactId}
            onApprovalAction={onApprovalAction}
            pendingApprovalId={pendingApprovalId}
          />
        </StateWrapper>
        <div className="sticky bottom-0 mt-4 rounded border border-border-default bg-bg-panel p-3">
          <p className="mb-2 text-xs text-fg-secondary">
            此处通过控制台 API 做演示级执行（本地模拟），不会连接终端里的真实模型会话。全功能对话请使用{" "}
            <code className="rounded bg-bg-panel px-1">kyberkit chat</code>。
          </p>
          <textarea
            value={composer}
            onChange={(event) => setComposer(event.target.value)}
            placeholder="输入任务内容，支持审批流与普通执行。"
            className="h-20 w-full resize-y rounded border border-border-default px-3 py-2 text-sm"
          />
          <div className="mt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={submitting}
              className="rounded border border-border-default px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleCancel}
            >
              取消运行
            </button>
            <button
              type="button"
              disabled={submitting || !composer.trim()}
              className="rounded bg-accent px-3 py-1 text-xs text-white disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => void handleSend()}
            >
              发送
            </button>
          </div>
        </div>
      </section>
      <section className="overflow-auto p-4">
        <div className="mb-2 flex gap-2 text-xs">
          <button
            type="button"
            className={`rounded px-2 py-1 ${artifact ? "bg-slate-100 text-fg-secondary" : "bg-accent text-white"}`}
            onClick={() => setArtifactId(null)}
          >
            运行
          </button>
          <button
            type="button"
            className={`rounded px-2 py-1 ${artifact ? "bg-accent text-white" : "bg-slate-100 text-fg-secondary"}`}
            onClick={() => setArtifactId("art_001")}
          >
            预览
          </button>
        </div>
        <PreviewPane artifact={artifact} context={runContext} />
      </section>
    </div>
  );
}
