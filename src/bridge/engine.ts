import { BridgeAgent } from "./agents/base.js";
import { AcpAgentClient } from "./agents/acp.js";
import { log } from "../shared/logging.js";
import { jsonRpcError, jsonRpcResult } from "../protocols/jsonrpc/response.js";
import { parseEnvelope, isRequest } from "../protocols/jsonrpc/validate.js";
import {
  createInMemorySessionStore,
  createCompositeSessionStore,
  type SessionStore,
} from "../shared/session/index.js";
import { createHubLinkClient } from "./hublink/client.js";
import { createHubReplicaStore } from "./session/hub-replica-store.js";
import {
  createBridgeAdapter,
  type BridgeAdapter,
  type BridgeAdapterKind,
  type AdapterContext,
} from "./adaptors/index.js";

export interface BridgeEngineOptions {
  agent: string;
  agentArgs?: string[];
  adapter: BridgeAdapterKind;
  hubUrl?: string;
  sessionStore?: SessionStore;
}

export class BridgeEngine {
  private readonly agent: BridgeAgent;
  private readonly adapter: BridgeAdapter;
  private readonly sessionStore: SessionStore;

  private readonly localToAgentSession = new Map<string, string>();
  private agentInitialized = false;

  constructor(private readonly opts: BridgeEngineOptions) {
    if (!opts.agent) {
      throw new Error("Agent command is required to start the bridge. Please set the --agent option.");
    }
    const local = opts.sessionStore ?? createInMemorySessionStore();
    const hasHub = typeof opts.hubUrl === "string" && opts.hubUrl.length > 0;
    this.sessionStore = hasHub
      ? createCompositeSessionStore([local, createHubReplicaStore(createHubLinkClient(opts.hubUrl!))])
      : local;

    log.info(`Starting bridge: adapter=${opts.adapter}, agent=${opts.agent} ${opts.agentArgs?.join(" ") ?? ""}`);

    this.agent = new AcpAgentClient(opts.agent, opts.agentArgs ?? []);
    this.adapter = createBridgeAdapter(opts.adapter, this.getAdapterContext());
  }

  close(): void {
    this.agent?.close();
  }

  async startAgent(): Promise<void> {
    if (!this.agent || this.agentInitialized) return;
    try {
      await this.agent.request("initialize", {
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: "meshaway", version: "0.1.0" },
      });
      this.agentInitialized = true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Agent failed to start";
      throw new Error(message);
    }
  }

  private resolveAgentSessionId(localSessionId: string): string {
    return this.localToAgentSession.get(localSessionId) ?? localSessionId;
  }

  private getAdapterContext(): AdapterContext {
    const store = this.sessionStore;
    return {
      agent: this.agent,
      resolveAgentSessionId: (id) => this.resolveAgentSessionId(id),
      ensureSession: (id) => store.ensureSession(id),
      addFrame: (sessionId, type, payload, redacted) => store.addFrame(sessionId, type, payload, redacted ?? true),
      updateSessionStatus: (id, status) => store.updateSession(id, { status }),
      getLocalToAgentSession: () => this.localToAgentSession,
      setLocalToAgentSession: this.localToAgentSession.set,
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
        return {
          status: 200,
          payload: jsonRpcResult(reqId, {
            protocolVersion: 1,
            serverInfo: { name: "meshaway", version: "0.1.0" },
          }),
        };
      }

      if (!this.adapter.canHandle(method)) {
        return {
          status: 200,
          payload: jsonRpcError(reqId, -32601, `Method not implemented: ${method}`),
        };
      }
      const response = await this.adapter.handle(reqId, method, params);
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

