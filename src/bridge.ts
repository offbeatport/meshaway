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
  private child?: ChildProcessWithoutNullStreams;
  private detectedClientType?: ClientType;
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
    const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        safeLog("Skipping non-JSON stdin line");
        return;
      }

      const clientType = this.resolveClientType(parsed);
      const outbound =
        clientType === "github" ? this.translator.githubToAcp(parsed) : this.translator.claudeToAcp(parsed);

      for (const message of outbound) {
        this.trackInbound(parsed, clientType);
        this.writeToChild(message);
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
        process.stdout.write(`${JSON.stringify(message)}\n`);
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
        process.stdout.write(`${JSON.stringify(response)}\n`);
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

  private asRecord(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  }

  private stringValue(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
  }
}
