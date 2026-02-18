import { createInterface } from "node:readline";
import { UnifiedTranslator } from "../translator/translator.js";
import { safeLog } from "../logging.js";
import type { ClientType, MeshMode, PermissionDecisionInput } from "../types.js";
import type { PermissionRequestEvent } from "../types.js";
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
import { createGithubHandler, type IClientHandlerEngine } from "./copilot-handler.js";
import { createClaudeHandler } from "./claude-handler.js";

export interface BridgeEngineOptions {
    clientType: MeshMode;
    /** Used when type is local: command to spawn. Ignored when agentUrl is set. */
    agentCommand: string;
    /** Used when type is local: args for the command. Ignored when agentUrl is set. */
    agentArgs: string[];
    cwd: string;
    envAllowlist?: string[];
    eventBus?: ObserverEventBus;
    /** When set, use HTTP POST to this URL instead of spawning a child (remote agent). */
    agentUrl?: string;
    /** Optional env var name for API key (e.g. OPENAI_API_KEY); sent as Bearer when set. */
    apiKeyEnv?: string;
}

type PendingPermission = PermissionRequestEvent & { sessionId: string };

const FORWARD_RESPONSE_TIMEOUT_MS = 95_000;

const PERMISSION_OUTCOME: Record<PermissionDecisionInput["decision"], string> = {
    approved: "allow_once",
    cancelled: "cancelled",
    denied: "deny",
};

type ClientHandler = {
    tryHandle(parsed: unknown): boolean;
    ensureInit?: () => void;
};

/**
 * Multi-client bridge: stdio ↔ child ACP agent.
 * Supports GitHub (Copilot) and Claude. Both have handlers: GitHub does session/init/ID mapping;
 * Claude sends system init (session_id) once, then stream events. Add new clients in getHandler() and translateToAcp/FromAcp.
 */
export class BridgeEngine implements IClientHandlerEngine {
    readonly options: BridgeEngineOptions;
    readonly translator = new UnifiedTranslator();
    readonly eventBus?: ObserverEventBus;
    readonly pendingRequestIds = new Set<string | number>();
    readonly pendingPermissions = new Map<string, PendingPermission>();
    /** Session state for GitHub client (Copilot protocol). */
    readonly githubSessions = new Map<
        string,
        { createdAt: number; modifiedAt: number; summary?: string; events: Record<string, unknown>[] }
    >();
    lastGithubSessionId: string | undefined = undefined;
    /** ACP request ID → GitHub client request ID (for response rewriting). */
    readonly acpIdToGithubId = new Map<string | number, string | number>();
    readonly acpIdToSessionId = new Map<string | number, string>();
    responseBuffer = "";
    agentHandshakeSent = false;
    readonly forwardTimeouts = new Map<string | number, ReturnType<typeof setTimeout>>();
    readonly FORWARD_RESPONSE_TIMEOUT_MS = FORWARD_RESPONSE_TIMEOUT_MS;

    /** Claude: whether we've sent the system init (session_id) expected by the SDK. */
    claudeInitSent = false;
    setClaudeInitSent(v: boolean): void {
        this.claudeInitSent = v;
    }

    setLastGithubSessionId(id: string | undefined): void {
        this.lastGithubSessionId = id;
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

    private readonly githubHandler = createGithubHandler(this);
    private readonly claudeHandler = createClaudeHandler(this);

    /** Returns the handler for this client type (GitHub: session/init; Claude: system init). */
    private getHandler(clientType: ClientType): ClientHandler | undefined {
        if (clientType === "github") return this.githubHandler;
        if (clientType === "claude") return this.claudeHandler;
        return undefined;
    }

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
        this.wireStdin();
        if (this.options.agentUrl) {
            // Remote agent: no child process; writeToChild will POST to agentUrl.
            return;
        }
        const env = buildChildEnv(this.options.envAllowlist);
        this.child = spawnAgentTransport(
            this.options.agentCommand,
            this.options.agentArgs,
            this.options.cwd,
            env,
        );
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
                outcome: PERMISSION_OUTCOME[input.decision],
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
        rl.on("line", (line) => this.pushAgentLine(line.trim()));
    }

    /** Process one line of agent output (from child stdout or remote HTTP response). */
    private pushAgentLine(trimmed: string): void {
        if (!trimmed) return;
        const parsed = this.parseJson(trimmed);
        if (parsed === null) {
            safeLog("Agent emitted non-JSON line", { line: trimmed });
            return;
        }
        const clientType = this.getClientType();
        this.getHandler(clientType)?.ensureInit?.();
        for (const message of this.translateFromAcp(parsed, clientType)) {
            trackOutbound(this.observerTrackingContext, message, clientType);
            this.writeClientMessage(this.rewriteResponseIdForClient(message));
        }
    }

    private rewriteResponseIdForClient(message: unknown): unknown {
        const record = asRecord(message);
        const id = record.id;
        if (id === undefined || (typeof id !== "string" && typeof id !== "number")) return message;
        if (!("result" in record && record.result !== undefined) && !("error" in record && record.error !== undefined)) {
            return message;
        }
        const githubId = this.acpIdToGithubId.get(id);
        if (githubId === undefined) return message;
        this.clearForwardTimeout(id);
        const sessionId = this.acpIdToSessionId.get(id);
        this.acpIdToGithubId.delete(id);
        this.acpIdToSessionId.delete(id);
        this.pendingRequestIds.delete(id);
        if (sessionId && this.githubSessions.has(sessionId)) {
            this.emitGithubResponseEvents(sessionId);
        }
        return { ...record, id: githubId };
    }

    private emitGithubResponseEvents(sessionId: string): void {
        const content = this.responseBuffer || "[Agent response]";
        this.responseBuffer = "";
        const assistantEvent = this.githubHandler.makeCopilotEvent("assistant.message", {
            messageId: `msg_${Date.now()}`,
            content,
        });
        const idleEvent = this.githubHandler.makeCopilotEvent("session.idle", {}, true);
        this.githubHandler.appendCopilotEvent(sessionId, assistantEvent);
        this.githubHandler.sendSessionEventNotification(sessionId, assistantEvent);
        this.githubHandler.appendCopilotEvent(sessionId, idleEvent);
        this.githubHandler.sendSessionEventNotification(sessionId, idleEvent);
        this.githubHandler.sendLifecycleNotification("session.idle", sessionId);
        this.githubHandler.sendLifecycleNotification("session.updated", sessionId);
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
            const clientType = this.getClientType();
            for (const acpId of this.pendingRequestIds) {
                const clientId = this.acpIdToGithubId.get(acpId) ?? acpId;
                this.acpIdToGithubId.delete(acpId);
                this.writeClientMessage(this.translator.buildCrashResponse(clientType, clientId, message));
            }
            this.pendingRequestIds.clear();
        });
    }

    writeToChild(message: unknown, options?: { skipTracking?: boolean }): void {
        const record = asRecord(message);
        if (
            !options?.skipTracking &&
            record.id !== undefined &&
            (typeof record.id === "string" || typeof record.id === "number")
        ) {
            this.pendingRequestIds.add(record.id);
        }
        const url = this.options.agentUrl;
        if (url) {
            this.sendRemoteMessage(url, message);
            return;
        }
        if (!this.child?.stdin) {
            safeLog("Cannot write to child, stdin unavailable");
            return;
        }
        this.child.stdin.write(`${JSON.stringify(message)}\n`);
    }

    private sendRemoteMessage(baseUrl: string, message: unknown): void {
        const record = asRecord(message);
        const body = JSON.stringify(message);
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
        };
        const apiKey = this.options.apiKeyEnv && process.env[this.options.apiKeyEnv];
        if (apiKey) {
            headers["Authorization"] = `Bearer ${apiKey}`;
        }
        const endpoint = baseUrl.replace(/\/$/, "");
        fetch(endpoint, {
            method: "POST",
            headers,
            body,
        })
            .then(async (res) => {
                const text = await res.text();
                if (!res.ok) {
                    const errMsg = `Remote agent HTTP ${res.status}: ${text.slice(0, 200)}`;
                    this.emitRemoteError(record.id, errMsg);
                    return;
                }
                // Response: single JSON line or NDJSON (one JSON object per line).
                const lines = text.split("\n").map((s) => s.trim()).filter(Boolean);
                if (lines.length === 0) return;
                for (const line of lines) {
                    this.pushAgentLine(line);
                }
            })
            .catch((err: unknown) => {
                const errMsg = err instanceof Error ? err.message : String(err);
                this.emitRemoteError(record.id, `Remote agent request failed: ${errMsg}`);
            });
    }

    private emitRemoteError(requestId: unknown, message: string): void {
        safeLog("Remote agent error", { requestId, message });
        if (requestId !== undefined && (typeof requestId === "string" || typeof requestId === "number")) {
            this.pendingRequestIds.delete(requestId);
            const clientId = this.acpIdToGithubId.get(requestId) ?? requestId;
            this.acpIdToGithubId.delete(requestId);
            this.acpIdToSessionId.delete(requestId);
            this.clearForwardTimeout(requestId);
            const clientType = this.getClientType();
            this.writeClientMessage(this.translator.buildCrashResponse(clientType, clientId, message));
        }
    }

    writeClientMessage(message: unknown): void {
        process.stdout.write(
            formatClientMessage(message, this.stdinState.usesJsonRpcFraming),
        );
    }

    /** Resolve client type: from clientType, then cached detection, then infer from parsed message (inbound). */
    private getClientType(parsed?: unknown): ClientType {
        const mode = this.options.clientType;

        switch (mode) {
            case "github":
                this.detectedClientType = "github";
                return "github";
            case "claude":
                this.detectedClientType = "claude";
                return "claude";
            case "auto":
                break;
        }

        if (this.detectedClientType) {
            return this.detectedClientType;
        }

        if (parsed !== undefined) {
            const rec = typeof parsed === "object" && parsed ? (parsed as Record<string, unknown>) : {};
            this.detectedClientType = rec.jsonrpc === "2.0" ? "github" : "claude";
            return this.detectedClientType;
        }

        return "github";
    }

    private translateToAcp(parsed: unknown, clientType: ClientType): unknown[] {
        return clientType === "github" ? this.translator.githubToAcp(parsed) : this.translator.claudeToAcp(parsed);
    }

    private translateFromAcp(parsed: unknown, clientType: ClientType): unknown[] {
        return clientType === "github" ? this.translator.acpToGithub(parsed) : this.translator.acpToClaude(parsed);
    }

    private parseJson(raw: string): unknown | null {
        try {
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    private clearForwardTimeout(acpRequestId: string | number): void {
        const handle = this.forwardTimeouts.get(acpRequestId);
        if (handle !== undefined) {
            clearTimeout(handle);
            this.forwardTimeouts.delete(acpRequestId);
        }
    }

    private handleInboundJson(raw: string): void {
        const parsed = this.parseJson(raw);
        if (parsed === null) {
            safeLog("Skipping non-JSON stdin payload");
            return;
        }
        const clientType = this.getClientType(parsed);
        if (this.getHandler(clientType)?.tryHandle(parsed)) return;
        for (const message of this.translateToAcp(parsed, clientType)) {
            trackInbound(this.observerTrackingContext, parsed, clientType);
            this.writeToChild(message);
        }
    }
}
