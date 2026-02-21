import type { ClientAdapterContext } from "./context.js";
import type { BridgeResponse, JsonRpcId } from "./types.js";

/**
 * Abstract base for client adapters (ACP, Copilot, Claude, ...).
 * Subclasses declare supported methods and implement handle().
 */
export abstract class BridgeClient {
  constructor(protected readonly ctx: ClientAdapterContext) {}

  /** Methods handled by this client adapter. */
  abstract supportedMethods(): readonly string[];

  /** Whether this client handles the given method. */
  canHandle(method: string): boolean {
    return this.supportedMethods().includes(method);
  }

  /** Handle the request and return a JSON-RPC response. */
  abstract handle(id: JsonRpcId, method: string, params: unknown): Promise<BridgeResponse>;

  protected async requestAcp(method: string, params: unknown): Promise<unknown> {
    if (!this.ctx.acpClient) {
      const err = new Error("ACP agent not configured") as Error & { code?: number };
      err.code = -32001;
      throw err;
    }
    await this.ctx.ensureAcpInitialized();
    return this.ctx.acpClient.request(method, params);
  }

  protected addFrame(sessionId: string, type: string, payload: unknown, redacted = true): void {
    this.ctx.addFrameAndReport(sessionId, type, payload, redacted);
  }

  protected ensureSession(sessionId: string): void {
    this.ctx.ensureHubSession(sessionId);
  }

  protected resolveAgentSessionId(localSessionId: string): string {
    return this.ctx.resolveAgentSessionId(localSessionId);
  }

  protected isSessionKilled(sessionId: string): boolean {
    return this.ctx.isKilled(sessionId);
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
