import type { AuditRecord, MemoryCategory, SessionMessage, SessionThread, TaskPermissionContract } from "./types";

const now = Date.now();

const threads: SessionThread[] = [
  { id: "sess_001", workspace: "default", title: "周报自动生成", status: "running", updatedAt: now - 5 * 60_000 },
  { id: "sess_002", workspace: "default", title: "支付告警跟进", status: "needs_approval", updatedAt: now - 42 * 60_000 },
  { id: "sess_003", workspace: "beiyizhuan", title: "站会准备", status: "completed", updatedAt: now - 4 * 3_600_000 },
];

const sessionMessages: Record<string, SessionMessage[]> = {
  sess_001: [
    { id: "m1", kind: "user", createdAt: now - 5 * 60_000, content: "帮我生成本周周报草稿，强调支付成功率变化。" },
    {
      id: "m2",
      kind: "assistant",
      createdAt: now - 4 * 60_000,
      content: "已开始汇总交易、告警与客服数据，接下来会输出 markdown 草稿。",
    },
    {
      id: "m3",
      kind: "tool_call",
      createdAt: now - 3 * 60_000,
      toolName: "report.weekly.generate",
      args: '{"scope":"7d","channels":["payment","logs","cs"]}',
      result: '{"ok":true,"rows":182}',
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
      artifact: {
        artifactId: "art_001",
        path: "reports/weekly-2026w18.md",
        mimeType: "text/markdown",
        size: 18432,
      },
    },
    {
      id: "m5",
      kind: "artifact_card",
      createdAt: now - 90_000,
      artifact: {
        artifactId: "art_003",
        path: "reports/city-metrics.csv",
        mimeType: "text/csv",
        size: 2064,
      },
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
      artifact: {
        artifactId: "art_002",
        path: "reports/incident-preview.html",
        mimeType: "text/html",
        size: 9048,
      },
    },
  ],
};

const markdownContent = `# 周报草稿\n\n## 本周重点\n- 支付成功率 99.2%（+0.4%）\n- 告警恢复时长 P95 下降到 8 分钟\n\n## 下周建议\n1. 继续压缩人工审批链路\n2. 优化触发式合约节流阈值`;

const htmlContent = `<!doctype html><html><body><h2>Incident Preview</h2><p>Triggered by payment-fail-spike.</p></body></html>`;
const csvContent = `city,success_rate,orders\nbeijing,0.992,1234\nshanghai,0.988,1094\nshenzhen,0.995,902`;

const contracts: TaskPermissionContract[] = [
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
  {
    taskId: "spec_draft",
    actorUserId: "shawn",
    contractType: "ad_hoc",
    status: "draft",
    policyPack: "development",
    requestedTools: [{ toolName: "write_file", maxLevel: "L1", approvalRequired: false }],
    updatedAt: now - 15 * 60_000,
  },
];

const auditRecords: AuditRecord[] = [
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
  {
    id: "a2",
    ts: now - 28 * 60_000,
    tool: "wecom.send_card",
    decision: "approval",
    policy: "balanced",
    taskId: "alert_followup",
    actorUserId: "shawn",
    details: {
      effectivePermission: "needs_approval",
      approvalStatus: "required",
      policyDecision: { code: "approval_required", reason: "L2 触发审批门槛" },
    },
  },
];

const memory = [
  { id: "mem_1", category: "decision" as MemoryCategory, content: "支付告警优先通过企微卡片通知", sourceSessionId: "sess_002", createdAt: now - 7 * 3_600_000 },
  { id: "mem_2", category: "pattern" as MemoryCategory, content: "每周五 17:00 生成个人周报草稿", sourceSessionId: "sess_001", createdAt: now - 24 * 3_600_000 },
];

const skills = [
  { name: "weekly.personal.report", description: "汇总多源数据生成周报", path: "skills/weekly.personal.report/SKILL.md", createdAt: now - 10 * 86_400_000, createdBy: "LearningLoop" },
  { name: "alert.monitor.followup", description: "告警触发后自动诊断", path: "skills/alert.monitor.followup/SKILL.md", createdAt: now - 4 * 86_400_000, createdBy: "user:/teach" },
];

const evolution = [
  { timestamp: now - 6 * 3_600_000, taskId: "weekly_report", mission: "优化周报生成流程", toolCallsSummary: "read_file x2, report.generate x1", skillSuggestion: "weekly.personal.report", rollbackCheckpoint: "chkpt_1201", sessionId: "sess_001" },
];

const permits = [
  { toolName: "write_file", maxLevel: "L1" as const, grantedAt: now - 60_000 },
  { toolName: "wecom.send_card", maxLevel: "L2" as const, grantedAt: now - 2 * 3_600_000 },
];
const approvalHistory: Array<{
  id: string;
  approvalId: string;
  sessionId: string;
  toolName: string;
  decision: "approved" | "denied";
  actorUserId: string;
  ts: number;
}> = [];

export const mockApi = {
  listSessions(): SessionThread[] {
    return threads;
  },
  getSessionMessages(sessionId: string): SessionMessage[] {
    return sessionMessages[sessionId] ?? [];
  },
  getArtifactContent(artifactId: string): { mimeType: string; name: string; content: string } | null {
    if (artifactId === "art_001") return { mimeType: "text/markdown", name: "weekly-2026w18.md", content: markdownContent };
    if (artifactId === "art_002") return { mimeType: "text/html", name: "incident-preview.html", content: htmlContent };
    if (artifactId === "art_003") return { mimeType: "text/csv", name: "city-metrics.csv", content: csvContent };
    return null;
  },
  listContracts(): TaskPermissionContract[] {
    return contracts;
  },
  listEvolution() {
    return evolution;
  },
  listMemory() {
    return memory;
  },
  listSkills() {
    return skills;
  },
  listAudit(): AuditRecord[] {
    return auditRecords;
  },
  aggregateGrowthSince(): { memories: number; skills: number; permits: number } {
    return { memories: 24, skills: 8, permits: 11 };
  },
  growth7d(): number[] {
    return [12, 14, 13, 18, 20, 22, 24];
  },
  listPermits() {
    return permits;
  },
  createSession() {
    const id = `sess_${Math.random().toString(16).slice(2, 8)}`;
    const session: SessionThread = { id, workspace: "default", title: "新会话", status: "running", updatedAt: Date.now() };
    threads.unshift(session);
    sessionMessages[id] = [
      { id: `${id}:welcome`, kind: "assistant", createdAt: Date.now(), content: "欢迎，输入任务后我会开始执行。" },
    ];
    return session;
  },
  sendSessionMessage(sessionId: string, content: string) {
    const bucket = sessionMessages[sessionId] ?? [];
    bucket.push({
      id: `${sessionId}:u:${Date.now()}`,
      kind: "user",
      createdAt: Date.now(),
      content,
    });
    const approvalId = `appr_${Math.random().toString(16).slice(2, 8)}`;
    if (/审批|approve|授权|wecom/i.test(content)) {
      bucket.push({
        id: `${sessionId}:banner:${Date.now()}`,
        kind: "approval_banner",
        createdAt: Date.now(),
        toolName: "wecom.send_card",
        approvalId,
      });
      bucket.push({
        id: `${sessionId}:tool:${Date.now()}`,
        kind: "tool_call",
        createdAt: Date.now(),
        toolName: "wecom.send_card",
        status: "running",
        result: "等待审批结果...",
        args: JSON.stringify({ content }),
        approvalId,
      });
      return { sessionId, ts: Date.now(), needsApproval: true };
    }
    bucket.push({
      id: `${sessionId}:a:${Date.now()}`,
      kind: "assistant",
      createdAt: Date.now(),
      content: "任务已执行完成。",
    });
    return { sessionId, ts: Date.now(), needsApproval: false };
  },
  cancelSessionRun(sessionId: string) {
    const bucket = sessionMessages[sessionId] ?? [];
    bucket.push({ id: `${sessionId}:cancel:${Date.now()}`, kind: "system_note", createdAt: Date.now(), content: "运行已取消。" });
    return { sessionId, cancelled: true };
  },
  decideApproval(approvalId: string, action: "approve" | "deny") {
    const decision = action === "approve" ? "approved" : "denied";
    for (const [sessionId, messages] of Object.entries(sessionMessages)) {
      const target = messages.find((row) => row.approvalId === approvalId && row.kind === "tool_call");
      if (!target) continue;
      target.status = action === "approve" ? "success" : "error";
      target.result = action === "approve" ? "审批通过，已继续执行。" : "审批拒绝，执行中止。";
      approvalHistory.unshift({
        id: `apr_${Date.now()}`,
        approvalId,
        sessionId,
        toolName: target.toolName ?? "unknown",
        decision,
        actorUserId: "mock-user",
        ts: Date.now(),
      });
      return { approvalId, decision, sessionId };
    }
    return { approvalId, decision, sessionId: "" };
  },
  listApprovalHistory() {
    return approvalHistory;
  },
  createContract(input: { taskId: string; contractType?: TaskPermissionContract["contractType"]; policyPack?: TaskPermissionContract["policyPack"] }) {
    const item: TaskPermissionContract = {
      taskId: input.taskId,
      actorUserId: "mock-user",
      contractType: input.contractType ?? "ad_hoc",
      status: "draft",
      policyPack: input.policyPack ?? "development",
      requestedTools: [{ toolName: "write_file", maxLevel: "L1", approvalRequired: false }],
      updatedAt: Date.now(),
    };
    contracts.unshift(item);
    return item;
  },
  updateContract(contractId: string, patch: { policyPack?: TaskPermissionContract["policyPack"]; requestedTools?: TaskPermissionContract["requestedTools"] }) {
    const target = contracts.find((contract) => contract.taskId === contractId);
    if (!target) throw new Error("contract not found");
    if (patch.policyPack) target.policyPack = patch.policyPack;
    if (patch.requestedTools) target.requestedTools = patch.requestedTools;
    target.updatedAt = Date.now();
    return target;
  },
};
