import type { UnifiedTranslator } from "../mapper.js";
import { asRecord, stringValue } from "./helpers.js";

/** Minimal engine interface the Copilot handler needs. */
export interface ICopilotHandlerEngine {
  options: { cwd: string };
  copilotSessions: Map<
    string,
    { createdAt: number; modifiedAt: number; summary?: string; events: Record<string, unknown>[] }
  >;
  lastCopilotSessionId: string | undefined;
  setLastCopilotSessionId(id: string | undefined): void;
  acpIdToCopilotId: Map<string | number, string | number>;
  acpIdToSessionId: Map<string | number, string>;
  responseBuffer: string;
  setResponseBuffer(s: string): void;
  agentHandshakeSent: boolean;
  setAgentHandshakeSent(v: boolean): void;
  forwardTimeouts: Map<string | number, ReturnType<typeof setTimeout>>;
  pendingRequestIds: Set<string | number>;
  translator: UnifiedTranslator;
  writeToChild(message: unknown, options?: { skipTracking?: boolean }): void;
  writeClientMessage(message: unknown): void;
  FORWARD_RESPONSE_TIMEOUT_MS: number;
}

export function makeCopilotEvent(
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

export function createCopilotHandler(engine: ICopilotHandlerEngine) {
  const ctx = engine;
  function sendRpcResponse(id: string | number, result: unknown): void {
    ctx.writeClientMessage({ jsonrpc: "2.0", id, result });
  }

  function sendSessionEventNotification(sessionId: string, event: Record<string, unknown>): void {
    ctx.writeClientMessage({
      jsonrpc: "2.0",
      method: "session.event",
      params: { sessionId, event },
    });
  }

  function sendLifecycleNotification(type: string, sessionId: string): void {
    ctx.writeClientMessage({
      jsonrpc: "2.0",
      method: "session.lifecycle",
      params: { type, sessionId, timestamp: new Date().toISOString() },
    });
  }

  function appendCopilotEvent(sessionId: string, event: Record<string, unknown>): void {
    const session = ctx.copilotSessions.get(sessionId);
    if (!session) return;
    session.events.push(event);
    session.modifiedAt = Date.now();
    session.summary =
      typeof event.data === "object" && event.data && "content" in (event.data as Record<string, unknown>)
        ? String((event.data as Record<string, unknown>).content).slice(0, 120)
        : session.summary;
  }

  function sendAcpInitialize(): void {
    ctx.writeToChild(
      {
        jsonrpc: "2.0",
        id: `init_${Date.now()}`,
        method: "initialize",
        params: {
          protocolVersion: 2,
          clientCapabilities: { fs: { readTextFile: true, writeTextFile: true }, terminal: true },
          clientInfo: { name: "meshaway", version: "0.1.0" },
        },
      },
      { skipTracking: true },
    );
  }

  function sendAcpSessionNew(sessionId: string): void {
    ctx.writeToChild(
      {
        jsonrpc: "2.0",
        id: `new_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        method: "session/new",
        params: { cwd: ctx.options.cwd, mcpServers: [] },
      },
      { skipTracking: true },
    );
  }

  function scheduleForwardTimeout(
    acpRequestId: string,
    copilotId: string | number,
    sessionId: string,
    prompt: string,
  ): void {
    const handle = setTimeout(() => {
      ctx.forwardTimeouts.delete(acpRequestId);
      if (!ctx.acpIdToCopilotId.has(acpRequestId)) return;
      ctx.acpIdToCopilotId.delete(acpRequestId);
      ctx.acpIdToSessionId.delete(acpRequestId);
      ctx.pendingRequestIds.delete(acpRequestId);
      sendRpcResponse(copilotId, { messageId: `msg_${Date.now()}` });
      const assistantEvent = makeCopilotEvent("assistant.message", {
        messageId: `msg_${Date.now()}`,
        content: `Mesh received: ${prompt}`,
      });
      appendCopilotEvent(sessionId, assistantEvent);
      sendSessionEventNotification(sessionId, assistantEvent);
      const idleEvent = makeCopilotEvent("session.idle", {}, true);
      appendCopilotEvent(sessionId, idleEvent);
      sendSessionEventNotification(sessionId, idleEvent);
      sendLifecycleNotification("session.idle", sessionId);
      sendLifecycleNotification("session.updated", sessionId);
    }, ctx.FORWARD_RESPONSE_TIMEOUT_MS);
    ctx.forwardTimeouts.set(acpRequestId, handle);
  }

  function tryHandle(payload: unknown): boolean {
    const request = asRecord(payload);
    if (request.jsonrpc !== "2.0" || typeof request.method !== "string") return false;
    const id = request.id;
    const method = request.method;
    const params = asRecord(request.params);
    if (id === undefined || (typeof id !== "string" && typeof id !== "number")) return false;

    switch (method) {
      case "ping":
        if (!ctx.agentHandshakeSent) {
          ctx.setAgentHandshakeSent(true);
          sendAcpInitialize();
        }
        sendRpcResponse(id, {
          message: stringValue(params.message) ?? "pong",
          timestamp: Date.now(),
          protocolVersion: 2,
        });
        return true;
      case "status.get":
        sendRpcResponse(id, { version: "meshaway-dev", protocolVersion: 2 });
        return true;
      case "auth.getStatus":
        sendRpcResponse(id, {
          isAuthenticated: true,
          authType: "token",
          statusMessage: "Mesh bridge compatibility mode",
        });
        return true;
      case "models.list":
        sendRpcResponse(id, {
          models: [
            {
              id: "mesh-local",
              name: "Mesh Local",
              capabilities: {
                supports: { vision: false, reasoningEffort: false },
                limits: { max_context_window_tokens: 200000 },
              },
            },
          ],
        });
        return true;
      case "session.create":
        handleCreateSession(id, params);
        return true;
      case "session.resume":
        handleResumeSession(id, params);
        return true;
      case "session.send":
        handleSend(id, params);
        return true;
      case "session.getMessages":
        sendRpcResponse(id, {
          events: (ctx.copilotSessions.get(stringValue(params.sessionId) ?? ctx.lastCopilotSessionId ?? "")?.events ?? []),
        });
        return true;
      case "session.destroy":
      case "session.delete":
        handleDestroyOrDelete(id, params);
        return true;
      case "session.abort":
        sendRpcResponse(id, {});
        return true;
      case "session.getLastId":
        sendRpcResponse(id, { sessionId: ctx.lastCopilotSessionId });
        return true;
      case "session.list":
        sendRpcResponse(id, {
          sessions: Array.from(ctx.copilotSessions.entries()).map(([sessionId, data]) => ({
            sessionId,
            startTime: new Date(data.createdAt).toISOString(),
            modifiedTime: new Date(data.modifiedAt).toISOString(),
            summary: data.summary,
            isRemote: false,
          })),
        });
        return true;
      case "session.getForeground":
        sendRpcResponse(id, { sessionId: ctx.lastCopilotSessionId });
        return true;
      case "session.setForeground":
        ctx.setLastCopilotSessionId(stringValue(params.sessionId) ?? ctx.lastCopilotSessionId);
        sendRpcResponse(id, {});
        return true;
      default:
        return false;
    }
  }

  function handleCreateSession(id: string | number, params: Record<string, unknown>): void {
    const sessionId = stringValue(params.sessionId) ?? `session_${Date.now()}`;
    const now = Date.now();
    ctx.copilotSessions.set(sessionId, {
      createdAt: now,
      modifiedAt: now,
      summary: "Meshaway SDK session",
      events: [],
    });
    ctx.setLastCopilotSessionId(sessionId);
    sendRpcResponse(id, { sessionId });
    sendLifecycleNotification("session.created", sessionId);
    appendCopilotEvent(
      sessionId,
      makeCopilotEvent("session.start", {
        sessionId,
        version: 1,
        producer: "meshaway",
        copilotVersion: "meshaway-dev",
        startTime: new Date(now).toISOString(),
        context: { cwd: ctx.options.cwd },
      }),
    );
    sendAcpSessionNew(sessionId);
  }

  function handleResumeSession(id: string | number, params: Record<string, unknown>): void {
    const sessionId = stringValue(params.sessionId) ?? ctx.lastCopilotSessionId ?? `session_${Date.now()}`;
    if (!ctx.copilotSessions.has(sessionId)) {
      ctx.copilotSessions.set(sessionId, {
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        summary: "Meshaway SDK session",
        events: [],
      });
    }
    ctx.setLastCopilotSessionId(sessionId);
    sendRpcResponse(id, { sessionId });
  }

  function handleSend(id: string | number, params: Record<string, unknown>): void {
    const sessionId = stringValue(params.sessionId) ?? ctx.lastCopilotSessionId ?? `session_${Date.now()}`;
    if (!ctx.copilotSessions.has(sessionId)) {
      ctx.copilotSessions.set(sessionId, {
        createdAt: Date.now(),
        modifiedAt: Date.now(),
        summary: "Meshaway SDK session",
        events: [],
      });
    }
    const prompt = stringValue(params.prompt) ?? "";
    const userEvent = makeCopilotEvent("user.message", { content: prompt });
    appendCopilotEvent(sessionId, userEvent);
    sendSessionEventNotification(sessionId, userEvent);
    sendLifecycleNotification("session.updated", sessionId);

    const acpRequestId = `acp_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    ctx.acpIdToCopilotId.set(acpRequestId, id);
    ctx.acpIdToSessionId.set(acpRequestId, sessionId);
    ctx.setResponseBuffer("");
    ctx.writeToChild({
      jsonrpc: "2.0",
      id: acpRequestId,
      method: "session/prompt",
      params: { sessionId, prompt: [{ type: "text", text: prompt }] },
    });
    scheduleForwardTimeout(acpRequestId, id, sessionId, prompt);
  }

  function handleDestroyOrDelete(id: string | number, params: Record<string, unknown>): void {
    const sessionId = stringValue(params.sessionId);
    if (sessionId) {
      ctx.copilotSessions.delete(sessionId);
      sendLifecycleNotification("session.deleted", sessionId);
    }
    sendRpcResponse(id, {});
  }

  return {
    tryHandle,
    makeCopilotEvent,
    appendCopilotEvent,
    sendSessionEventNotification,
    sendLifecycleNotification,
    sendRpcResponse,
    scheduleForwardTimeout,
  };
}

export type CopilotHandler = ReturnType<typeof createCopilotHandler>;
