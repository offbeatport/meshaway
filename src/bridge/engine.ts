import { createAcpStdioAdapter, type AcpStdioAdapter } from "../adapters/acp/stdio.js";
import { parseBackendSpec } from "./router.js";
import { genId } from "../shared/ids.js";
import { getLogger } from "../shared/logging.js";
import { parseEnvelope, isRequest } from "../protocols/jsonrpc/validate.js";
import {
  AcpInitializeParamsSchema,
  AcpNewSessionParamsSchema,
  AcpPromptParamsSchema,
  AcpSessionCancelParamsSchema,
  AcpRequestPermissionParamsSchema,
  AcpRequestSchema,
} from "../protocols/acp/types.js";
import { CopilotPromptParamsSchema } from "../protocols/copilot/types.js";
import { sessionStore } from "../hub/store/memory.js";
import { createHubLinkClient, type HubLinkClient } from "./hublink/client.js";
import { isKilled } from "./interceptors/killswitch.js";
import { redactPayload } from "./interceptors/redaction.js";
import { type } from "arktype";

type JsonRpcId = string | number;

type BridgeResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | { jsonrpc: "2.0"; id: JsonRpcId | null; error: { code: number; message: string; data?: unknown } };

export interface BridgeEngineOptions {
  backend?: string;
  hubUrl?: string;
}

function parseCommand(commandLine: string): { command: string; args: string[] } {
  const parts = commandLine.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    throw new Error("ACP backend command is empty");
  }
  return { command: parts[0], args: parts.slice(1) };
}

function assertSchema<T>(schema: (value: unknown) => T, params: unknown, context: string): T {
  const out = schema(params);
  if (out instanceof type.errors) {
    const err = out as unknown as { summary: string };
    throw new Error(`Invalid ${context}: ${err.summary}`);
  }
  return out as T;
}

class AcpRpcClient {
  private adapter: AcpStdioAdapter;
  private nextId = 1;
  private pending = new Map<
    JsonRpcId,
    { resolve: (value: unknown) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();

  constructor(commandSpec: string) {
    const { command, args } = parseCommand(commandSpec);
    this.adapter = createAcpStdioAdapter(command, args);
    this.adapter.onLine((line) => this.onLine(line));
  }

  private onLine(line: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(line) as unknown;
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    const rec = msg as Record<string, unknown>;
    const id = rec.id;
    if (id === undefined || id === null) return;
    if (typeof id !== "string" && typeof id !== "number") return;
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    if (rec.error && typeof rec.error === "object") {
      const err = rec.error as Record<string, unknown>;
      pending.reject(new Error(String(err.message ?? "ACP backend error")));
      return;
    }
    pending.resolve(rec.result);
  }

  async request(method: string, params: unknown, timeoutMs = 60000): Promise<unknown> {
    const id = this.nextId++;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ACP request timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    this.adapter.write(JSON.stringify(payload));
    return promise;
  }

  close(): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("ACP client closed"));
      this.pending.delete(id);
    }
    this.adapter.close();
  }
}

export class BridgeEngine {
  private readonly backendSpec: ReturnType<typeof parseBackendSpec>;
  private readonly logger = getLogger();
  private readonly localToBackendSession = new Map<string, string>();
  private acpClient: AcpRpcClient | null = null;
  private acpInitialized = false;
  private hubLink: HubLinkClient | null = null;

  constructor(private readonly options: BridgeEngineOptions) {
    this.backendSpec = this.options.backend
      ? parseBackendSpec(this.options.backend)
      : null;
    if (this.backendSpec?.type === "acp") {
      this.acpClient = new AcpRpcClient(this.backendSpec.value);
    }
    if (typeof this.options.hubUrl === "string" && this.options.hubUrl) {
      this.hubLink = createHubLinkClient(this.options.hubUrl);
    }
  }

  close(): void {
    this.acpClient?.close();
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

  private resolveBackendSessionId(localSessionId: string): string {
    return this.localToBackendSession.get(localSessionId) ?? localSessionId;
  }

  private ensureHubSession(localSessionId: string): void {
    sessionStore.ensureSession(localSessionId);
    this.hubLink?.reportSessionStart(localSessionId).catch(() => {});
  }

  private addFrameAndReport(sessionId: string, type: string, payload: unknown, redacted = true): void {
    const frame = sessionStore.addFrame(sessionId, type, payload, redacted);
    if (frame) this.hubLink?.reportFrame(sessionId, type, payload).catch(() => {});
  }

  private async handleCopilotPrompt(id: JsonRpcId, params: unknown): Promise<BridgeResponse> {
    const parsed = assertSchema(CopilotPromptParamsSchema, params, "copilot prompt params");
    const localSessionId = parsed.sessionId ?? genId("sess");
    this.ensureHubSession(localSessionId);
    if (isKilled(localSessionId)) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32000, message: "Session killed" },
      };
    }

    const promptText =
      typeof parsed.prompt === "string"
        ? parsed.prompt
        : JSON.stringify(parsed.context ?? []);

    this.addFrameAndReport(localSessionId, "copilot.prompt", redactPayload(parsed), true);

    if (this.backendSpec?.type === "acp" && this.acpClient) {
      await this.ensureAcpInitialized();
      if (!this.localToBackendSession.has(localSessionId)) {
        const newSessionResult = (await this.acpClient.request("session/new", {
          cwd: process.cwd(),
          mcpServers: [],
        })) as Record<string, unknown> | undefined;
        const backendSessionId =
          typeof newSessionResult?.sessionId === "string"
            ? newSessionResult.sessionId
            : localSessionId;
        this.localToBackendSession.set(localSessionId, backendSessionId);
      }
      const backendSessionId = this.resolveBackendSessionId(localSessionId);
      const result = await this.acpClient.request("session/prompt", {
        sessionId: backendSessionId,
        prompt: [{ type: "text", text: promptText }],
      });
      this.addFrameAndReport(localSessionId, "acp.session/prompt.result", redactPayload(result), true);
      return {
        jsonrpc: "2.0",
        id,
        result: {
          sessionId: localSessionId,
          ...(typeof result === "object" && result ? (result as Record<string, unknown>) : { result }),
        },
      };
    }

    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32001, message: "No backend configured" },
    };
  }

  private async handleAcpRequest(id: JsonRpcId, method: string, params: unknown): Promise<BridgeResponse> {
    if (!this.acpClient) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32001, message: "ACP backend not configured" },
      };
    }
    await this.ensureAcpInitialized();

    if (method === "initialize") {
      const valid = assertSchema(AcpInitializeParamsSchema, params, "acp initialize params");
      const result = await this.acpClient.request("initialize", valid);
      return { jsonrpc: "2.0", id, result };
    }

    if (method === "session/new") {
      const valid = assertSchema(AcpNewSessionParamsSchema, params, "acp session/new params");
      const result = (await this.acpClient.request("session/new", valid)) as Record<string, unknown>;
      const backendSessionId =
        typeof result?.sessionId === "string" ? result.sessionId : genId("sess");
      this.localToBackendSession.set(backendSessionId, backendSessionId);
      this.ensureHubSession(backendSessionId);
      this.addFrameAndReport(backendSessionId, "acp.session/new", redactPayload(valid), true);
      return { jsonrpc: "2.0", id, result };
    }

    if (method === "session/prompt") {
      const valid = assertSchema(AcpPromptParamsSchema, params, "acp session/prompt params");
      const localSessionId = valid.sessionId;
      if (isKilled(localSessionId)) {
        return { jsonrpc: "2.0", id, error: { code: -32000, message: "Session killed" } };
      }
      this.ensureHubSession(localSessionId);
      const backendSessionId = this.resolveBackendSessionId(localSessionId);
      const payload = { ...valid, sessionId: backendSessionId };
      const result = await this.acpClient.request("session/prompt", payload);
      this.addFrameAndReport(localSessionId, "acp.session/prompt", redactPayload(payload), true);
      this.addFrameAndReport(localSessionId, "acp.session/prompt.result", redactPayload(result), true);
      return { jsonrpc: "2.0", id, result };
    }

    if (method === "session/cancel") {
      const valid = assertSchema(AcpSessionCancelParamsSchema, params, "acp session/cancel params");
      const backendSessionId = this.resolveBackendSessionId(valid.sessionId);
      const result = await this.acpClient.request("session/cancel", {
        ...valid,
        sessionId: backendSessionId,
      });
      sessionStore.updateSession(valid.sessionId, { status: "completed" });
      this.addFrameAndReport(valid.sessionId, "acp.session/cancel", redactPayload(valid), true);
      return { jsonrpc: "2.0", id, result };
    }

    if (method === "session/request_permission") {
      const valid = assertSchema(
        AcpRequestPermissionParamsSchema,
        params,
        "acp session/request_permission params"
      );
      const toolCall = valid.toolCall as Record<string, unknown>;
      const toolCallId =
        typeof toolCall.id === "string" ? toolCall.id : genId("toolcall");
      this.addFrameAndReport(valid.sessionId, "acp.session/request_permission", redactPayload(valid), true);
      const approved = true; // Auto-approve: approvals UI removed
      return {
        jsonrpc: "2.0",
        id,
        result: {
          decision: approved ? "approve" : "deny",
          approved,
          toolCallId,
        },
      };
    }

    return {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Method not implemented: ${method}` },
    };
  }

  async handleIncoming(body: unknown): Promise<{ status: number; payload?: unknown }> {
    let envelope: ReturnType<typeof parseEnvelope>;
    try {
      envelope = parseEnvelope(body);
    } catch (err) {
      return {
        status: 400,
        payload: {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: err instanceof Error ? err.message : "Invalid request" },
        },
      };
    }

    if (!isRequest(envelope)) {
      return { status: 204 };
    }

    const reqId = envelope.id ?? null;
    if (reqId === null || (typeof reqId !== "string" && typeof reqId !== "number")) {
      return {
        status: 400,
        payload: {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "Invalid request id" },
        },
      };
    }

    const method = envelope.method;
    const params = envelope.params;

    try {
      if (method === "initialize") {
        if (this.acpClient) {
          try {
            await this.ensureAcpInitialized();
          } catch (err) {
            this.logger.warn({ err }, "ACP backend initialize failed");
          }
        }
        return {
          status: 200,
          payload: {
            jsonrpc: "2.0",
            id: reqId,
            result: {
              protocolVersion: 1,
              serverInfo: { name: "meshaway", version: "0.1.0" },
            },
          },
        };
      }

      const isAcpMethod =
        method === "session/new" ||
        method === "session/prompt" ||
        method === "session/cancel" ||
        method === "session/request_permission";

      if (isAcpMethod) {
        const response = await this.handleAcpRequest(reqId, method, params);
        return { status: 200, payload: response };
      }

      if (method === "prompt") {
        const response = await this.handleCopilotPrompt(reqId, params);
        return { status: 200, payload: response };
      }

      if (method === "cancel") {
        const rec = (params ?? {}) as Record<string, unknown>;
        const sessionId =
          typeof rec.sessionId === "string" ? rec.sessionId : undefined;
        if (sessionId) {
          sessionStore.updateSession(sessionId, { status: "completed" });
        }
        return { status: 200, payload: { jsonrpc: "2.0", id: reqId, result: { ok: true } } };
      }

      return {
        status: 200,
        payload: {
          jsonrpc: "2.0",
          id: reqId,
          error: { code: -32601, message: `Method not implemented: ${method}` },
        },
      };
    } catch (err) {
      this.logger.error({ err, method }, "Bridge request failed");
      return {
        status: 200,
        payload: {
          jsonrpc: "2.0",
          id: reqId,
          error: { code: -32000, message: err instanceof Error ? err.message : "Bridge error" },
        },
      };
    }
  }
}

