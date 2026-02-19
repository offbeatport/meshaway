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
