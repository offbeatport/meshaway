import { isKilled } from "../interceptors/killswitch.js";
import type { AdapterContext } from "./context.js";
import type { BridgeResponse, JsonRpcId } from "./types.js";

/**
 * Abstract base for bridge adapters (ACP, Copilot, Claude, ...).
 * Subclasses declare supported methods and implement handle().
 */
export abstract class BridgeAdapter {
  constructor(protected readonly ctx: AdapterContext) {}

  /** Methods handled by this client adapter. */
  abstract supportedMethods(): readonly string[];

  /** Whether this client handles the given method. */
  canHandle(method: string): boolean {
    return this.supportedMethods().includes(method);
  }

  /** Handle the request and return a JSON-RPC response. */
  abstract handle(id: JsonRpcId, method: string, params: unknown): Promise<BridgeResponse>;

  protected async requestAcp(method: string, params: unknown): Promise<unknown> {
    if (!this.ctx.agent) {
      const err = new Error("Agent not configured") as Error & { code?: number };
      err.code = -32001;
      throw err;
    }
    return this.ctx.agent.request(method, params);
  }

  protected addFrame(sessionId: string, type: string, payload: unknown, redacted = true): void {
    this.ctx.addFrame(sessionId, type, payload, redacted);
  }

  protected ensureSession(sessionId: string): void {
    this.ctx.ensureSession(sessionId);
  }

  protected resolveAgentSessionId(localSessionId: string): string {
    return this.ctx.resolveAgentSessionId(localSessionId);
  }

  protected isSessionKilled(sessionId: string): boolean {
    return isKilled(sessionId);
  }

  protected updateSessionStatus(sessionId: string, status: "active" | "completed" | "killed"): void {
    this.ctx.updateSessionStatus(sessionId, status);
  }

  protected getLocalToAgentSession(): Map<string, string> {
    return this.ctx.getLocalToAgentSession();
  }

  protected setLocalToAgentSession(localId: string, agentId: string): void {
    this.ctx.setLocalToAgentSession(localId, agentId);
  }

  protected result(id: JsonRpcId, result: unknown): BridgeResponse {
    return { jsonrpc: "2.0", id, result };
  }

  protected error(id: JsonRpcId, code: number, message: string, data?: unknown): BridgeResponse {
    return { jsonrpc: "2.0", id, error: { code, message, data } };
  }
}
