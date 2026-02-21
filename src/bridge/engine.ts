import { AcpAgentClient } from "./agents/acp.js";
import { log } from "../shared/logging.js";
import { jsonRpcError, jsonRpcResult } from "../protocols/jsonrpc/response.js";
import { parseEnvelope, isRequest } from "../protocols/jsonrpc/validate.js";
import {
  createInMemorySessionStore,
  type SessionStore,
} from "../shared/session/index.js";
import { createHubLinkClient, type HubLinkClient } from "./hublink/client.js";
import { isKilled } from "./interceptors/killswitch.js";
import {
  createBridgeClient,
  type BridgeClient,
  type BridgeClientKind,
  type ClientAdapterContext,
} from "./clients/index.js";

export interface BridgeEngineOptions {
  agent: string;
  agentArgs?: string[];
  client: BridgeClientKind;
  hubUrl?: string;
  sessionStore?: SessionStore;
}

export class BridgeEngine {
  private readonly sessionStore: SessionStore;
  private readonly client: BridgeClient;
  private readonly localToAgentSession = new Map<string, string>();
  private acpClient: AcpAgentClient | null = null;
  private acpInitialized = false;
  private hubLink: HubLinkClient | null = null;

  constructor(private readonly opts: BridgeEngineOptions) {
    if (!opts.agent) {
      throw new Error("Agent command is required to start the bridge. Please set the --agent option.");
    }
    this.sessionStore = opts.sessionStore ?? createInMemorySessionStore();
    log.info(`Starting bridge: client=${opts.client}, agent=${opts.agent} ${opts.agentArgs?.join(" ") ?? ""}`);
    this.acpClient = new AcpAgentClient(opts.agent, opts.agentArgs ?? []);
    if (typeof opts.hubUrl === "string" && opts.hubUrl) {
      this.hubLink = createHubLinkClient(opts.hubUrl);
    }
    this.client = createBridgeClient(opts.client, this.getClientAdapterContext());
  }

  close(): void {
    this.acpClient?.close();
  }

  async startAgent(): Promise<void> {
    if (!this.acpClient) return;
    try {
      await this.ensureAcpInitialized();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Agent failed to start";
      throw new Error(message);
    }
  }

  private async ensureAcpInitialized(): Promise<void> {
    if (!this.acpClient || this.acpInitialized) return;
    await this.acpClient.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "meshaway", version: "0.1.0" },
    });
    this.acpInitialized = true;
  }

  private resolveAgentSessionId(localSessionId: string): string {
    return this.localToAgentSession.get(localSessionId) ?? localSessionId;
  }

  private ensureHubSession(localSessionId: string): void {
    this.sessionStore.ensureSession(localSessionId);
    this.hubLink?.reportSessionStart(localSessionId).catch(() => { });
  }

  private addFrameAndReport(sessionId: string, type: string, payload: unknown, redacted = true): void {
    const frame = this.sessionStore.addFrame(sessionId, type, payload, redacted);
    if (frame) this.hubLink?.reportFrame(sessionId, type, payload).catch(() => { });
  }

  private getClientAdapterContext(): ClientAdapterContext {
    return {
      acpClient: this.acpClient,
      ensureAcpInitialized: () => this.ensureAcpInitialized(),
      resolveAgentSessionId: (id) => this.resolveAgentSessionId(id),
      ensureHubSession: (id) => this.ensureHubSession(id),
      addFrameAndReport: (sid, type, payload, redacted) =>
        this.addFrameAndReport(sid, type, payload, redacted ?? true),
      isKilled: (id) => isKilled(id),
      updateSessionStatus: (id, status) => {
        this.sessionStore.updateSession(id, { status });
      },
      getLocalToAgentSession: () => this.localToAgentSession,
      setLocalToAgentSession: (localId, agentId) => this.localToAgentSession.set(localId, agentId),
    };
  }

  async handleIncoming(body: unknown): Promise<{ status: number; payload?: unknown }> {
    let envelope: ReturnType<typeof parseEnvelope>;
    try {
      envelope = parseEnvelope(body);
    } catch (err) {
      return {
        status: 400,
        payload: jsonRpcError(null, -32600, "Invalid request", err),
      };
    }

    if (!isRequest(envelope)) {
      return { status: 204 };
    }

    const reqId = envelope.id ?? null;
    if (reqId === null || (typeof reqId !== "string" && typeof reqId !== "number")) {
      return { status: 400, payload: jsonRpcError(null, -32600, "Invalid request id") };
    }

    const method = envelope.method;
    const params = envelope.params;

    try {
      if (method === "initialize") {
        if (this.acpClient) {
          try {
            await this.ensureAcpInitialized();
          } catch (err) {
            log.warn({ err }, "ACP agent initialize failed");
          }
        }
        return {
          status: 200,
          payload: jsonRpcResult(reqId, {
            protocolVersion: 1,
            serverInfo: { name: "meshaway", version: "0.1.0" },
          }),
        };
      }

      if (!this.client.canHandle(method)) {
        return {
          status: 200,
          payload: jsonRpcError(reqId, -32601, `Method not implemented: ${method}`),
        };
      }
      const response = await this.client.handle(reqId, method, params);
      return { status: 200, payload: response };
    } catch (err) {
      log.error({ err, method }, "Bridge request failed");
      const errWithCode = err as Error & { code?: number };
      return {
        status: 200,
        payload: jsonRpcError(
          reqId,
          typeof errWithCode.code === "number" ? errWithCode.code : -32000,
          "Bridge error",
          err
        ),
      };
    }
  }
}

