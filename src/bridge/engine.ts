import { BridgeAgent } from "./agents/base.js";
import { BridgeAcpAgent } from "./agents/acp.js";
import { log } from "../shared/logging.js";
import { jsonRpcError, jsonRpcResult } from "../protocols/jsonrpc/response.js";
import { parseEnvelope, isRequest } from "../protocols/jsonrpc/validate.js";
import { VERSION } from "../shared/constants.js";
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
import { acpSessionUpdateToSessionEvent } from "../protocols/copilot/acp-mapper.js";

/** Normalize session/update params to a flat record (supports nested Gemini-style { sessionId, update }). */
function sessionUpdateRecord(params: unknown): Record<string, unknown> | null {
  if (params == null || typeof params !== "object") return null;
  const record = params as Record<string, unknown>;
  const sessionId = record.sessionId;
  if (typeof sessionId !== "string") return null;
  const update = record.update;
  if (update != null && typeof update === "object") {
    return { sessionId, ...(update as Record<string, unknown>) };
  }
  return record;
}

export interface BridgeEngineOptions {
  agent: string;
  agentArgs?: string[];
  adapter: BridgeAdapterKind;
  hubUrl?: string;
  runnerSessionId?: string;
  sessionStore?: SessionStore;
  sendToClient?: (payload: unknown) => void;
  /** Send a JSON-RPC request to the client and wait for response (e.g. permission.request). */
  sendRequestToClient?: (method: string, params: unknown) => Promise<unknown>;
  /** For testing: use this agent instead of spawning a process. */
  testAgent?: BridgeAgent;
  /** For testing: use this adapter instead of createBridgeAdapter. */
  testAdapter?: BridgeAdapter;
}

export class BridgeEngine {
  private readonly agent: BridgeAgent;
  private readonly adapter: BridgeAdapter;
  private readonly sessionStore: SessionStore;

  private readonly localToAgentSession = new Map<string, string>();
  private agentInitialized = false;

  constructor(private readonly opts: BridgeEngineOptions) {
    if (!opts.agent && !opts.testAgent) {
      throw new Error("Agent command is required to start the bridge. Please set the --agent option.");
    }
    const local = opts.sessionStore ?? createInMemorySessionStore();
    const hasHub = typeof opts.hubUrl === "string" && opts.hubUrl.length > 0;
    this.sessionStore = hasHub
      ? createCompositeSessionStore([
        local,
        createHubReplicaStore(createHubLinkClient(opts.hubUrl!), {
          reportSessionId: opts.runnerSessionId,
        }),
      ])
      : local;

    this.agent = opts.testAgent ?? new BridgeAcpAgent(opts.agent!, opts.agentArgs ?? [], {
      onNotification: (method, params) => this.handleAgentNotification(method, params),
      onRequest: (method, id, params) => this.handleAgentRequest(method, id, params),
    });
    this.adapter = opts.testAdapter ?? createBridgeAdapter(opts.adapter, this.getAdapterContext());
  }

  private async handleAgentRequest(
    method: string,
    id: ReturnType<typeof parseEnvelope>["id"],
    params: unknown
  ): Promise<unknown> {
    if (method !== "session/request_permission") {
      throw new Error(`Unsupported agent request: ${method}`);
    }
    const sendRequestToClient = this.opts.sendRequestToClient;
    if (!sendRequestToClient) {
      return { outcome: "cancelled" as const };
    }
    const rec = params && typeof params === "object" ? (params as Record<string, unknown>) : {};
    const agentSessionId = typeof rec.sessionId === "string" ? rec.sessionId : "";
    const localSessionId = this.resolveLocalSessionId(agentSessionId) ?? agentSessionId;
    const toolCall = rec.toolCall && typeof rec.toolCall === "object" ? (rec.toolCall as Record<string, unknown>) : {};
    const options = Array.isArray(rec.options) ? rec.options : [];
    const copilotParams = {
      sessionId: localSessionId,
      permissionRequest: {
        toolCallId: toolCall.toolCallId,
        title: toolCall.title,
        kind: toolCall.kind,
        rawInput: toolCall.rawInput,
        options,
      },
    };
    try {
      const response = (await sendRequestToClient("permission.request", copilotParams)) as
        | { result?: { optionId?: string } }
        | undefined;
      const optionId = response?.result?.optionId;
      return { outcome: "selected" as const, optionId };
    } catch {
      return { outcome: "cancelled" as const };
    }
  }

  private resolveLocalSessionId(agentSessionId: string): string | undefined {
    for (const [localId, aId] of this.localToAgentSession) {
      if (aId === agentSessionId) return localId;
    }
    return undefined;
  }

  private handleAgentNotification(method: string, params: unknown): void {
    if (method !== "session/update") return;

    const record = sessionUpdateRecord(params);
    if (!record) return;

    const agentSessionId = record.sessionId as string;
    const localSessionId = this.resolveLocalSessionId(agentSessionId) ?? agentSessionId;
    this.sessionStore.ensureSession(localSessionId);
    this.sessionStore.addFrame(localSessionId, "acp.session/update", params, false);

    const sendToClient = this.opts.sendToClient;
    const event = sendToClient ? acpSessionUpdateToSessionEvent(record) : null;
    if (!sendToClient || !event) return;
    sendToClient({
      jsonrpc: "2.0",
      method: "session.event",
      params: { sessionId: localSessionId, event },
    });
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
        clientInfo: { name: "meshaway", version: VERSION },
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
      setLocalToAgentSession: (localId, agentId) => this.localToAgentSession.set(localId, agentId),
      sendToClient: this.opts.sendToClient,
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
            serverInfo: { name: "meshaway", version: VERSION },
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

