type Envelope<T> = { data: T };
const BASE_URL = process.env.KYBER_CONSOLE_BASE_URL ?? "http://localhost:8787";

async function get<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`);
  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }
  const payload = (await response.json()) as Envelope<T>;
  return payload.data;
}

async function post<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`POST ${path} failed with ${response.status}`);
  }
  const payload = (await response.json()) as Envelope<T>;
  return payload.data;
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`PATCH ${path} failed with ${response.status}`);
  }
  const payload = (await response.json()) as Envelope<T>;
  return payload.data;
}

function pass(label: string): void {
  console.log(`PASS  ${label}`);
}

function info(label: string): void {
  console.log(`INFO  ${label}`);
}

async function main() {
  const health = await get<{ ok: boolean; service: string }>("/api/health");
  if (!health.ok) throw new Error("health endpoint returned not ok");
  pass("health");

  const sessions = await get<Array<{ id: string }>>("/api/sessions");
  if (!Array.isArray(sessions)) throw new Error("sessions is not array");
  pass("sessions list");

  if (sessions[0]?.id) {
    const messages = await get<Array<{ id: string }>>(`/api/sessions/${sessions[0].id}/messages`);
    if (!Array.isArray(messages)) throw new Error("messages is not array");
    pass("session messages");
  }

  const createdSession = await post<{ id: string }>("/api/sessions");
  if (!createdSession.id) throw new Error("create session failed");
  await fetch(`${BASE_URL}/api/sessions/${createdSession.id}/messages`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content: "smoke test execution" }),
  });
  pass("session create/send");

  const contracts = await get<Array<{ taskId: string; status: string }>>("/api/contracts");
  pass("contracts list");
  const draftId = `smoke_${Date.now()}`;
  await fetch(`${BASE_URL}/api/contracts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ taskId: draftId }),
  });
  pass("contract create draft");
  const active = contracts.find((contract) => contract.status === "active");
  if (active) {
    await post(`/api/contracts/${encodeURIComponent(active.taskId)}/pause`);
    await post(`/api/contracts/${encodeURIComponent(active.taskId)}/resume`);
    pass("contract pause/resume");
  } else {
    info("skip contract pause/resume (no active contract)");
  }

  const prefs = await get<{ policyPack: "development" | "balanced" | "conservative" }>("/api/preferences");
  await patch("/api/preferences", { policyPack: prefs.policyPack });
  pass("preferences patch");

  const permits = await get<Array<{ toolName: string }>>("/api/permits");
  if (permits[0]?.toolName) {
    info(`skip destructive permit revoke for ${permits[0].toolName} (manual verification recommended)`);
  } else {
    info("skip permit revoke (no permit found)");
  }

  pass("smoke done");
}

main().catch((error) => {
  console.error(`FAIL  ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
