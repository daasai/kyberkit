import { useCallback, useMemo, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { EmptyState } from "../components/common";
import { SettingsNav } from "../components/layout";
import { zhCN } from "../i18n/zh-CN";
import { apiClient } from "../lib/apiClient";
import { useEffect } from "react";
import type { AuditRecord, PolicyPack, TaskPermissionContract } from "../mock/types";
import { useConsoleEvents } from "../hooks/useConsoleEvents";
import { fmtRelativeTime } from "../lib/utils";

export function SettingsShell({ onOpenOverview }: { onOpenOverview: () => void }) {
  const events = useConsoleEvents(() => {});
  return (
    <div className="flex h-[calc(100vh-3rem)]">
      <SettingsNav />
      <main className="flex-1 overflow-auto p-4">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold">设置 <span className="text-xs font-normal text-fg-secondary">SSE: {events.status}</span></h1>
          <button type="button" onClick={onOpenOverview} className="rounded border border-border-default px-3 py-1.5 text-sm hover:bg-slate-100">
            {zhCN.settings.overview}
          </button>
        </div>
        <div className="mb-4 text-xs text-fg-secondary">
          事件数: {events.count}
          {events.lastEventAt ? ` · 最近事件: ${fmtRelativeTime(events.lastEventAt)}` : ""}
        </div>
        <Outlet />
      </main>
    </div>
  );
}

export function ContractsPage() {
  const location = useLocation();
  const target = new URLSearchParams(location.search).get("contractId");
  const [tab, setTab] = useState<string>("active");
  const [contracts, setContracts] = useState<TaskPermissionContract[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const [draftTaskId, setDraftTaskId] = useState("");
  const [draftTools, setDraftTools] = useState("write_file:L1:false");
  const loadContracts = useCallback(async () => {
    try {
      const rows = await apiClient.listContracts();
      setContracts(rows);
      setError(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "合约加载失败";
      setError(message);
    }
  }, []);
  useEffect(() => {
    void loadContracts();
  }, [loadContracts]);
  useConsoleEvents((name) => {
    if (name === "contract.updated") {
      void loadContracts();
    }
  });
  const filtered = useMemo(
    () =>
      contracts.filter((item) => {
        if (tab === "active") return item.status === "active";
        if (tab === "paused") return item.status === "paused";
        if (tab === "draft") return item.status === "draft";
        return item.status === "revoked" || item.status === "completed" || item.status === "expired";
      }),
    [contracts, tab],
  );
  return (
    <section>
      {error ? (
        <div className="mb-3 rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>
      ) : null}
      <div className="mb-3 rounded border border-border-default bg-bg-panel p-3">
        <div className="mb-2 text-sm font-semibold">创建草稿合约</div>
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <input
            value={draftTaskId}
            onChange={(event) => setDraftTaskId(event.target.value)}
            placeholder="taskId"
            className="rounded border border-border-default px-2 py-1 text-sm"
          />
          <input
            value={draftTools}
            onChange={(event) => setDraftTools(event.target.value)}
            placeholder="toolName:L1:false,another_tool:L2:true"
            className="rounded border border-border-default px-2 py-1 text-sm"
          />
          <button
            type="button"
            className="rounded bg-accent px-3 py-1 text-xs text-white"
            onClick={() => {
              if (!draftTaskId.trim()) return;
              const requestedTools = draftTools
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
                .map((item) => {
                  const [toolName = "write_file", maxLevel = "L1", approval = "false"] = item.split(":");
                  return { toolName, maxLevel: maxLevel as "L0" | "L1" | "L2" | "L3", approvalRequired: approval === "true" };
                });
              void apiClient
                .createContract({ taskId: draftTaskId.trim() })
                .then((created) => apiClient.updateContract(created.taskId, { requestedTools }))
                .then(loadContracts)
                .then(() => {
                  setDraftTaskId("");
                  setError(null);
                })
                .catch((e) => setError(e instanceof Error ? e.message : "创建草稿失败"));
            }}
          >
            新建
          </button>
        </div>
      </div>
      <TabBar
        tab={tab}
        setTab={setTab}
        tabs={[
          ["active", "运行中"],
          ["paused", "已暂停"],
          ["draft", "草稿"],
          ["history", "历史"],
        ]}
      />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {filtered.map((c) => (
          <article
            key={c.taskId}
            className={`rounded border bg-bg-panel p-3 ${target === c.taskId ? "border-accent" : "border-border-default"}`}
          >
            <div className="text-sm font-semibold">{c.taskId}</div>
            <div className="mt-1 text-xs text-fg-secondary">
              {c.contractType} · {c.status} · {c.policyPack}
            </div>
            <div className="mt-2 text-xs">tools: {c.requestedTools.map((t) => t.toolName).join(", ")}</div>
            <div className="mt-3 flex gap-2">
              {c.status === "draft" ? (
                <button
                  type="button"
                  disabled={actioning === c.taskId}
                  onClick={() => {
                    setActioning(c.taskId);
                    void apiClient
                      .mutateContract(c.taskId, "activate")
                      .then(loadContracts)
                      .catch((e) => setError(e instanceof Error ? e.message : "激活失败"))
                      .finally(() => setActioning(null));
                  }}
                  className="rounded border border-accent/40 px-2 py-1 text-xs text-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  激活
                </button>
              ) : null}
              <button
                type="button"
                disabled={actioning === c.taskId}
                onClick={() => {
                  setActioning(c.taskId);
                  void apiClient
                    .mutateContract(c.taskId, "pause")
                    .then(loadContracts)
                    .catch((e) => setError(e instanceof Error ? e.message : "暂停失败"))
                    .finally(() => setActioning(null));
                }}
                className="rounded border border-border-default px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                暂停
              </button>
              <button
                type="button"
                disabled={actioning === c.taskId}
                onClick={() => {
                  setActioning(c.taskId);
                  void apiClient
                    .mutateContract(c.taskId, "resume")
                    .then(loadContracts)
                    .catch((e) => setError(e instanceof Error ? e.message : "恢复失败"))
                    .finally(() => setActioning(null));
                }}
                className="rounded border border-border-default px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                恢复
              </button>
              <button
                type="button"
                disabled={actioning === c.taskId}
                onClick={() => {
                  setActioning(c.taskId);
                  void apiClient
                    .mutateContract(c.taskId, "revoke")
                    .then(loadContracts)
                    .catch((e) => setError(e instanceof Error ? e.message : "撤销失败"))
                    .finally(() => setActioning(null));
                }}
                className="rounded border border-danger/40 px-2 py-1 text-xs text-danger disabled:cursor-not-allowed disabled:opacity-50"
              >
                撤销
              </button>
              <button
                type="button"
                disabled={actioning === c.taskId}
                onClick={() => {
                  setActioning(c.taskId);
                  const requestedTools = c.requestedTools.map((item) => ({ ...item, approvalRequired: !item.approvalRequired }));
                  void apiClient
                    .updateContract(c.taskId, { requestedTools })
                    .then(loadContracts)
                    .catch((e) => setError(e instanceof Error ? e.message : "更新 tools 失败"))
                    .finally(() => setActioning(null));
                }}
                className="rounded border border-border-default px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                切换审批要求
              </button>
            </div>
          </article>
        ))}
      </div>
      {filtered.length === 0 ? <div className="mt-3"><EmptyState title="当前分类无合约" /></div> : null}
    </section>
  );
}

export function EvolutionPage() {
  const [rows, setRows] = useState<Array<{
    timestamp: number;
    taskId: string;
    mission: string;
    toolCallsSummary: string;
    skillSuggestion: string;
    rollbackCheckpoint?: string;
    sessionId: string;
  }>>([]);
  useEffect(() => {
    void apiClient.listEvolution().then(setRows);
  }, []);
  return (
    <section className="space-y-2">
      {rows.map((row) => (
        <article key={row.taskId} className="rounded border border-border-default bg-bg-panel p-3 text-sm">
          <div className="font-semibold">{row.mission}</div>
          <div className="mt-1 text-xs text-fg-secondary">{row.toolCallsSummary}</div>
          <div className="mt-2 text-xs">
            <Link to={`/c/${row.sessionId}#task=${row.taskId}`} className="text-info hover:underline">
              回到会话
            </Link>
          </div>
        </article>
      ))}
    </section>
  );
}

export function MemoryPage() {
  const [keyword, setKeyword] = useState("");
  const [allRows, setAllRows] = useState<
    Array<{ id: string; category: string; content: string; sourceSessionId: string; createdAt: number }>
  >([]);
  useEffect(() => {
    void apiClient.listMemory().then(setAllRows);
  }, []);
  const rows = allRows.filter((item) => item.content.includes(keyword));
  return (
    <section>
      <input
        value={keyword}
        onChange={(e) => setKeyword(e.target.value)}
        placeholder="搜索记忆内容"
        className="mb-3 w-full rounded border border-border-default px-3 py-2 text-sm"
      />
      <div className="space-y-2">
        {rows.map((row) => (
          <article key={row.id} className="rounded border border-border-default bg-bg-panel p-3 text-sm">
            <div className="text-xs uppercase text-fg-secondary">{row.category}</div>
            <div>{row.content}</div>
            <Link to={`/c/${row.sourceSessionId}`} className="mt-1 inline-block text-xs text-info hover:underline">
              来源会话
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

export function SkillsPage() {
  const [rows, setRows] = useState<
    Array<{ name: string; description: string; path: string; createdAt: number; createdBy: string }>
  >([]);
  useEffect(() => {
    void apiClient.listSkills().then(setRows);
  }, []);
  const location = useLocation();
  const target = new URLSearchParams(location.search).get("skill");
  return (
    <section className="space-y-2">
      {rows.map((row) => (
        <article
          key={row.name}
          className={`rounded border bg-bg-panel p-3 text-sm ${target === row.name ? "border-accent" : "border-border-default"}`}
        >
          <div className="font-semibold">{row.name}</div>
          <div className="text-xs text-fg-secondary">{row.description}</div>
          <code className="mt-1 block text-xs">{row.path}</code>
        </article>
      ))}
    </section>
  );
}

export function AuditPage() {
  const [rows, setRows] = useState<AuditRecord[]>([]);
  const [approvalRows, setApprovalRows] = useState<
    Array<{ id: string; approvalId: string; sessionId: string; toolName: string; decision: string; actorUserId: string; ts: number }>
  >([]);
  useEffect(() => {
    void apiClient.listAudit().then(setRows);
    void apiClient.listApprovalHistory().then(setApprovalRows);
  }, []);
  const [decision, setDecision] = useState("all");
  const filtered = rows.filter((row) => decision === "all" || row.decision === decision);

  const onExport = () => {
    const csv = ["time,tool,decision,policy,taskId,actorUserId", ...filtered.map((r) => `${new Date(r.ts).toISOString()},${r.tool},${r.decision},${r.policy},${r.taskId},${r.actorUserId}`)].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "audit-export.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <select value={decision} onChange={(e) => setDecision(e.target.value)} className="rounded border border-border-default px-2 py-1 text-sm">
          <option value="all">全部</option>
          <option value="deny">deny</option>
          <option value="approval">approval</option>
          <option value="allow">allow</option>
        </select>
        <button type="button" className="rounded border border-border-default px-2 py-1 text-sm" onClick={onExport}>
          导出 CSV
        </button>
      </div>
      <table className="w-full overflow-hidden rounded border border-border-default bg-bg-panel text-left text-sm">
        <thead className="bg-slate-50 text-xs text-fg-secondary">
          <tr>
            <th className="px-2 py-1">时间</th>
            <th className="px-2 py-1">工具</th>
            <th className="px-2 py-1">决策</th>
            <th className="px-2 py-1">policy</th>
            <th className="px-2 py-1">taskId</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((row) => (
            <tr key={row.id} className="border-t border-border-default">
              <td className="px-2 py-1 text-xs">{new Date(row.ts).toLocaleString()}</td>
              <td className="px-2 py-1">{row.tool}</td>
              <td className="px-2 py-1">{row.decision}</td>
              <td className="px-2 py-1">{row.policy}</td>
              <td className="px-2 py-1">{row.taskId}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 rounded border border-border-default bg-bg-panel p-3">
        <div className="mb-2 text-sm font-semibold">审批历史</div>
        {approvalRows.length === 0 ? (
          <div className="text-xs text-fg-secondary">暂无审批记录</div>
        ) : (
          <div className="space-y-1 text-xs">
            {approvalRows.map((row) => (
              <div key={row.id} className="rounded border border-border-default px-2 py-1">
                {new Date(row.ts).toLocaleString()} · {row.toolName} · {row.decision} · {row.actorUserId}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

export function PreferencesPage() {
  const [policy, setPolicy] = useState<PolicyPack>("development");
  const [workspaceRoot, setWorkspaceRoot] = useState("/Users/shawn/Data/Kyberkit");
  const [permits, setPermits] = useState<
    Array<{ toolName: string; maxLevel: "L0" | "L1" | "L2" | "L3"; grantedAt: number; reason?: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadPreferences = useCallback(async () => {
    try {
      const prefs = await apiClient.getPreferences();
      setPolicy(prefs.policyPack as PolicyPack);
      setWorkspaceRoot(prefs.workspaceRoot);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "偏好加载失败");
    }
  }, []);

  const loadPermits = useCallback(async () => {
    try {
      setPermits(await apiClient.listPermits());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "授权加载失败");
    }
  }, []);

  useEffect(() => {
    void loadPreferences();
    void loadPermits();
  }, [loadPermits, loadPreferences]);

  useConsoleEvents((name) => {
    if (name === "preferences.updated") void loadPreferences();
    if (name === "permit.revoked") void loadPermits();
  });

  const onChange = (value: PolicyPack) => {
    setBusy(true);
    void apiClient
      .updatePreferences(value)
      .then((updated) => {
        setPolicy(updated.policyPack);
        setWorkspaceRoot(updated.workspaceRoot);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Policy 更新失败"))
      .finally(() => setBusy(false));
  };

  return (
    <section className="space-y-3">
      {error ? (
        <div className="rounded border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">{error}</div>
      ) : null}
      <div className="rounded border border-border-default bg-bg-panel p-3">
        <div className="text-sm font-semibold">Policy Pack</div>
        <select
          value={policy}
          disabled={busy}
          onChange={(e) => onChange(e.target.value as PolicyPack)}
          className="mt-2 rounded border border-border-default px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="development">development</option>
          <option value="balanced">balanced</option>
          <option value="conservative">conservative</option>
        </select>
      </div>
      <div className="rounded border border-border-default bg-bg-panel p-3">
        <div className="mb-2 text-sm font-semibold">持久授权</div>
        <div className="space-y-2">
          {permits.map((p) => (
            <div key={p.toolName} className="flex items-center justify-between rounded border border-border-default px-2 py-1 text-xs">
              <span>
                {p.toolName} · {p.maxLevel} · {new Date(p.grantedAt).toLocaleString()}
              </span>
              <button
                type="button"
                disabled={busy}
                className="text-danger disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => {
                  setBusy(true);
                  void apiClient
                    .revokePermit(p.toolName)
                    .then(() => loadPermits())
                    .catch((e) => setError(e instanceof Error ? e.message : "撤销授权失败"))
                    .finally(() => setBusy(false));
                }}
              >
                撤销
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded border border-warning/30 bg-warning/10 p-3 text-xs text-fg-secondary">
        调整 Policy Pack 后会影响后续审批阈值与合约执行策略，建议同步检查 Contracts 与审批历史。
      </div>
      <div className="rounded border border-border-default bg-bg-panel p-3 text-xs text-fg-secondary">
        工作区根路径: {workspaceRoot}（只读）
      </div>
    </section>
  );
}

function TabBar({
  tab,
  setTab,
  tabs,
}: {
  tab: string;
  setTab: (v: string) => void;
  tabs: [string, string][];
}) {
  return (
    <div className="flex gap-2 border-b border-border-default pb-2">
      {tabs.map(([value, label]) => (
        <button
          type="button"
          key={value}
          onClick={() => setTab(value)}
          className={`rounded px-2 py-1 text-sm ${tab === value ? "bg-accent text-white" : "bg-slate-100 text-fg-secondary"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
