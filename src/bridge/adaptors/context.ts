import type { BridgeAgent } from "../agents/base.js";

/** Context the engine passes to each bridge adapter. */
export interface AdapterContext {
  readonly agent: BridgeAgent;
  resolveAgentSessionId(localSessionId: string): string;
  ensureSession(localSessionId: string): void;
  addFrame(sessionId: string, type: string, payload: unknown, redacted?: boolean): void;
  updateSessionStatus(sessionId: string, status: "active" | "completed" | "killed"): void;
  getLocalToAgentSession(): Map<string, string>;
  setLocalToAgentSession(localId: string, agentId: string): void;
  /** Optional: send a JSON-RPC notification to the client (e.g. session.event). */
  sendToClient?(payload: unknown): void;
}
