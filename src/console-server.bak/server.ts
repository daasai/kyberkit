import { consoleData } from "./data.js";
import type { PolicyPack } from "../permission/TaskPermissionContract.js";

const PORT = Number(process.env.KYBER_CONSOLE_PORT ?? "8787");
const SSE_EVENT_NAMES = [
  "connected",
  "heartbeat",
  "contract.updated",
  "preferences.updated",
  "permit.revoked",
  "audit.appended",
  "session.updated",
  "approval.updated",
] as const;
type SseEventName = (typeof SSE_EVENT_NAMES)[number];

type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    retryable: boolean;
    details?: unknown;
  };
};

const sseClients = new Set<ReadableStreamDefaultController<Uint8Array>>();

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(init?.headers ?? {}),
    },
  });
}

function notFound(): Response {
  return errorJson(404, "not_found", "Requested endpoint was not found.", false);
}

function errorJson(status: number, code: string, message: string, retryable: boolean, details?: unknown): Response {
  const payload: ApiErrorBody = {
    error: { code, message, retryable, details },
  };
  return json(payload, { status });
}

function ok(data: unknown): Response {
  return json({ data });
}

function withCors(res: Response): Response {
  const headers = new Headers(res.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET,POST,PATCH,DELETE,OPTIONS");
  headers.set("access-control-allow-headers", "content-type");
  return new Response(res.body, { status: res.status, headers });
}

function publish(event: SseEventName, data: unknown): void {
  const encoder = new TextEncoder();
  const chunk = encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  for (const client of sseClients) {
    try {
      client.enqueue(chunk);
    } catch {
      sseClients.delete(client);
    }
  }
}

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    return body ?? {};
  } catch {
    return {};
  }
}

function sse(): Response {
  const stream = new ReadableStream({
    start(controller) {
      sseClients.add(controller);
      const encoder = new TextEncoder();
      let closed = false;
      const sendSelf = (event: SseEventName, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
          sseClients.delete(controller);
        }
      };

      sendSelf("connected", { ts: Date.now() });
      const timer = setInterval(() => {
        sendSelf("heartbeat", { ts: Date.now(), event: "contract.run.due" });
      }, 3000);
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        sseClients.delete(controller);
        try {
          controller.close();
        } catch {
          // ignore repeated close
        }
      };
      // @ts-expect-error Bun extension for cleanup
      controller.signal?.addEventListener?.("abort", close);
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    if (req.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));
    const url = new URL(req.url);
    const path = url.pathname;

    if (path === "/api/health") return withCors(ok({ ok: true, service: "kyber-console-api" }));
    if (req.method === "GET" && path === "/api/sessions") return withCors(ok(consoleData.sessions()));
    if (req.method === "POST" && path === "/api/sessions") {
      const created = consoleData.createSession();
      publish("session.updated", { ts: Date.now(), sessionId: created.id, reason: "created" });
      return withCors(ok(created));
    }
    if (path.startsWith("/api/sessions/") && path.endsWith("/messages")) {
      const sessionId = path.split("/")[3] ?? "";
      if (req.method === "POST") {
        const body = await parseBody(req);
        const content = typeof body.content === "string" ? body.content.trim() : "";
        if (!content) return withCors(errorJson(400, "invalid_content", "message content is required.", false));
        const result = consoleData.sendMessage(sessionId, content);
        if (!result) return withCors(errorJson(404, "session_not_found", "Session not found.", false));
        publish("session.updated", { ts: Date.now(), sessionId, reason: "message_appended" });
        if (result.needsApproval) {
          publish("audit.appended", { ts: Date.now(), sessionId, decision: "approval" });
        } else {
          publish("audit.appended", { ts: Date.now(), sessionId, decision: "allow" });
        }
        return withCors(ok(result));
      }
      return withCors(ok(consoleData.messages(sessionId)));
    }
    if (req.method === "POST" && path.startsWith("/api/sessions/") && path.endsWith("/cancel")) {
      const sessionId = path.split("/")[3] ?? "";
      const result = consoleData.cancelSessionRun(sessionId);
      if (!result) return withCors(errorJson(404, "session_not_found", "Session not found.", false));
      publish("session.updated", { ts: Date.now(), sessionId, reason: "cancelled" });
      return withCors(ok(result));
    }
    if (path.startsWith("/api/artifacts/")) {
      const artifactId = path.split("/")[3] ?? "";
      const artifact = consoleData.artifact(artifactId);
      if (!artifact) return withCors(notFound());
      return withCors(ok(artifact));
    }

    if (req.method === "POST" && path === "/api/contracts") {
      const body = await parseBody(req);
      const taskId = typeof body.taskId === "string" ? body.taskId.trim() : "";
      if (!taskId) return withCors(errorJson(400, "invalid_task_id", "taskId is required.", false));
      const created = consoleData.createContract({
        taskId,
        actorUserId: typeof body.actorUserId === "string" ? body.actorUserId : undefined,
        contractType:
          body.contractType === "ad_hoc" || body.contractType === "recurring" || body.contractType === "triggered"
            ? body.contractType
            : undefined,
        policyPack:
          body.policyPack === "development" || body.policyPack === "balanced" || body.policyPack === "conservative"
            ? body.policyPack
            : undefined,
      });
      if (!created) return withCors(errorJson(500, "contract_create_failed", "Failed to create contract.", true));
      publish("contract.updated", { ts: Date.now(), contractId: created.taskId, status: created.status });
      return withCors(ok(created));
    }
    if (req.method === "POST" && path.startsWith("/api/contracts/")) {
      const parts = path.split("/");
      const contractId = parts[3] ?? "";
      const action = parts[4] ?? "";
      if (!contractId || !action) return withCors(notFound());
      if (!["activate", "pause", "resume", "revoke"].includes(action)) {
        return withCors(errorJson(400, "invalid_contract_action", "Unsupported contract action.", false));
      }
      const updated = consoleData.mutateContract(contractId, action as "activate" | "pause" | "resume" | "revoke");
      if (!updated) return withCors(errorJson(404, "contract_not_found", "Contract not found.", false));
      publish("contract.updated", { ts: Date.now(), contractId: updated.taskId, status: updated.status });
      publish("audit.appended", {
        ts: Date.now(),
        contractId: updated.taskId,
        action,
      });
      return withCors(ok(updated));
    }
    if (req.method === "PATCH" && path.startsWith("/api/contracts/")) {
      const contractId = path.split("/")[3] ?? "";
      const body = await parseBody(req);
      const updated = consoleData.updateContract(contractId, {
        policyPack:
          body.policyPack === "development" || body.policyPack === "balanced" || body.policyPack === "conservative"
            ? body.policyPack
            : undefined,
        requestedTools: Array.isArray(body.requestedTools)
          ? (body.requestedTools as Array<{ toolName: string; maxLevel: "L0" | "L1" | "L2" | "L3"; approvalRequired: boolean }>)
          : undefined,
      });
      if (!updated) return withCors(errorJson(404, "contract_not_found", "Contract not found.", false));
      publish("contract.updated", { ts: Date.now(), contractId: updated.taskId, status: updated.status });
      return withCors(ok(updated));
    }

    if (req.method === "POST" && path.startsWith("/api/approvals/")) {
      const parts = path.split("/");
      const approvalId = parts[3] ?? "";
      const action = parts[4] ?? "";
      if (!approvalId || (action !== "approve" && action !== "deny")) {
        return withCors(errorJson(400, "invalid_approval_action", "Unsupported approval action.", false));
      }
      const result = consoleData.decideApproval(
        approvalId,
        action === "approve" ? "approved" : "denied",
        process.env.KYBER_USER_NAME ?? "default",
      );
      if (!result) return withCors(errorJson(404, "approval_not_found", "Approval record not found.", false));
      publish("approval.updated", { ts: Date.now(), approvalId, decision: result.decision });
      publish("session.updated", { ts: Date.now(), sessionId: result.sessionId, reason: "approval_decision" });
      publish("audit.appended", { ts: Date.now(), sessionId: result.sessionId, decision: result.decision });
      return withCors(ok(result));
    }
    if (path === "/api/approvals/history") return withCors(ok(consoleData.approvalHistory()));

    if (req.method === "PATCH" && path === "/api/preferences") {
      const body = await parseBody(req);
      const policyPack = body.policyPack;
      if (policyPack !== "development" && policyPack !== "balanced" && policyPack !== "conservative") {
        return withCors(errorJson(400, "invalid_policy_pack", "policyPack must be development|balanced|conservative.", false));
      }
      const updated = consoleData.updatePolicyPack(policyPack as PolicyPack);
      if (!updated) return withCors(errorJson(500, "preferences_update_failed", "Failed to persist preferences.", true));
      publish("preferences.updated", { ts: Date.now(), policyPack: updated.policyPack });
      return withCors(ok(consoleData.preferences()));
    }

    if (req.method === "DELETE" && path.startsWith("/api/permits/")) {
      const toolName = decodeURIComponent(path.split("/")[3] ?? "");
      if (!toolName) return withCors(errorJson(400, "invalid_tool_name", "Tool name is required.", false));
      const result = consoleData.revokePermit(toolName);
      if (!result) return withCors(errorJson(404, "permit_not_found", "Permit not found.", false));
      publish("permit.revoked", { ts: Date.now(), toolName: result.toolName });
      publish("session.updated", { ts: Date.now(), reason: "permit_changed" });
      return withCors(ok(result));
    }

    if (path === "/api/contracts") return withCors(ok(consoleData.contracts()));
    if (path === "/api/evolution") return withCors(ok(consoleData.evolution()));
    if (path === "/api/memory") return withCors(ok(consoleData.memory()));
    if (path === "/api/skills") return withCors(ok(consoleData.skills()));
    if (path === "/api/audit") return withCors(ok(consoleData.audit()));
    if (path === "/api/growth/summary") return withCors(ok(consoleData.growthSummary()));
    if (path === "/api/growth/7d") return withCors(ok(consoleData.growth7d()));
    if (path === "/api/permits") return withCors(ok(consoleData.permits()));
    if (path === "/api/preferences") return withCors(ok(consoleData.preferences()));
    if (path === "/api/events/stream") return withCors(sse());
    return withCors(notFound());
  },
});

console.log(`[kyber-console-api] listening on http://localhost:${server.port}`);
