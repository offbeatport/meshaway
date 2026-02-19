const API_BASE = "/api";

export interface Session {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: "active" | "completed" | "killed";
  frames: unknown[];
}

export interface Frame {
  id: string;
  sessionId: string;
  timestamp: number;
  type: string;
  payload: unknown;
  redacted?: boolean;
}

export async function fetchSessions(): Promise<Session[]> {
  const res = await fetch(`${API_BASE}/sessions`);
  if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchSession(id: string): Promise<Session | null> {
  const res = await fetch(`${API_BASE}/sessions/${id}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to fetch session: ${res.status}`);
  return res.json();
}

export async function fetchFrames(sessionId: string): Promise<Frame[]> {
  const res = await fetch(`${API_BASE}/sessions/${sessionId}/frames`);
  if (!res.ok) throw new Error(`Failed to fetch frames: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function killSession(id: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/admin/kill/${id}`, { method: "POST" });
  const data = await res.json();
  return data?.ok === true;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const res = await fetch("/health");
    return res.ok;
  } catch {
    return false;
  }
}

export interface HealthInfo {
  hub: boolean;
  backend: string;
  bridgeUrl: string;
}

export async function fetchHealthInfo(): Promise<HealthInfo> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`Failed to fetch health: ${res.status}`);
  return res.json();
}

export interface PendingApproval {
  key: string;
  sessionId: string;
  toolCallId: string;
  command?: string;
}

export async function fetchApprovals(): Promise<PendingApproval[]> {
  const res = await fetch(`${API_BASE}/approvals`);
  if (!res.ok) throw new Error(`Failed to fetch approvals: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

export async function resolveApproval(
  sessionId: string,
  toolCallId: string,
  decision: "approve" | "deny"
): Promise<boolean> {
  const res = await fetch(`${API_BASE}/admin/approve/${sessionId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toolCallId, decision }),
  });
  const data = await res.json();
  return data?.ok === true;
}

export interface RoutingRule {
  backend: string;
}

export async function fetchRoutingRules(): Promise<RoutingRule[]> {
  const res = await fetch(`${API_BASE}/routing/rules`);
  if (!res.ok) throw new Error(`Failed to fetch routing: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data?.rules) ? data.rules : [];
}

export async function setRoutingBackend(backend: string): Promise<boolean> {
  const res = await fetch(`${API_BASE}/routing/rules`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ backend }),
  });
  const data = await res.json();
  return data?.ok === true;
}

export interface PlaygroundSendParams {
  prompt: string;
  sessionId?: string;
  bridgeUrl?: string;
  faultLatency?: number;
  faultDrop?: boolean;
  faultError?: string;
}

export interface PlaygroundSendResult {
  jsonrpc: string;
  id: number;
  result?: { sessionId?: string; [key: string]: unknown };
  error?: { code: number; message: string; data?: unknown };
}

export async function sendPlaygroundPrompt(
  params: PlaygroundSendParams
): Promise<PlaygroundSendResult> {
  const res = await fetch(`${API_BASE}/playground/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Request failed: ${res.status}`);
  return data;
}

export interface PlaygroundRpcParams {
  method: string;
  params?: unknown;
  id?: number;
  bridgeUrl?: string;
  faultLatency?: number;
  faultDrop?: boolean;
  faultError?: string;
}

export async function sendPlaygroundRpc(
  params: PlaygroundRpcParams
): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE}/playground/rpc`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Request failed: ${res.status}`);
  return data;
}

export function getSessionExportUrl(sessionId: string): string {
  return `${API_BASE}/sessions/${sessionId}/export`;
}

export interface ReplayEntry {
  method: string;
  params?: unknown;
}

export async function replayPlayground(
  entries: ReplayEntry[],
  bridgeUrl?: string
): Promise<{ results: unknown[] }> {
  const res = await fetch(`${API_BASE}/playground/replay`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries, bridgeUrl }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Replay failed: ${res.status}`);
  return data;
}
