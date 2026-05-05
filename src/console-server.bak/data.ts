import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, dirname, extname, join } from "node:path";
import { Database } from "bun:sqlite";
import { parse, stringify } from "yaml";
import { resolveWorkspacePaths } from "../runtime/WorkspaceBootstrap.js";
import type { TaskPermissionContract } from "../permission/TaskPermissionContract.js";
import { WorkspaceGrowthStore } from "../observability/WorkspaceGrowthStore.js";
import type { PolicyPack } from "../permission/TaskPermissionContract.js";

interface SimpleAudit {
  id: string;
  ts: number;
  tool: string;
  decision: "allow" | "deny" | "approval";
  policy: "development" | "balanced" | "conservative";
  taskId: string;
  actorUserId: string;
  details: {
    effectivePermission: "allow" | "deny" | "needs_approval";
    approvalStatus: "not_required" | "required" | "approved" | "denied";
    policyDecision: { code: string; reason: string };
  };
}

const now = Date.now();
const PREFERENCES_FILE = "web-console-preferences.json";

type ContractMutation = "activate" | "pause" | "resume" | "revoke";

type PersistedPreferences = {
  policyPack?: PolicyPack;
};

const fallback = {
  sessions: [
    { id: "sess_001", workspace: "default", title: "周报自动生成", status: "running", updatedAt: now - 5 * 60_000 },
    { id: "sess_002", workspace: "default", title: "支付告警跟进", status: "needs_approval", updatedAt: now - 42 * 60_000 },
  ],
  messages: {
    sess_001: [
      { id: "m1", kind: "user", createdAt: now - 5 * 60_000, content: "帮我生成本周周报草稿，强调支付成功率变化。" },
      { id: "m2", kind: "assistant", createdAt: now - 4 * 60_000, content: "已开始汇总交易、告警与客服数据。" },
      {
        id: "m3",
        kind: "tool_call",
        createdAt: now - 3 * 60_000,
        toolName: "report.weekly.generate",
        args: '{"scope":"7d"}',
        result: '{"ok":true}',
        status: "success",
        audit: {
          effectivePermission: "allow",
          approvalStatus: "not_required",
          policyDecision: { code: "allow", reason: "工具在合约范围内且风险等级 L0" },
        },
      },
      {
        id: "m4",
        kind: "artifact_card",
        createdAt: now - 2 * 60_000,
        artifact: { artifactId: "art_001", path: "reports/weekly-2026w18.md", mimeType: "text/markdown", size: 18432 },
      },
      {
        id: "m5",
        kind: "artifact_card",
        createdAt: now - 90_000,
        artifact: { artifactId: "art_003", path: "reports/city-metrics.csv", mimeType: "text/csv", size: 2064 },
      },
    ],
    sess_002: [
      { id: "n1", kind: "approval_banner", createdAt: now - 30 * 60_000, toolName: "wecom.send_card" },
      {
        id: "n2",
        kind: "tool_call",
        createdAt: now - 28 * 60_000,
        toolName: "wecom.send_card",
        args: '{"to":"ops-group","title":"异常告警"}',
        status: "running",
        audit: {
          effectivePermission: "needs_approval",
          approvalStatus: "required",
          policyDecision: { code: "approval_required", reason: "L2 工具需要显式审批" },
        },
      },
      {
        id: "n3",
        kind: "artifact_card",
        createdAt: now - 25 * 60_000,
        artifact: { artifactId: "art_002", path: "reports/incident-preview.html", mimeType: "text/html", size: 9048 },
      },
    ],
  } as Record<string, unknown[]>,
  artifacts: {
    art_001: {
      mimeType: "text/markdown",
      name: "weekly-2026w18.md",
      content: "# 周报草稿\n\n- 支付成功率 99.2%（+0.4%）\n- 告警恢复时长 P95 下降到 8 分钟",
    },
    art_002: {
      mimeType: "text/html",
      name: "incident-preview.html",
      content: "<!doctype html><html><body><h2>Incident Preview</h2><p>Triggered by payment-fail-spike.</p></body></html>",
    },
    art_003: {
      mimeType: "text/csv",
      name: "city-metrics.csv",
      content: "city,success_rate,orders\nbeijing,0.992,1234\nshanghai,0.988,1094\nshenzhen,0.995,902",
    },
  } as Record<string, { mimeType: string; name: string; content: string }>,
  contracts: [
    {
      taskId: "daily_report",
      actorUserId: "shawn",
      contractType: "recurring",
      status: "active",
      policyPack: "development",
      requestedTools: [{ toolName: "report.daily.generate", maxLevel: "L0", approvalRequired: false }],
      recurring: { schedule: "0 1 * * *", expiresAt: "2026-06-01T00:00:00+08:00" },
      updatedAt: now - 60_000,
    },
    {
      taskId: "alert_followup",
      actorUserId: "shawn",
      contractType: "triggered",
      status: "paused",
      policyPack: "balanced",
      requestedTools: [{ toolName: "wecom.send_card", maxLevel: "L2", approvalRequired: true }],
      triggered: { source: "logs.alert", match: "payment-fail-spike", backoff: "5m" },
      updatedAt: now - 2 * 3_600_000,
    },
  ] as TaskPermissionContract[],
  evolution: [
    {
      timestamp: now - 6 * 3_600_000,
      taskId: "weekly_report",
      mission: "优化周报生成流程",
      toolCallsSummary: "read_file x2, report.generate x1",
      skillSuggestion: "weekly.personal.report",
      rollbackCheckpoint: "chkpt_1201",
      sessionId: "sess_001",
    },
  ],
  memory: [
    { id: "mem_1", category: "decision", content: "支付告警优先通过企微卡片通知", sourceSessionId: "sess_002", createdAt: now - 7 * 3_600_000 },
  ],
  skills: [
    { name: "weekly.personal.report", description: "汇总多源数据生成周报", path: "skills/weekly.personal.report/SKILL.md", createdAt: now - 10 * 86_400_000, createdBy: "LearningLoop" },
  ],
  audit: [
    {
      id: "a1",
      ts: now - 3 * 60_000,
      tool: "report.weekly.generate",
      decision: "allow",
      policy: "development",
      taskId: "weekly_report",
      actorUserId: "shawn",
      details: {
        effectivePermission: "allow",
        approvalStatus: "not_required",
        policyDecision: { code: "allow", reason: "L0 且命中合约" },
      },
    },
  ] as SimpleAudit[],
  growthSummary: { memories: 24, skills: 8, permits: 11 },
  growth7d: [12, 14, 13, 18, 20, 22, 24],
};

type SessionStatus = "running" | "paused" | "completed" | "needs_approval";
type SessionThread = { id: string; workspace: string; title: string; status: SessionStatus; updatedAt: number };
type SessionMessage = {
  id: string;
  kind: "user" | "assistant" | "tool_call" | "audit_row" | "approval_banner" | "artifact_card" | "system_note";
  createdAt: number;
  content?: string;
  toolName?: string;
  args?: string;
  result?: string;
  status?: "running" | "success" | "error";
  approvalId?: string;
  audit?: {
    effectivePermission: "allow" | "deny" | "needs_approval";
    approvalStatus: "not_required" | "required" | "approved" | "denied";
    policyDecision: { code: string; reason: string };
  };
  artifact?: { artifactId: string; path: string; mimeType: "text/markdown" | "text/html" | "text/csv"; size: number };
};
type ApprovalDecision = "approved" | "denied";
type ApprovalHistoryRecord = {
  id: string;
  approvalId: string;
  sessionId: string;
  toolName: string;
  decision: ApprovalDecision;
  actorUserId: string;
  ts: number;
  reason?: string;
};

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const runtimeState: {
  sessions: SessionThread[];
  messages: Record<string, SessionMessage[]>;
  artifacts: Record<string, { mimeType: string; name: string; content: string }>;
  contracts: TaskPermissionContract[];
  memory: Array<{ id: string; category: string; content: string; sourceSessionId: string; createdAt: number }>;
  skills: Array<{ name: string; description: string; path: string; createdAt: number; createdBy: string }>;
  audit: SimpleAudit[];
  growthSummary: { memories: number; skills: number; permits: number };
  growth7d: number[];
  approvalHistory: ApprovalHistoryRecord[];
} = {
  sessions: deepClone(fallback.sessions) as SessionThread[],
  messages: deepClone(fallback.messages) as Record<string, SessionMessage[]>,
  artifacts: deepClone(fallback.artifacts),
  contracts: deepClone(fallback.contracts),
  memory: deepClone(fallback.memory),
  skills: deepClone(fallback.skills),
  audit: deepClone(fallback.audit),
  growthSummary: deepClone(fallback.growthSummary),
  growth7d: deepClone(fallback.growth7d),
  approvalHistory: [],
};

function readContractsFromWorkspace(): TaskPermissionContract[] | null {
  const pathInfo = getPathInfo();
  const registryPath = join(pathInfo.userRoot, ".kyberkit", "contracts", "registry.json");
  if (!existsSync(registryPath)) return null;
  try {
    const raw = readFileSync(registryPath, "utf-8");
    const records = JSON.parse(raw) as TaskPermissionContract[];
    return Array.isArray(records) ? records : null;
  } catch {
    return null;
  }
}

function saveContractsToWorkspace(contracts: TaskPermissionContract[]): boolean {
  const pathInfo = getPathInfo();
  const registryPath = join(pathInfo.userRoot, ".kyberkit", "contracts", "registry.json");
  try {
    writeFileSync(registryPath, JSON.stringify(contracts, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

function getPathInfo() {
  return resolveWorkspacePaths({
    cwd: process.cwd(),
    userName: process.env.KYBER_USER_NAME ?? "default",
    workspaceId: process.env.KYBER_WORKSPACE_ID ?? "default",
    spacesRoot: process.env.KYBER_SPACES_ROOT,
  });
}

function listTrajectoryFiles(): Array<{ sessionId: string; sqlitePath: string; sessionPath: string | null; updatedAt: number }> {
  const runtimeDir = join(process.cwd(), ".kyberkit", "runtime");
  if (!existsSync(runtimeDir)) return [];
  const files = readdirSync(runtimeDir).filter((name) => name.endsWith(".trajectory.sqlite"));
  return files
    .map((name) => {
      const sessionId = name.replace(".trajectory.sqlite", "");
      const sqlitePath = join(runtimeDir, name);
      const sessionPathCandidate = join(runtimeDir, `${sessionId}.session.json`);
      return {
        sessionId,
        sqlitePath,
        sessionPath: existsSync(sessionPathCandidate) ? sessionPathCandidate : null,
        updatedAt: statSync(sqlitePath).mtimeMs,
      };
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function readSessionsFromTrajectory(): Array<{ id: string; workspace: string; title: string; status: string; updatedAt: number }> | null {
  const files = listTrajectoryFiles();
  if (files.length === 0) return null;
  return files.slice(0, 50).map((entry) => {
    let title = `会话 ${entry.sessionId.slice(0, 8)}`;
    let status = "completed";
    try {
      const db = new Database(entry.sqlitePath, { readonly: true });
      const lastTurn = db
        .prepare(
          "SELECT user_text_preview, stop_reason, ended_at, started_at, errors FROM turns ORDER BY started_at DESC LIMIT 1",
        )
        .get() as
        | {
            user_text_preview: string | null;
            stop_reason: string | null;
            ended_at: number | null;
            started_at: number;
            errors: number | null;
          }
        | undefined;
      if (lastTurn?.user_text_preview) title = lastTurn.user_text_preview;
      if (!lastTurn?.ended_at) status = "running";
      else if ((lastTurn.errors ?? 0) > 0 || lastTurn.stop_reason === "error") status = "paused";
      db.close();
    } catch {
      // keep fallback title/status
    }
    return { id: entry.sessionId, workspace: "default", title, status, updatedAt: entry.updatedAt };
  });
}

function readMessagesFromTrajectory(sessionId: string): unknown[] | null {
  const runtimeDir = join(process.cwd(), ".kyberkit", "runtime");
  const sqlitePath = join(runtimeDir, `${sessionId}.trajectory.sqlite`);
  if (!existsSync(sqlitePath)) return null;
  try {
    const db = new Database(sqlitePath, { readonly: true });
    const turns = db
      .prepare(
        "SELECT id, started_at, ended_at, user_text_preview, tool_calls, errors, stop_reason FROM turns ORDER BY started_at DESC LIMIT 12",
      )
      .all() as Array<{
      id: string;
      started_at: number;
      ended_at: number | null;
      user_text_preview: string | null;
      tool_calls: number | null;
      errors: number | null;
      stop_reason: string | null;
    }>;
    const stepRows = db
      .prepare(
        "SELECT turn_id, tool_name, ok, started_at, duration_ms FROM steps ORDER BY started_at DESC LIMIT 32",
      )
      .all() as Array<{
      turn_id: string;
      tool_name: string;
      ok: number | null;
      started_at: number;
      duration_ms: number | null;
    }>;
    db.close();

    const stepsByTurn = new Map<string, typeof stepRows>();
    for (const row of stepRows) {
      const bucket = stepsByTurn.get(row.turn_id) ?? [];
      bucket.push(row);
      stepsByTurn.set(row.turn_id, bucket);
    }

    const messages: unknown[] = [];
    turns
      .slice()
      .reverse()
      .forEach((turn, idx) => {
        messages.push({
          id: `${turn.id}:user`,
          kind: "user",
          createdAt: turn.started_at,
          content: turn.user_text_preview ?? "（无用户预览）",
        });
        const turnSteps = stepsByTurn.get(turn.id) ?? [];
        if (turnSteps[0]) {
          messages.push({
            id: `${turn.id}:tool`,
            kind: "tool_call",
            createdAt: turnSteps[0].started_at,
            toolName: turnSteps[0].tool_name,
            status: turnSteps[0].ok === 1 ? "success" : "error",
            result: `duration=${turnSteps[0].duration_ms ?? 0}ms`,
            args: "{}",
            audit: {
              effectivePermission: turnSteps[0].ok === 1 ? "allow" : "deny",
              approvalStatus: "not_required",
              policyDecision: { code: turnSteps[0].ok === 1 ? "allow" : "policy_restricted", reason: "from trajectory step" },
            },
          });
        }
        messages.push({
          id: `${turn.id}:assistant`,
          kind: "assistant",
          createdAt: turn.ended_at ?? turn.started_at,
          content: `已完成该轮执行（tools=${turn.tool_calls ?? 0}, errors=${turn.errors ?? 0}, stop=${turn.stop_reason ?? "unknown"}）。`,
        });
        if (idx === turns.length - 1) {
          messages.push({
            id: `${turn.id}:artifact`,
            kind: "artifact_card",
            createdAt: (turn.ended_at ?? turn.started_at) + 1,
            artifact: {
              artifactId: "art_001",
              path: "reports/weekly-2026w18.md",
              mimeType: "text/markdown",
              size: 18432,
            },
          });
        }
      });
    return messages;
  } catch {
    return null;
  }
}

function readAuditFromTrajectory(): SimpleAudit[] | null {
  const files = listTrajectoryFiles();
  if (files.length === 0) return null;
  const rows: SimpleAudit[] = [];
  for (const entry of files.slice(0, 10)) {
    try {
      const db = new Database(entry.sqlitePath, { readonly: true });
      const recent = db
        .prepare(
          "SELECT id, tool_name, started_at, ok FROM steps ORDER BY started_at DESC LIMIT 20",
        )
        .all() as Array<{ id: string; tool_name: string; started_at: number; ok: number | null }>;
      db.close();
      for (const row of recent) {
        rows.push({
          id: `${entry.sessionId}:${row.id}`,
          ts: row.started_at,
          tool: row.tool_name,
          decision: row.ok === 1 ? "allow" : "deny",
          policy: "development",
          taskId: entry.sessionId,
          actorUserId: process.env.KYBER_USER_NAME ?? "default",
          details: {
            effectivePermission: row.ok === 1 ? "allow" : "deny",
            approvalStatus: "not_required",
            policyDecision: { code: row.ok === 1 ? "allow" : "policy_restricted", reason: "derived from step ok flag" },
          },
        });
      }
    } catch {
      // ignore broken file
    }
  }
  return rows.length > 0 ? rows.sort((a, b) => b.ts - a.ts).slice(0, 200) : null;
}

function readPermitsFromWorkspace():
  | Array<{ toolName: string; maxLevel: "L0" | "L1" | "L2" | "L3"; grantedAt: number; reason?: string }>
  | null {
  const pathInfo = getPathInfo();
  const permitPath = join(pathInfo.userRoot, ".kyberkit", "permit.yaml");
  if (!existsSync(permitPath)) return null;
  try {
    const raw = readFileSync(permitPath, "utf-8");
    const doc = parse(raw) as { grants?: Array<{ toolName: string; maxLevel: "L0" | "L1" | "L2" | "L3"; grantedAt: number; reason?: string }> };
    return doc.grants ?? [];
  } catch {
    return null;
  }
}

function revokePersistentPermit(toolName: string): boolean {
  const pathInfo = getPathInfo();
  const permitPath = join(pathInfo.userRoot, ".kyberkit", "permit.yaml");
  if (!existsSync(permitPath)) return false;
  try {
    const raw = readFileSync(permitPath, "utf-8");
    const doc = (parse(raw) as { grants?: Array<{ toolName: string; maxLevel: "L0" | "L1" | "L2" | "L3"; grantedAt: number; reason?: string }> }) ?? {};
    const grants = Array.isArray(doc.grants) ? doc.grants : [];
    const next = grants.filter((grant) => grant.toolName !== toolName);
    if (next.length === grants.length) return false;
    writeFileSync(
      permitPath,
      stringify({
        version: 1,
        grants: next,
      }),
      "utf-8",
    );
    return true;
  } catch {
    return false;
  }
}

function readPreferencesFromWorkspace(): PersistedPreferences {
  const pathInfo = getPathInfo();
  const prefsPath = join(pathInfo.userRoot, ".kyberkit", PREFERENCES_FILE);
  if (!existsSync(prefsPath)) return {};
  try {
    const raw = readFileSync(prefsPath, "utf-8");
    const parsed = JSON.parse(raw) as PersistedPreferences;
    return parsed ?? {};
  } catch {
    return {};
  }
}

function writePreferencesToWorkspace(input: PersistedPreferences): boolean {
  const pathInfo = getPathInfo();
  const prefsPath = join(pathInfo.userRoot, ".kyberkit", PREFERENCES_FILE);
  try {
    mkdirSync(dirname(prefsPath), { recursive: true });
    writeFileSync(prefsPath, JSON.stringify(input, null, 2), "utf-8");
    return true;
  } catch {
    return false;
  }
}

function readGrowthSummaryFromWorkspace():
  | { memories: number; skills: number; permits: number }
  | null {
  const pathInfo = getPathInfo();
  const growthPath = join(pathInfo.userRoot, ".kyberkit", "growth.sqlite");
  if (!existsSync(growthPath)) return null;
  try {
    const store = new WorkspaceGrowthStore(growthPath);
    const summary = store.aggregateSince(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return summary;
  } catch {
    return null;
  }
}

function readEvolutionFromWorkspace(): unknown[] | null {
  const pathInfo = getPathInfo();
  const evoPath = join(pathInfo.userRoot, ".kyberkit", "evolution-changelog.md");
  if (!existsSync(evoPath)) return null;
  try {
    const raw = readFileSync(evoPath, "utf-8");
    const blocks = raw.split("## ").filter(Boolean).slice(-20).reverse();
    return blocks.map((b, idx) => {
      const [head] = b.split("\n", 1);
      return {
        timestamp: Date.parse(head.trim()) || now - idx * 60_000,
        taskId: `task_${idx + 1}`,
        mission: "由 changelog 解析",
        toolCallsSummary: "见 changelog",
        skillSuggestion: "n/a",
        rollbackCheckpoint: undefined,
        sessionId: "sess_001",
      };
    });
  } catch {
    return null;
  }
}

function readMemoryFromWorkspace():
  | Array<{ id: string; category: string; content: string; sourceSessionId: string; createdAt: number }>
  | null {
  const pathInfo = getPathInfo();
  const memoryPath = join(pathInfo.userRoot, ".kyberkit", "memory.json");
  if (!existsSync(memoryPath)) return null;
  try {
    const raw = readFileSync(memoryPath, "utf-8");
    const parsed = JSON.parse(raw) as Array<{
      id: string;
      category: string;
      content: string;
      sourceSessionId: string;
      createdAt: number;
    }>;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readSkillsFromWorkspace():
  | Array<{ name: string; description: string; path: string; createdAt: number; createdBy: string }>
  | null {
  const pathInfo = getPathInfo();
  const registryPath = join(pathInfo.userRoot, ".kyberkit", "skills", "registry.json");
  if (!existsSync(registryPath)) return null;
  try {
    const raw = readFileSync(registryPath, "utf-8");
    const parsed = JSON.parse(raw) as Array<{
      name: string;
      description: string;
      path: string;
      createdAt: number;
      createdBy?: string;
    }>;
    if (!Array.isArray(parsed)) return null;
    return parsed.map((item) => ({ ...item, createdBy: item.createdBy ?? "workspace" }));
  } catch {
    return null;
  }
}

function readGrowth7dFromWorkspace(): number[] | null {
  const pathInfo = getPathInfo();
  const growthPath = join(pathInfo.userRoot, ".kyberkit", "growth.sqlite");
  if (!existsSync(growthPath)) return null;
  try {
    const db = new Database(growthPath, { readonly: true });
    const rows = db
      .prepare("SELECT memories, skills, permits FROM daily_growth ORDER BY day DESC LIMIT 7")
      .all() as Array<{ memories: number; skills: number; permits: number }>;
    db.close();
    if (rows.length === 0) return null;
    return rows
      .slice()
      .reverse()
      .map((row) => row.memories + row.skills + row.permits);
  } catch {
    return null;
  }
}

function detectMimeType(path: string): "text/markdown" | "text/html" | "text/csv" | null {
  const ext = extname(path).toLowerCase();
  if (ext === ".md") return "text/markdown";
  if (ext === ".html" || ext === ".htm") return "text/html";
  if (ext === ".csv") return "text/csv";
  return null;
}

function readArtifactFromWorkspace(artifactId: string): { mimeType: string; name: string; content: string } | null {
  const pathInfo = getPathInfo();
  const artifactsDir = join(pathInfo.workspaceRoot, ".kyberkit", "artifacts");
  if (!existsSync(artifactsDir)) return null;
  try {
    const names = readdirSync(artifactsDir);
    const matched = names.find((name) => name.startsWith(`${artifactId}.`));
    if (!matched) return null;
    const mimeType = detectMimeType(matched);
    if (!mimeType) return null;
    const content = readFileSync(join(artifactsDir, matched), "utf-8");
    return { mimeType, name: matched, content };
  } catch {
    return null;
  }
}

function mergeBySessionId(
  primary: SessionThread[] | null,
  secondary: SessionThread[],
): SessionThread[] {
  const map = new Map<string, SessionThread>();
  for (const row of secondary) map.set(row.id, row);
  for (const row of primary ?? []) {
    const existing = map.get(row.id);
    map.set(row.id, existing ? { ...existing, ...row } : row);
  }
  return Array.from(map.values()).sort((a, b) => b.updatedAt - a.updatedAt);
}

function ensureRuntimeSession(sessionId: string): SessionThread {
  let thread = runtimeState.sessions.find((item) => item.id === sessionId);
  if (thread) return thread;
  thread = {
    id: sessionId,
    workspace: "default",
    title: `会话 ${sessionId.slice(0, 8)}`,
    status: "running",
    updatedAt: Date.now(),
  };
  runtimeState.sessions.unshift(thread);
  if (!runtimeState.messages[sessionId]) runtimeState.messages[sessionId] = [];
  return thread;
}

function mergedMessages(sessionId: string): SessionMessage[] {
  const trajectoryRows = readMessagesFromTrajectory(sessionId) as SessionMessage[] | null;
  const runtimeRows = runtimeState.messages[sessionId] ?? [];
  if (!trajectoryRows) return runtimeRows;
  const ids = new Set(trajectoryRows.map((row) => row.id));
  const appended = runtimeRows.filter((row) => !ids.has(row.id));
  return [...trajectoryRows, ...appended].sort((a, b) => a.createdAt - b.createdAt);
}

export const consoleData = {
  sessions: () => mergeBySessionId(readSessionsFromTrajectory() as SessionThread[] | null, runtimeState.sessions),
  messages: (sessionId: string) => mergedMessages(sessionId),
  artifact: (artifactId: string) =>
    readArtifactFromWorkspace(artifactId) ?? runtimeState.artifacts[artifactId] ?? null,
  contracts: () => readContractsFromWorkspace() ?? runtimeState.contracts,
  evolution: () => readEvolutionFromWorkspace() ?? fallback.evolution,
  memory: () => readMemoryFromWorkspace() ?? runtimeState.memory,
  skills: () => readSkillsFromWorkspace() ?? runtimeState.skills,
  audit: () => readAuditFromTrajectory() ?? runtimeState.audit,
  growthSummary: () => readGrowthSummaryFromWorkspace() ?? runtimeState.growthSummary,
  growth7d: () => readGrowth7dFromWorkspace() ?? runtimeState.growth7d,
  permits: () => readPermitsFromWorkspace() ?? [],
  mutateContract: (contractId: string, mutation: ContractMutation) => {
    const records = readContractsFromWorkspace();
    if (!records) {
      const found = runtimeState.contracts.find((contract) => contract.taskId === contractId);
      if (!found) return null;
      if (mutation === "activate" || mutation === "resume") found.status = "active";
      if (mutation === "pause") found.status = "paused";
      if (mutation === "revoke") found.status = "revoked";
      found.updatedAt = Date.now();
      return found;
    }
    const index = records.findIndex((contract) => contract.taskId === contractId);
    if (index < 0) return null;
    const existing = records[index];
    const nextStatus =
      mutation === "activate" || mutation === "resume"
        ? "active"
        : mutation === "pause"
          ? "paused"
          : "revoked";
    const updated: TaskPermissionContract = { ...existing, status: nextStatus, updatedAt: Date.now() };
    records[index] = updated;
    const ok = saveContractsToWorkspace(records);
    if (!ok) return null;
    return updated;
  },
  updatePolicyPack: (policyPack: PolicyPack) => {
    const current = readPreferencesFromWorkspace();
    const next = { ...current, policyPack };
    const saved = writePreferencesToWorkspace(next);
    if (!saved) return null;
    return next;
  },
  revokePermit: (toolName: string) => {
    const ok = revokePersistentPermit(toolName);
    if (!ok) {
      const index = runtimeState.audit.findIndex((row) => row.tool === toolName);
      if (index < 0) return null;
    }
    return { toolName };
  },
  createSession: () => {
    const id = `sess_${randomUUID().slice(0, 8)}`;
    const thread: SessionThread = {
      id,
      workspace: "default",
      title: "新会话",
      status: "running",
      updatedAt: Date.now(),
    };
    runtimeState.sessions.unshift(thread);
    runtimeState.messages[id] = [
      {
        id: `${id}:assistant:welcome`,
        kind: "assistant",
        createdAt: Date.now(),
        content: "你好，我已准备好开始执行。请描述目标，我会给出计划并执行。",
      },
    ];
    return thread;
  },
  sendMessage: (sessionId: string, content: string) => {
    const session = ensureRuntimeSession(sessionId);
    const ts = Date.now();
    const toolMessageId = `${sessionId}:tool:${randomUUID().slice(0, 6)}`;
    const approvalRequired = /审批|approve|授权|高风险|wecom/i.test(content);
    const messages = runtimeState.messages[sessionId] ?? [];
    messages.push({
      id: `${sessionId}:user:${randomUUID().slice(0, 6)}`,
      kind: "user",
      createdAt: ts,
      content,
    });
    if (approvalRequired) {
      const approvalId = `appr_${randomUUID().slice(0, 8)}`;
      messages.push({
        id: `${sessionId}:approval:${approvalId}`,
        kind: "approval_banner",
        approvalId,
        createdAt: ts + 1,
        toolName: "wecom.send_card",
      });
      messages.push({
        id: toolMessageId,
        kind: "tool_call",
        createdAt: ts + 2,
        toolName: "wecom.send_card",
        args: JSON.stringify({ from: "web-console", prompt: content }),
        status: "running",
        result: "等待审批结果...",
        approvalId,
        audit: {
          effectivePermission: "needs_approval",
          approvalStatus: "required",
          policyDecision: { code: "approval_required", reason: "L2 工具需要显式审批" },
        },
      });
      session.status = "needs_approval";
    } else {
      const artifactId = `art_${randomUUID().slice(0, 8)}`;
      runtimeState.artifacts[artifactId] = {
        mimeType: "text/markdown",
        name: `${artifactId}.md`,
        content: `# 执行结果\n\n${content}\n\n- 由 web-console 本地模拟执行生成。`,
      };
      messages.push({
        id: toolMessageId,
        kind: "tool_call",
        createdAt: ts + 1,
        toolName: "task.execute",
        args: JSON.stringify({ prompt: content }),
        status: "success",
        result: JSON.stringify({ ok: true, artifactId }),
        audit: {
          effectivePermission: "allow",
          approvalStatus: "not_required",
          policyDecision: { code: "allow", reason: "命中默认执行策略" },
        },
      });
      messages.push({
        id: `${sessionId}:assistant:${randomUUID().slice(0, 6)}`,
        kind: "assistant",
        createdAt: ts + 2,
        content: "任务已执行完成，已生成可预览制品。",
      });
      messages.push({
        id: `${sessionId}:artifact:${randomUUID().slice(0, 6)}`,
        kind: "artifact_card",
        createdAt: ts + 3,
        artifact: {
          artifactId,
          path: `artifacts/${artifactId}.md`,
          mimeType: "text/markdown",
          size: runtimeState.artifacts[artifactId].content.length,
        },
      });
      session.status = "completed";
    }
    session.updatedAt = ts;
    session.title = content.slice(0, 24) || "新任务";
    runtimeState.messages[sessionId] = messages;
    return { sessionId, ts, needsApproval: approvalRequired };
  },
  cancelSessionRun: (sessionId: string) => {
    const session = ensureRuntimeSession(sessionId);
    const messages = runtimeState.messages[sessionId] ?? [];
    messages.push({
      id: `${sessionId}:system:${randomUUID().slice(0, 6)}`,
      kind: "system_note",
      createdAt: Date.now(),
      content: "运行已取消。",
    });
    session.status = "paused";
    session.updatedAt = Date.now();
    return { sessionId, cancelled: true };
  },
  decideApproval: (approvalId: string, decision: ApprovalDecision, actorUserId: string) => {
    const ts = Date.now();
    for (const [sessionId, rows] of Object.entries(runtimeState.messages)) {
      const tool = rows.find((row) => row.kind === "tool_call" && row.approvalId === approvalId);
      if (!tool) continue;
      tool.status = decision === "approved" ? "success" : "error";
      tool.result = decision === "approved" ? "审批通过，继续执行。" : "审批拒绝，已终止执行。";
      if (tool.audit) {
        tool.audit.approvalStatus = decision;
        tool.audit.effectivePermission = decision === "approved" ? "allow" : "deny";
        tool.audit.policyDecision = {
          code: decision === "approved" ? "approved" : "approval_denied",
          reason: decision === "approved" ? "用户审批通过" : "用户拒绝审批",
        };
      }
      rows.push({
        id: `${sessionId}:assistant:${randomUUID().slice(0, 6)}`,
        kind: "assistant",
        createdAt: ts + 1,
        content: decision === "approved" ? "已继续执行并产出结果。" : "执行已按你的审批决策中止。",
      });
      const session = runtimeState.sessions.find((item) => item.id === sessionId);
      if (session) {
        session.status = decision === "approved" ? "completed" : "paused";
        session.updatedAt = ts;
      }
      const record: ApprovalHistoryRecord = {
        id: `apr_hist_${randomUUID().slice(0, 8)}`,
        approvalId,
        sessionId,
        toolName: tool.toolName ?? "unknown",
        decision,
        actorUserId,
        ts,
      };
      runtimeState.approvalHistory.unshift(record);
      runtimeState.audit.unshift({
        id: record.id,
        ts,
        tool: record.toolName,
        decision: decision === "approved" ? "allow" : "deny",
        policy: "balanced",
        taskId: sessionId,
        actorUserId,
        details: {
          effectivePermission: decision === "approved" ? "allow" : "deny",
          approvalStatus: decision,
          policyDecision: {
            code: decision === "approved" ? "approved" : "approval_denied",
            reason: decision === "approved" ? "用户审批通过" : "用户拒绝审批",
          },
        },
      });
      return record;
    }
    return null;
  },
  approvalHistory: () => runtimeState.approvalHistory,
  createContract: (input: Partial<TaskPermissionContract> & { taskId: string; actorUserId?: string }) => {
    const next: TaskPermissionContract = {
      taskId: input.taskId,
      actorUserId: input.actorUserId ?? process.env.KYBER_USER_NAME ?? "default",
      contractType: input.contractType ?? "ad_hoc",
      status: "draft",
      policyPack: input.policyPack ?? "development",
      requestedTools: input.requestedTools ?? [{ toolName: "write_file", maxLevel: "L1", approvalRequired: false }],
      updatedAt: Date.now(),
      createdAt: Date.now(),
      denyListVersion: "v1",
      requestedContext: [],
      effectivePermissionRule: "user_permission ∩ task_permission ∩ policy_constraint",
      ...(input.recurring ? { recurring: input.recurring } : {}),
      ...(input.triggered ? { triggered: input.triggered } : {}),
    };
    const records = readContractsFromWorkspace();
    if (records) {
      records.unshift(next);
      if (!saveContractsToWorkspace(records)) return null;
      return next;
    }
    runtimeState.contracts.unshift(next);
    return next;
  },
  updateContract: (contractId: string, patch: Partial<TaskPermissionContract>) => {
    const applyPatchTo = (records: TaskPermissionContract[]) => {
      const index = records.findIndex((item) => item.taskId === contractId);
      if (index < 0) return null;
      const current = records[index];
      const updated: TaskPermissionContract = {
        ...current,
        ...patch,
        taskId: current.taskId,
        updatedAt: Date.now(),
      };
      records[index] = updated;
      return updated;
    };
    const workspaceContracts = readContractsFromWorkspace();
    if (workspaceContracts) {
      const updated = applyPatchTo(workspaceContracts);
      if (!updated) return null;
      if (!saveContractsToWorkspace(workspaceContracts)) return null;
      return updated;
    }
    return applyPatchTo(runtimeState.contracts);
  },
  preferences: () => ({
    policyPack:
      readPreferencesFromWorkspace().policyPack ??
      (process.env.KYBER_POLICY_PACK as "development" | "balanced" | "conservative" | undefined) ??
      "development",
    workspaceRoot: basename(getPathInfo().workspaceRoot) ? getPathInfo().workspaceRoot : process.cwd(),
  }),
};
