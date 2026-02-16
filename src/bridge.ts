import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { UnifiedTranslator } from "./mapper.js";
import { safeLog } from "./logging.js";
import type {
  ActionStatus,
  ClientType,
  MeshMode,
  ObserverEvent,
  PermissionDecision,
  PermissionDecisionInput,
  PermissionRequestEvent,
} from "./types.js";
import { ObserverEventBus } from "./ui/events.js";

export interface BridgeEngineOptions {
  mode: MeshMode;
  clientType: MeshMode;
  agentCommand: string;
  agentArgs: string[];
  cwd: string;
  envAllowlist?: string[];
  eventBus?: ObserverEventBus;
}

type PendingPermission = PermissionRequestEvent & { sessionId: string };

export class BridgeEngine {
  private readonly translator = new UnifiedTranslator();
  private readonly eventBus?: ObserverEventBus;
  private readonly pendingRequestIds = new Set<string | number>();
  private readonly pendingPermissions = new Map<string, PendingPermission>();
  private readonly copilotSessions = new Map<
    string,
    { createdAt: number; modifiedAt: number; summary?: string; events: Record<string, unknown>[] }
  >();
  private lastCopilotSessionId?: string;
  private child?: ChildProcessWithoutNullStreams;
  private detectedClientType?: ClientType;
  private stdinLineBuffer = "";
  private stdinFrameBuffer = Buffer.alloc(0);
  private usesJsonRpcFraming = false;
  private started = false;

  constructor(private readonly options: BridgeEngineOptions) {
    this.eventBus = options.eventBus;
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;

    this.child = this.spawnAgent(this.options.agentCommand, this.options.agentArgs);
    this.wireStdin();
    this.wireChildStdout();
    this.wireChildStderr();
    this.wireChildLifecycle();
  }

  resolvePermission(input: PermissionDecisionInput): boolean {
    const pending = this.pendingPermissions.get(input.id);
    if (!pending) {
      return false;
    }
    this.pendingPermissions.delete(input.id);

    const acpMessages = this.translator.githubToAcp({
      jsonrpc: "2.0",
      id: input.id,
      method: "session/request_permission",
      params: {
        sessionId: pending.sessionId,
        permissionId: input.id,
        outcome: this.permissionDecisionToOutcome(input.decision),
      },
    });

    for (const message of acpMessages) {
      this.writeToChild(message);
    }

    this.emitObserverEvent({
      type: "permission_resolved",
      payload: {
        id: input.id,
        decision: input.decision,
        timestamp: Date.now(),
      },
    });

    return true;
  }

  private wireStdin(): void {
    process.stdin.on("data", (chunk: Buffer | string) => {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

      // Attempt JSON-RPC framed parsing first (Content-Length + body).
      this.stdinFrameBuffer = Buffer.concat([this.stdinFrameBuffer, data]);
      let parsedAtLeastOneFrame = false;
      for (;;) {
        const headerEnd = this.stdinFrameBuffer.indexOf("\r\n\r\n");
        if (headerEnd === -1) {
          break;
        }
        const headers = this.stdinFrameBuffer.subarray(0, headerEnd).toString("utf8");
        const match = headers.match(/Content-Length:\s*(\d+)/i);
        if (!match) {
          break;
        }
        const contentLength = Number(match[1]);
        const totalLength = headerEnd + 4 + contentLength;
        if (this.stdinFrameBuffer.length < totalLength) {
          break;
        }
        const payload = this.stdinFrameBuffer.subarray(headerEnd + 4, totalLength).toString("utf8");
        this.stdinFrameBuffer = this.stdinFrameBuffer.subarray(totalLength);
        parsedAtLeastOneFrame = true;
        this.usesJsonRpcFraming = true;
        this.handleInboundJson(payload);
      }
      if (parsedAtLeastOneFrame || this.usesJsonRpcFraming) {
        return;
      }

      // Fallback to line-delimited JSON for stream-json/plain JSON clients.
      this.stdinLineBuffer += data.toString("utf8");
      for (;;) {
        const newlineIndex = this.stdinLineBuffer.indexOf("\n");
        if (newlineIndex === -1) {
          break;
        }
        const line = this.stdinLineBuffer.slice(0, newlineIndex).trim();
        this.stdinLineBuffer = this.stdinLineBuffer.slice(newlineIndex + 1);
        if (!line) {
          continue;
        }
        this.handleInboundJson(line);
      }
    });
  }

  private wireChildStdout(): void {
    if (!this.child?.stdout) {
      return;
    }
    const rl = createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
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
        this.trackOutbound(message, clientType);
        this.writeClientMessage(message);
      }
    });
  }

  private wireChildStderr(): void {
    if (!this.child?.stderr) {
      return;
    }
    const rl = createInterface({ input: this.child.stderr, crlfDelay: Infinity });
    rl.on("line", (line) => {
      safeLog("agent.stderr", { line });
    });
  }

  private wireChildLifecycle(): void {
    this.child?.on("close", (code, signal) => {
      if (code === 0) {
        return;
      }
      safeLog("Child agent exited unexpectedly", { code, signal });
      const message = `Child agent crashed (code: ${code ?? "null"}, signal: ${signal ?? "none"})`;
      const clientType = this.resolveCurrentClientType();
      for (const requestId of this.pendingRequestIds) {
        const response = this.translator.buildCrashResponse(clientType, requestId, message);
        this.writeClientMessage(response);
      }
      this.pendingRequestIds.clear();
    });
  }

  private spawnAgent(command: string, args: string[]): ChildProcessWithoutNullStreams {
    const mergedEnv = this.buildChildEnv();
    return spawn(command, args, {
      cwd: this.options.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: mergedEnv,
    });
  }

  private buildChildEnv(): NodeJS.ProcessEnv {
    const allowlist = this.options.envAllowlist ?? [
      "PATH",
      "HOME",
      "PWD",
      "SHELL",
      "TERM",
      "LANG",
      "GITHUB_TOKEN",
      "ANTHROPIC_API_KEY",
      "GOOGLE_API_KEY",
      "OPENAI_API_KEY",
    ];
    const env: NodeJS.ProcessEnv = {};
    for (const key of allowlist) {
      if (process.env[key]) {
        env[key] = process.env[key];
      }
    }
    return env;
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
    if (this.detectedClientType) {
      return this.detectedClientType;
    }
    const asRecord = typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : {};
    const detected = asRecord.jsonrpc === "2.0" ? "github" : "claude";
    this.detectedClientType = detected;
    return detected;
  }

  private resolveCurrentClientType(): ClientType {
    if (this.options.clientType === "github") {
      return "github";
    }
    if (this.options.clientType === "claude") {
      return "claude";
    }
    return this.detectedClientType ?? "github";
  }

  private writeToChild(message: unknown): void {
    if (!this.child?.stdin) {
      safeLog("Cannot write to child, stdin unavailable");
      return;
    }
    const record = this.asRecord(message);
    if (record.id !== undefined && (typeof record.id === "string" || typeof record.id === "number")) {
      this.pendingRequestIds.add(record.id);
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private trackInbound(payload: unknown, clientType: ClientType): void {
    const record = this.asRecord(payload);
    const method = this.stringValue(record.method) ?? this.stringValue(record.type);
    const command = this.extractCommand(payload);
    if (command) {
      const status: ActionStatus = this.isSensitiveCommand(command) ? "pending" : "approved";
      const eventId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      this.emitObserverEvent({
        type: "action_intercepted",
        payload: {
          id: eventId,
          command,
          status,
          source: clientType,
          timestamp: Date.now(),
        },
      });
    }
    if (typeof method === "string" && method.includes("prompt")) {
      const promptText = this.extractText(payload);
      if (promptText) {
        this.emitObserverEvent({
          type: "thought_chunk",
          payload: {
            id: `${Date.now()}_prompt`,
            content: promptText,
            hidden: false,
            timestamp: Date.now(),
          },
        });
      }
    }
  }

  private trackOutbound(payload: unknown, clientType: ClientType): void {
    const record = this.asRecord(payload);
    const method = this.stringValue(record.method);
    const params = this.asRecord(record.params);
    const eventType = this.stringValue(record.type);

    if (method === "token_stream") {
      const thought = this.stringValue(this.asRecord(params).thought);
      const delta = this.stringValue(this.asRecord(params).delta);
      if (delta) {
        this.emitObserverEvent({
          type: "thought_chunk",
          payload: {
            id: `${Date.now()}_delta`,
            content: delta,
            hidden: false,
            timestamp: Date.now(),
          },
        });
      }
      if (thought) {
        this.emitObserverEvent({
          type: "thought_chunk",
          payload: {
            id: `${Date.now()}_thought`,
            content: thought,
            hidden: true,
            timestamp: Date.now(),
          },
        });
      }

    }

    if (method === "tool_use" || eventType === "tool") {
      const command = this.stringValue(params.command) ?? this.stringValue(record.command);
      const id = this.stringValue(params.toolCallId) ?? this.stringValue(record.id) ?? `tool_${Date.now()}`;
      const status = (this.stringValue(params.status) ?? this.stringValue(record.status) ?? "pending") as ActionStatus;
      if (command) {
        this.emitObserverEvent({
          type: "action_status_changed",
          payload: {
            id,
            command,
            status,
            source: clientType,
            timestamp: Date.now(),
          },
        });
      }
    }

    if (method === "session/request_permission" || (eventType === "permission" && this.stringValue(record.subtype) === "request")) {
      const permissionId =
        this.stringValue(params.permissionId) ?? this.stringValue(record.id) ?? `perm_${Date.now()}`;
      const command = this.stringValue(params.command) ?? this.stringValue(record.command) ?? "sensitive command";
      const request: PendingPermission = {
        id: permissionId,
        title: this.stringValue(params.title) ?? this.stringValue(record.title) ?? "Permission required",
        command,
        risk: this.isSensitiveCommand(command) ? "high" : "medium",
        options: ["allow_once", "allow_session", "deny"],
        timestamp: Date.now(),
        sessionId: this.extractSessionId(payload),
      };
      this.pendingPermissions.set(permissionId, request);
      this.emitObserverEvent({
        type: "permission_requested",
        payload: request,
      });
    }
  }

  private permissionDecisionToOutcome(decision: PermissionDecision): string {
    if (decision === "approved") {
      return "allow_once";
    }
    if (decision === "cancelled") {
      return "cancelled";
    }
    return "deny";
  }

  private extractSessionId(payload: unknown): string {
    const record = this.asRecord(payload);
    const params = this.asRecord(record.params);
    return this.stringValue(params.sessionId) ?? "default";
  }

  private extractText(payload: unknown): string | undefined {
    const record = this.asRecord(payload);
    const params = this.asRecord(record.params);
    if (typeof params.prompt === "string") {
      return params.prompt;
    }
    if (Array.isArray(params.prompt)) {
      const firstText = params.prompt.find(
        (entry) => typeof entry === "object" && entry && (entry as Record<string, unknown>).type === "text",
      ) as Record<string, unknown> | undefined;
      if (firstText && typeof firstText.text === "string") {
        return firstText.text;
      }
    }
    if (typeof record.text === "string") {
      return record.text;
    }
    return undefined;
  }

  private extractCommand(payload: unknown): string | undefined {
    const record = this.asRecord(payload);
    const params = this.asRecord(record.params);
    if (typeof params.command === "string") {
      return params.command;
    }
    if (typeof record.command === "string") {
      return record.command;
    }
    const toolUse = this.asRecord(params.tool_use);
    if (typeof toolUse.command === "string") {
      return toolUse.command;
    }
    return undefined;
  }

  private isSensitiveCommand(command: string): boolean {
    const lowered = command.toLowerCase();
    return ["rm ", "npm publish", "git push --force", "chmod -r", "curl ", "wget "].some((frag) =>
      lowered.includes(frag),
    );
  }

  private emitObserverEvent(event: ObserverEvent): void {
    this.eventBus?.publish(event);
  }

  private tryHandleCopilotSdkRequest(payload: unknown): boolean {
    const request = this.asRecord(payload);
    if (request.jsonrpc !== "2.0" || typeof request.method !== "string") {
      return false;
    }

    const id = request.id;
    const method = request.method;
    const params = this.asRecord(request.params);
    if (id === undefined || (typeof id !== "string" && typeof id !== "number")) {
      return false;
    }

    switch (method) {
      case "ping":
        this.sendRpcResponse(id, {
          message: this.stringValue(params.message) ?? "pong",
          timestamp: Date.now(),
          protocolVersion: 2,
        });
        return true;
      case "status.get":
        this.sendRpcResponse(id, {
          version: "meshaway-dev",
          protocolVersion: 2,
        });
        return true;
      case "auth.getStatus":
        this.sendRpcResponse(id, {
          isAuthenticated: true,
          authType: "token",
          statusMessage: "Mesh bridge compatibility mode",
        });
        return true;
      case "models.list":
        this.sendRpcResponse(id, {
          models: [
            {
              id: "mesh-local",
              name: "Mesh Local",
              capabilities: {
                supports: {
                  vision: false,
                  reasoningEffort: false,
                },
                limits: {
                  max_context_window_tokens: 200000,
                },
              },
            },
          ],
        });
        return true;
      case "session.create":
        this.handleCopilotCreateSession(id, params);
        return true;
      case "session.resume":
        this.handleCopilotResumeSession(id, params);
        return true;
      case "session.send":
        this.handleCopilotSend(id, params);
        return true;
      case "session.getMessages":
        this.handleCopilotGetMessages(id, params);
        return true;
      case "session.destroy":
        this.handleCopilotDestroy(id, params);
        return true;
      case "session.abort":
        this.sendRpcResponse(id, {});
        return true;
      case "session.getLastId":
        this.sendRpcResponse(id, { sessionId: this.lastCopilotSessionId });
        return true;
      case "session.list":
        this.sendRpcResponse(id, {
          sessions: Array.from(this.copilotSessions.entries()).map(([sessionId, data]) => ({
            sessionId,
            startTime: new Date(data.createdAt).toISOString(),
            modifiedTime: new Date(data.modifiedAt).toISOString(),
            summary: data.summary,
            isRemote: false,
          })),
        });
        return true;
      case "session.delete":
        this.handleCopilotDelete(id, params);
        return true;
      case "session.getForeground":
        this.sendRpcResponse(id, { sessionId: this.lastCopilotSessionId });
        return true;
      case "session.setForeground":
        this.lastCopilotSessionId = this.stringValue(params.sessionId) ?? this.lastCopilotSessionId;
        this.sendRpcResponse(id, {});
        return true;
      default:
        return false;
    }
  }

  private handleCopilotCreateSession(id: string | number, params: Record<string, unknown>): void {
    const sessionId = this.stringValue(params.sessionId) ?? `session_${Date.now()}`;
    const now = Date.now();
    this.copilotSessions.set(sessionId, {
      createdAt: now,
      modifiedAt: now,
      summary: "Meshaway SDK session",
      events: [],
    });
    this.lastCopilotSessionId = sessionId;
    this.sendRpcResponse(id, { sessionId });
    this.sendLifecycleNotification("session.created", sessionId);
    this.appendCopilotEvent(sessionId, this.makeCopilotEvent("session.start", {
      sessionId,
      version: 1,
      producer: "meshaway",
      copilotVersion: "meshaway-dev",
      startTime: new Date(now).toISOString(),
      context: { cwd: this.options.cwd },
    }));
  }

  private handleCopilotResumeSession(id: string | number, params: Record<string, unknown>): void {
    const sessionId = this.stringValue(params.sessionId) ?? this.lastCopilotSessionId ?? `session_${Date.now()}`;
    if (!this.copilotSessions.has(sessionId)) {
      this.copilotSessions.set(sessionId, {
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        summary: "Meshaway SDK session",
        events: [],
      });
    }
    this.lastCopilotSessionId = sessionId;
    this.sendRpcResponse(id, { sessionId });
  }

  private handleCopilotSend(id: string | number, params: Record<string, unknown>): void {
    const sessionId = this.stringValue(params.sessionId) ?? this.lastCopilotSessionId ?? `session_${Date.now()}`;
    if (!this.copilotSessions.has(sessionId)) {
      this.copilotSessions.set(sessionId, {
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        summary: "Meshaway SDK session",
        events: [],
      });
    }

    const prompt = this.stringValue(params.prompt) ?? "";
    const messageId = `msg_${Date.now()}`;
    const userEvent = this.makeCopilotEvent("user.message", { content: prompt });
    const assistantEvent = this.makeCopilotEvent("assistant.message", {
      messageId,
      content: `Mesh received: ${prompt}`,
    });
    const idleEvent = this.makeCopilotEvent("session.idle", {}, true);

    this.appendCopilotEvent(sessionId, userEvent);
    this.appendCopilotEvent(sessionId, assistantEvent);
    this.appendCopilotEvent(sessionId, idleEvent);

    this.sendSessionEventNotification(sessionId, userEvent);
    this.sendSessionEventNotification(sessionId, assistantEvent);
    this.sendSessionEventNotification(sessionId, idleEvent);
    this.sendLifecycleNotification("session.updated", sessionId);
    this.sendRpcResponse(id, { messageId });
  }

  private handleCopilotGetMessages(id: string | number, params: Record<string, unknown>): void {
    const sessionId = this.stringValue(params.sessionId) ?? this.lastCopilotSessionId;
    const session = sessionId ? this.copilotSessions.get(sessionId) : undefined;
    this.sendRpcResponse(id, { events: session?.events ?? [] });
  }

  private handleCopilotDestroy(id: string | number, params: Record<string, unknown>): void {
    const sessionId = this.stringValue(params.sessionId);
    if (sessionId) {
      this.copilotSessions.delete(sessionId);
      this.sendLifecycleNotification("session.deleted", sessionId);
    }
    this.sendRpcResponse(id, {});
  }

  private handleCopilotDelete(id: string | number, params: Record<string, unknown>): void {
    const sessionId = this.stringValue(params.sessionId);
    if (sessionId) {
      this.copilotSessions.delete(sessionId);
      this.sendLifecycleNotification("session.deleted", sessionId);
    }
    this.sendRpcResponse(id, {});
  }

  private appendCopilotEvent(sessionId: string, event: Record<string, unknown>): void {
    const session = this.copilotSessions.get(sessionId);
    if (!session) {
      return;
    }
    session.events.push(event);
    session.modifiedAt = Date.now();
    session.summary = typeof event.data === "object" && event.data && "content" in (event.data as Record<string, unknown>)
      ? String((event.data as Record<string, unknown>).content).slice(0, 120)
      : session.summary;
  }

  private makeCopilotEvent(
    type: string,
    data: Record<string, unknown>,
    ephemeral?: boolean,
  ): Record<string, unknown> {
    return {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      parentId: null,
      ...(ephemeral ? { ephemeral: true } : {}),
      type,
      data,
    };
  }

  private sendSessionEventNotification(sessionId: string, event: Record<string, unknown>): void {
    this.writeClientMessage({
      jsonrpc: "2.0",
      method: "session.event",
      params: { sessionId, event },
    });
  }

  private sendLifecycleNotification(type: string, sessionId: string): void {
    this.writeClientMessage({
      jsonrpc: "2.0",
      method: "session.lifecycle",
      params: {
        type,
        sessionId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private sendRpcResponse(id: string | number, result: unknown): void {
    this.writeClientMessage({
      jsonrpc: "2.0",
      id,
      result,
    });
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
    if (clientType === "github" && this.tryHandleCopilotSdkRequest(parsed)) {
      return;
    }
    const outbound = clientType === "github" ? this.translator.githubToAcp(parsed) : this.translator.claudeToAcp(parsed);
    for (const message of outbound) {
      this.trackInbound(parsed, clientType);
      this.writeToChild(message);
    }
  }

  private writeClientMessage(message: unknown): void {
    const payload = JSON.stringify(message);
    if (this.usesJsonRpcFraming) {
      const length = Buffer.byteLength(payload, "utf8");
      process.stdout.write(`Content-Length: ${length}\r\n\r\n${payload}`);
      return;
    }
    process.stdout.write(`${payload}\n`);
  }

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
  }
}
