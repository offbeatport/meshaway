import { createInterface } from "node:readline";
import { UnifiedTranslator } from "../translator/index.js";
import { safeLog } from "../logging.js";
import type {
  ClientType,
  MeshMode,
  ObserverEvent,
  PermissionDecisionInput,
} from "../types.js";
import type { Provider } from "../types.js";
import { ObserverEventBus } from "../ui/events.js";
import { asRecord } from "./helpers.js";
import type { ObserverTrackingContext } from "./observer-tracking.js";
import { trackInbound, trackOutbound } from "./observer-tracking.js";
import {
  buildChildEnv,
  formatClientMessage,
  parseStdinChunk,
  parseStdinLineDelimited,
  spawnAgent as spawnAgentTransport,
  type StdinParseState,
} from "./transport.js";
import type { PermissionRequestEvent } from "../types.js";
import { createCopilotHandler, type ICopilotHandlerEngine } from "./copilot-handler.js";

export interface BridgeEngineOptions {
  mode: MeshMode;
  clientType: MeshMode;
  provider?: Provider;
  agentCommand: string;
  agentArgs: string[];
  cwd: string;
  envAllowlist?: string[];
  eventBus?: ObserverEventBus;
}

type PendingPermission = PermissionRequestEvent & { sessionId: string };

const FORWARD_RESPONSE_TIMEOUT_MS = 5_000;

export class BridgeEngine implements ICopilotHandlerEngine {
  readonly options: BridgeEngineOptions;
  readonly translator = new UnifiedTranslator();
  readonly eventBus?: ObserverEventBus;
  readonly pendingRequestIds = new Set<string | number>();
  readonly pendingPermissions = new Map<string, PendingPermission>();
  readonly copilotSessions = new Map<
    string,
    { createdAt: number; modifiedAt: number; summary?: string; events: Record<string, unknown>[] }
  >();
  lastCopilotSessionId: string | undefined = undefined;
  readonly acpIdToCopilotId = new Map<string | number, string | number>();
  readonly acpIdToSessionId = new Map<string | number, string>();
  responseBuffer = "";
  agentHandshakeSent = false;
  readonly forwardTimeouts = new Map<string | number, ReturnType<typeof setTimeout>>();
  readonly FORWARD_RESPONSE_TIMEOUT_MS = FORWARD_RESPONSE_TIMEOUT_MS;

  setLastCopilotSessionId(id: string | undefined): void {
    this.lastCopilotSessionId = id;
  }
  setResponseBuffer(s: string): void {
    this.responseBuffer = s;
  }
  setAgentHandshakeSent(v: boolean): void {
    this.agentHandshakeSent = v;
  }

  private child?: ReturnType<typeof spawnAgentTransport>;
  private detectedClientType?: ClientType;
  private readonly stdinState: StdinParseState = {
    frameBuffer: Buffer.alloc(0),
    lineBuffer: "",
    usesJsonRpcFraming: false,
  };
  private started = false;

  private readonly copilotHandler = createCopilotHandler(this);

  private get observerTrackingContext(): ObserverTrackingContext {
    return {
      eventBus: this.eventBus,
      pendingPermissions: this.pendingPermissions,
      getResponseBuffer: () => this.responseBuffer,
      setResponseBuffer: (s) => (this.responseBuffer = s),
      emitObserverEvent: (e) => this.eventBus?.publish(e),
    };
  }

  constructor(options: BridgeEngineOptions) {
    this.options = options;
    this.eventBus = options.eventBus;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    const env = buildChildEnv(this.options.envAllowlist);
    this.child = spawnAgentTransport(
      this.options.agentCommand,
      this.options.agentArgs,
      this.options.cwd,
      env,
    );
    this.wireStdin();
    this.wireChildStdout();
    this.wireChildStderr();
    this.wireChildLifecycle();
  }

  resolvePermission(input: PermissionDecisionInput): boolean {
    const pending = this.pendingPermissions.get(input.id);
    if (!pending) return false;
    this.pendingPermissions.delete(input.id);
    const acpMessages = this.translator.githubToAcp({
      jsonrpc: "2.0",
      id: input.id,
      method: "session/request_permission",
      params: {
        sessionId: pending.sessionId,
        permissionId: input.id,
        outcome: input.decision === "approved" ? "allow_once" : input.decision === "cancelled" ? "cancelled" : "deny",
      },
    });
    for (const message of acpMessages) this.writeToChild(message);
    this.eventBus?.publish({
      type: "permission_resolved",
      payload: { id: input.id, decision: input.decision, timestamp: Date.now() },
    });
    return true;
  }

  private wireStdin(): void {
    process.stdin.on("data", (chunk: Buffer | string) => {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      parseStdinChunk(data, this.stdinState, (payload) => this.handleInboundJson(payload));
      if (this.stdinState.usesJsonRpcFraming) return;
      parseStdinLineDelimited(data.toString("utf8"), this.stdinState, (line) =>
        this.handleInboundJson(line),
      );
    });
  }

  private wireChildStdout(): void {
    if (!this.child?.stdout) return;
    const rl = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        safeLog("Child emitted non-JSON stdout line", { line: trimmed });
        return;
      }
      const clientType = this.resolveCurrentClientType();
      const translated =
        clientType === "github" ? this.translator.acpToGithub(parsed) : this.translator.acpToClaude(parsed);
      for (const message of translated) {
        trackOutbound(this.observerTrackingContext, message, clientType);
        const outMsg = this.rewriteResponseIdForClient(message);
        this.writeClientMessage(outMsg);
      }
    });
  }

  private rewriteResponseIdForClient(message: unknown): unknown {
    const record = asRecord(message);
    const id = record.id;
    if (id === undefined || (typeof id !== "string" && typeof id !== "number")) return message;
    const hasResult = "result" in record && record.result !== undefined;
    const hasError = "error" in record && record.error !== undefined;
    if (!hasResult && !hasError) return message;
    const copilotId = this.acpIdToCopilotId.get(id);
    if (copilotId === undefined) return message;
    this.clearForwardTimeout(id);
    const sessionId = this.acpIdToSessionId.get(id);
    this.acpIdToCopilotId.delete(id);
    this.acpIdToSessionId.delete(id);
    this.pendingRequestIds.delete(id);
    if (sessionId && this.copilotSessions.has(sessionId)) {
      const content = this.responseBuffer || "[Agent response]";
      this.responseBuffer = "";
      const assistantEvent = this.copilotHandler.makeCopilotEvent("assistant.message", {
        messageId: `msg_${Date.now()}`,
        content,
      });
      const idleEvent = this.copilotHandler.makeCopilotEvent("session.idle", {}, true);
      this.copilotHandler.appendCopilotEvent(sessionId, assistantEvent);
      this.copilotHandler.sendSessionEventNotification(sessionId, assistantEvent);
      this.copilotHandler.appendCopilotEvent(sessionId, idleEvent);
      this.copilotHandler.sendSessionEventNotification(sessionId, idleEvent);
      this.copilotHandler.sendLifecycleNotification("session.idle", sessionId);
      this.copilotHandler.sendLifecycleNotification("session.updated", sessionId);
    }
    return { ...record, id: copilotId };
  }

  private wireChildStderr(): void {
    if (!this.child?.stderr) return;
    const rl = createInterface({ input: this.child.stderr, crlfDelay: Infinity });
    rl.on("line", (line) => safeLog("agent.stderr", { line }));
  }

  private wireChildLifecycle(): void {
    this.child?.on("close", (code, signal) => {
      if (code === 0) return;
      safeLog("Child agent exited unexpectedly", { code, signal });
      const message = `Child agent crashed (code: ${code ?? "null"}, signal: ${signal ?? "none"})`;
      const clientType = this.resolveCurrentClientType();
      for (const acpId of this.pendingRequestIds) {
        const clientId = this.acpIdToCopilotId.get(acpId) ?? acpId;
        this.acpIdToCopilotId.delete(acpId);
        this.writeClientMessage(this.translator.buildCrashResponse(clientType, clientId, message));
      }
      this.pendingRequestIds.clear();
    });
  }

  writeToChild(message: unknown, options?: { skipTracking?: boolean }): void {
    if (!this.child?.stdin) {
      safeLog("Cannot write to child, stdin unavailable");
      return;
    }
    const record = asRecord(message);
    if (
      !options?.skipTracking &&
      record.id !== undefined &&
      (typeof record.id === "string" || typeof record.id === "number")
    ) {
      this.pendingRequestIds.add(record.id);
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  writeClientMessage(message: unknown): void {
    process.stdout.write(
      formatClientMessage(message, this.stdinState.usesJsonRpcFraming),
    );
  }

  private resolveClientType(parsed: unknown): ClientType {
    if (this.options.clientType === "github" || this.options.mode === "github") {
      this.detectedClientType = "github";
      return "github";
    }
    if (this.options.clientType === "claude" || this.options.mode === "claude") {
      this.detectedClientType = "claude";
      return "claude";
    }
    if (this.detectedClientType) return this.detectedClientType;
    const asRec = typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : {};
    this.detectedClientType = asRec.jsonrpc === "2.0" ? "github" : "claude";
    return this.detectedClientType;
  }

  private resolveCurrentClientType(): ClientType {
    if (this.options.clientType === "github") return "github";
    if (this.options.clientType === "claude") return "claude";
    if (this.options.clientType === "auto" && this.options.provider === "gemini") return "claude";
    return this.detectedClientType ?? "github";
  }

  private clearForwardTimeout(acpRequestId: string | number): void {
    const handle = this.forwardTimeouts.get(acpRequestId);
    if (handle !== undefined) {
      clearTimeout(handle);
      this.forwardTimeouts.delete(acpRequestId);
    }
  }

  private handleInboundJson(raw: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      safeLog("Skipping non-JSON stdin payload");
      return;
    }
    const clientType = this.resolveClientType(parsed);
    if (clientType === "github" && this.copilotHandler.tryHandle(parsed)) return;
    const outbound =
      clientType === "github" ? this.translator.githubToAcp(parsed) : this.translator.claudeToAcp(parsed);
    for (const message of outbound) {
      trackInbound(this.observerTrackingContext, parsed, clientType);
      this.writeToChild(message);
    }
  }
}

