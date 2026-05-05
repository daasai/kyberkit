export type ContractType = "ad_hoc" | "recurring" | "triggered";
export type ContractStatus = "draft" | "active" | "paused" | "revoked" | "expired" | "completed";
export type PolicyPack = "development" | "balanced" | "conservative";
export type MemoryCategory = "preference" | "fact" | "decision" | "pattern";
export type Decision = "allow" | "deny" | "needs_approval";

export interface EffectivePermissionDecision {
  effectivePermission: Decision;
  approvalStatus: "not_required" | "required" | "approved" | "denied";
  policyDecision: {
    code: string;
    reason: string;
  };
}

export interface TaskPermissionContract {
  taskId: string;
  actorUserId: string;
  contractType: ContractType;
  status: ContractStatus;
  policyPack: PolicyPack;
  requestedTools: Array<{
    toolName: string;
    maxLevel: "L0" | "L1" | "L2" | "L3";
    approvalRequired: boolean;
  }>;
  recurring?: { schedule: string; expiresAt?: string };
  triggered?: { source: string; match: string; backoff?: string };
  updatedAt: number;
}

export interface SessionThread {
  id: string;
  workspace: string;
  title: string;
  status: "running" | "paused" | "completed" | "needs_approval";
  updatedAt: number;
}

export type MessageKind =
  | "user"
  | "assistant"
  | "tool_call"
  | "audit_row"
  | "approval_banner"
  | "artifact_card"
  | "system_note";

export interface SessionMessage {
  id: string;
  kind: MessageKind;
  createdAt: number;
  content?: string;
  toolName?: string;
  approvalId?: string;
  args?: string;
  result?: string;
  status?: "running" | "success" | "error";
  audit?: EffectivePermissionDecision;
  artifact?: {
    artifactId: string;
    path: string;
    mimeType: "text/markdown" | "text/html" | "text/csv" | "text/plain";
    size: number;
  };
}

export interface ApprovalHistoryRecord {
  id: string;
  approvalId: string;
  sessionId: string;
  toolName: string;
  decision: "approved" | "denied";
  actorUserId: string;
  ts: number;
}

export interface AuditRecord {
  id: string;
  ts: number;
  tool: string;
  decision: "allow" | "deny" | "approval";
  policy: PolicyPack;
  taskId: string;
  actorUserId: string;
  details: EffectivePermissionDecision;
}
