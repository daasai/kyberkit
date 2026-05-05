import { Settings, Search, Sparkles, PlayCircle, Plus } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { zhCN } from "../i18n/zh-CN";
import { fmtRelativeTime } from "../lib/utils";
import { StatusDot } from "./common";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../lib/apiClient";
import type { SessionThread } from "../mock/types";
import { useConsoleEvents } from "../hooks/useConsoleEvents";

export function TopBar() {
  return (
    <header className="flex h-12 items-center justify-between border-b border-border-default bg-bg-panel px-4">
      <div className="text-sm font-semibold">{zhCN.appName}</div>
      <div className="text-xs text-fg-secondary">workspace: default</div>
    </header>
  );
}

export function Sidebar() {
  const navigate = useNavigate();
  const [threads, setThreads] = useState<SessionThread[]>([]);
  const [keyword, setKeyword] = useState("");
  const [busy, setBusy] = useState(false);
  const loadThreads = useCallback(async () => {
    setThreads(await apiClient.listSessions());
  }, []);
  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);
  useConsoleEvents((name) => {
    if (name === "session.updated" || name === "contract.updated" || name === "approval.updated") {
      void loadThreads();
    }
  });
  const filtered = threads.filter((thread) => {
    if (!keyword.trim()) return true;
    const q = keyword.trim().toLowerCase();
    return thread.title.toLowerCase().includes(q) || thread.id.toLowerCase().includes(q);
  });
  return (
    <aside className="flex h-[calc(100vh-3rem)] w-[260px] flex-col border-r border-border-default bg-bg-panel">
      <div className="space-y-1 p-3">
        <SidebarItem
          icon={<Plus size={16} />}
          label={zhCN.sidebar.newSession}
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void apiClient
              .createSession()
              .then((session) => navigate(`/c/${session.id}`))
              .finally(() => setBusy(false));
          }}
        />
        <SidebarItem icon={<Search size={16} />} label={zhCN.sidebar.search} onClick={() => document.querySelector<HTMLInputElement>("[data-role='session-search']")?.focus()} />
        <SidebarItem icon={<Sparkles size={16} />} label={zhCN.sidebar.skills} onClick={() => navigate("/settings/skills")} />
        <SidebarItem icon={<PlayCircle size={16} />} label={zhCN.sidebar.automation} onClick={() => navigate("/settings/contracts")} />
      </div>
      <div className="border-t border-border-default p-3">
        <h3 className="mb-2 text-xs font-semibold text-fg-secondary">{zhCN.sidebar.history}</h3>
        <input
          data-role="session-search"
          className="mb-2 w-full rounded border border-border-default px-2 py-1 text-sm"
          placeholder="搜索标题 / session id"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <div className="space-y-1">
          {filtered.map((thread) => (
            <NavLink
              key={thread.id}
              to={`/c/${thread.id}`}
              className={({ isActive }) =>
                `block rounded px-2 py-1 text-xs ${isActive ? "bg-accent/10 text-accent" : "text-fg-secondary hover:bg-slate-100"}`
              }
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">{thread.title}</span>
                <StatusDot tone={thread.status === "running" ? "success" : thread.status === "needs_approval" ? "warning" : "muted"} />
              </div>
              <div>{fmtRelativeTime(thread.updatedAt)}</div>
            </NavLink>
          ))}
        </div>
      </div>
      <div className="mt-auto border-t border-border-default p-3">
        <NavLink to="/settings/contracts" className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-100">
          <Settings size={16} /> {zhCN.sidebar.settings}
        </NavLink>
      </div>
    </aside>
  );
}

function SidebarItem({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {label}
    </button>
  );
}

export function SettingsNav() {
  const items = [
    { path: "/settings/contracts", label: zhCN.settings.contracts },
    { path: "/settings/evolution", label: zhCN.settings.evolution },
    { path: "/settings/memory", label: zhCN.settings.memory },
    { path: "/settings/skills", label: zhCN.settings.skills },
    { path: "/settings/audit", label: zhCN.settings.audit },
    { path: "/settings/preferences", label: zhCN.settings.preferences },
  ];
  return (
    <nav className="w-56 border-r border-border-default bg-bg-panel p-3">
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `mb-1 block rounded px-2 py-1.5 text-sm ${isActive ? "bg-accent/10 text-accent" : "text-fg-secondary hover:bg-slate-100"}`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <TopBar />
      <div className="flex">
        <Sidebar />
        <div className="min-h-[calc(100vh-3rem)] flex-1">{children}</div>
      </div>
    </div>
  );
}
