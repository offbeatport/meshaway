import type { AcpAgentClient } from "../../acp-rpc-client.js";

/** Context the engine passes to each client adapter. */
export interface ClientAdapterContext {
  readonly acpClient: AcpAgentClient | null;
  ensureAcpInitialized(): Promise<void>;
  resolveAgentSessionId(localSessionId: string): string;
  ensureHubSession(localSessionId: string): void;
  addFrameAndReport(sessionId: string, type: string, payload: unknown, redacted?: boolean): void;
  isKilled(sessionId: string): boolean;
  updateSessionStatus(sessionId: string, status: "active" | "completed" | "killed"): void;
  getLocalToAgentSession(): Map<string, string>;
  setLocalToAgentSession(localId: string, agentId: string): void;
}
