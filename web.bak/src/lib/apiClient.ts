import { mockApi } from "../mock/api";
import type { PolicyPack, TaskPermissionContract } from "../mock/types";

type ApiEnvelope<T> = { data: T };
type ApiErrorEnvelope = {
  error?: {
    code?: string;
    message?: string;
    retryable?: boolean;
  };
};

const FAIL_FAST = import.meta.env.VITE_WEB_FAIL_FAST !== "false";
const ALLOW_MOCK_FALLBACK =
  !FAIL_FAST &&
  import.meta.env.DEV &&
  import.meta.env.VITE_WEB_ALLOW_MOCK_FALLBACK === "true";

export class ApiError extends Error {
  status: number;
  code: string;
  retryable: boolean;

  constructor(message: string, input: { status: number; code: string; retryable: boolean }) {
    super(message);
    this.status = input.status;
    this.code = input.code;
    this.retryable = input.retryable;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorEnvelope | null;
    throw new ApiError(payload?.error?.message ?? `Request failed: ${response.status} ${path}`, {
      status: response.status,
      code: payload?.error?.code ?? "unknown_error",
      retryable: payload?.error?.retryable ?? false,
    });
  }
  const payload = (await response.json()) as ApiEnvelope<T>;
  return payload.data;
}

async function withFallback<T>(primary: () => Promise<T>, fallback: () => T): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    if (ALLOW_MOCK_FALLBACK) {
      return fallback();
    }
    throw error;
  }
}

type PermitLevel = "L0" | "L1" | "L2" | "L3";

type PermitItem = { toolName: string; maxLevel: PermitLevel; grantedAt: number; reason?: string };
type RequestedTool = { toolName: string; maxLevel: PermitLevel; approvalRequired: boolean };

export const apiClient = {
  async listSessions() {
    return withFallback(() => requestJson<ReturnType<typeof mockApi.listSessions>>("/api/sessions"), () => mockApi.listSessions());
  },
  async getSessionMessages(sessionId: string) {
    return withFallback(
      () => requestJson<ReturnType<typeof mockApi.getSessionMessages>>(`/api/sessions/${sessionId}/messages`),
      () => mockApi.getSessionMessages(sessionId),
    );
  },
  async getArtifactContent(artifactId: string) {
    return withFallback(
      () => requestJson<Exclude<ReturnType<typeof mockApi.getArtifactContent>, null>>(`/api/artifacts/${artifactId}`),
      () => mockApi.getArtifactContent(artifactId),
    );
  },
  async listContracts() {
    return withFallback(() => requestJson<ReturnType<typeof mockApi.listContracts>>("/api/contracts"), () => mockApi.listContracts());
  },
  async listEvolution() {
    return withFallback(() => requestJson<ReturnType<typeof mockApi.listEvolution>>("/api/evolution"), () => mockApi.listEvolution());
  },
  async listMemory() {
    return withFallback(() => requestJson<ReturnType<typeof mockApi.listMemory>>("/api/memory"), () => mockApi.listMemory());
  },
  async listSkills() {
    return withFallback(() => requestJson<ReturnType<typeof mockApi.listSkills>>("/api/skills"), () => mockApi.listSkills());
  },
  async listAudit() {
    return withFallback(() => requestJson<ReturnType<typeof mockApi.listAudit>>("/api/audit"), () => mockApi.listAudit());
  },
  async listPermits() {
    return withFallback(
      () => requestJson<PermitItem[]>("/api/permits"),
      () => mockApi.listPermits(),
    );
  },
  async getPreferences() {
    return withFallback(
      () =>
        requestJson<{ policyPack: "development" | "balanced" | "conservative"; workspaceRoot: string }>(
          "/api/preferences",
        ),
      () => ({ policyPack: "development", workspaceRoot: "/Users/shawn/Data/Kyberkit" }),
    );
  },
  async aggregateGrowthSince() {
    return withFallback(
      () => requestJson<ReturnType<typeof mockApi.aggregateGrowthSince>>("/api/growth/summary"),
      () => mockApi.aggregateGrowthSince(),
    );
  },
  async growth7d() {
    return withFallback(() => requestJson<ReturnType<typeof mockApi.growth7d>>("/api/growth/7d"), () => mockApi.growth7d());
  },
  async mutateContract(contractId: string, action: "activate" | "pause" | "resume" | "revoke") {
    return requestJson(`/api/contracts/${encodeURIComponent(contractId)}/${action}`, { method: "POST" });
  },
  async updatePreferences(policyPack: PolicyPack) {
    return requestJson<{ policyPack: PolicyPack; workspaceRoot: string }>("/api/preferences", {
      method: "PATCH",
      body: JSON.stringify({ policyPack }),
    });
  },
  async revokePermit(toolName: string) {
    return requestJson<{ toolName: string }>(`/api/permits/${encodeURIComponent(toolName)}`, {
      method: "DELETE",
    });
  },
  async createSession() {
    return withFallback(
      () =>
        requestJson<{ id: string; workspace: string; title: string; status: string; updatedAt: number }>(
          "/api/sessions",
          { method: "POST" },
        ),
      () => mockApi.createSession(),
    );
  },
  async sendSessionMessage(sessionId: string, content: string) {
    return withFallback(
      () =>
        requestJson<{ sessionId: string; ts: number; needsApproval: boolean }>(
          `/api/sessions/${encodeURIComponent(sessionId)}/messages`,
          {
            method: "POST",
            body: JSON.stringify({ content }),
          },
        ),
      () => mockApi.sendSessionMessage(sessionId, content),
    );
  },
  async cancelSessionRun(sessionId: string) {
    return withFallback(
      () =>
        requestJson<{ sessionId: string; cancelled: boolean }>(`/api/sessions/${encodeURIComponent(sessionId)}/cancel`, {
          method: "POST",
        }),
      () => mockApi.cancelSessionRun(sessionId),
    );
  },
  async decideApproval(approvalId: string, action: "approve" | "deny") {
    return withFallback(
      () =>
        requestJson<{ approvalId: string; decision: "approved" | "denied"; sessionId: string }>(
          `/api/approvals/${encodeURIComponent(approvalId)}/${action}`,
          { method: "POST" },
        ),
      () => mockApi.decideApproval(approvalId, action),
    );
  },
  async listApprovalHistory() {
    return withFallback(
      () =>
        requestJson<
          Array<{
            id: string;
            approvalId: string;
            sessionId: string;
            toolName: string;
            decision: "approved" | "denied";
            actorUserId: string;
            ts: number;
          }>
        >("/api/approvals/history"),
      () => mockApi.listApprovalHistory(),
    );
  },
  async createContract(input: {
    taskId: string;
    actorUserId?: string;
    contractType?: TaskPermissionContract["contractType"];
    policyPack?: PolicyPack;
  }) {
    return withFallback(
      () =>
        requestJson<TaskPermissionContract>("/api/contracts", {
          method: "POST",
          body: JSON.stringify(input),
        }),
      () => mockApi.createContract(input),
    );
  },
  async updateContract(contractId: string, patch: { policyPack?: PolicyPack; requestedTools?: RequestedTool[] }) {
    return withFallback(
      () =>
        requestJson<TaskPermissionContract>(`/api/contracts/${encodeURIComponent(contractId)}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        }),
      () => mockApi.updateContract(contractId, patch),
    );
  },
};
