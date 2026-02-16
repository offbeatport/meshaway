import type { ActionStatus, ClientType, ObserverEvent, PermissionRequestEvent } from "../types.js";
import type { ObserverEventBus } from "../ui/events.js";
import {
  asRecord,
  extractCommand,
  extractSessionId,
  extractText,
  isSensitiveCommand,
  stringValue,
} from "./helpers.js";

export interface ObserverTrackingContext {
  eventBus?: ObserverEventBus;
  pendingPermissions: Map<string, PermissionRequestEvent & { sessionId: string }>;
  getResponseBuffer: () => string;
  setResponseBuffer: (s: string) => void;
  emitObserverEvent: (event: ObserverEvent) => void;
}

export function trackInbound(
  ctx: ObserverTrackingContext,
  payload: unknown,
  clientType: ClientType,
): void {
  const record = asRecord(payload);
  const method = stringValue(record.method) ?? stringValue(record.type);
  const command = extractCommand(payload);
  if (command) {
    const status: ActionStatus = isSensitiveCommand(command) ? "pending" : "approved";
    ctx.emitObserverEvent({
      type: "action_intercepted",
      payload: {
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        command,
        status,
        source: clientType,
        timestamp: Date.now(),
      },
    });
  }
  if (typeof method === "string" && method.includes("prompt")) {
    const promptText = extractText(payload);
    if (promptText) {
      ctx.emitObserverEvent({
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

export function trackOutbound(
  ctx: ObserverTrackingContext,
  payload: unknown,
  clientType: ClientType,
): void {
  const record = asRecord(payload);
  const method = stringValue(record.method);
  const params = asRecord(record.params);
  const eventType = stringValue(record.type);

  if (method === "token_stream") {
    const delta = stringValue(asRecord(params).delta);
    if (delta) {
      ctx.setResponseBuffer(ctx.getResponseBuffer() + delta);
    }
    const thought = stringValue(asRecord(params).thought);
    if (delta) {
      ctx.emitObserverEvent({
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
      ctx.emitObserverEvent({
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
    const command = stringValue(params.command) ?? stringValue(record.command);
    const id = stringValue(params.toolCallId) ?? stringValue(record.id) ?? `tool_${Date.now()}`;
    const status = (stringValue(params.status) ?? stringValue(record.status) ?? "pending") as ActionStatus;
    if (command) {
      ctx.emitObserverEvent({
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

  if (
    method === "session/request_permission" ||
    (eventType === "permission" && stringValue(record.subtype) === "request")
  ) {
    const permissionId = stringValue(params.permissionId) ?? stringValue(record.id) ?? `perm_${Date.now()}`;
    const command = stringValue(params.command) ?? stringValue(record.command) ?? "sensitive command";
    const request: PermissionRequestEvent & { sessionId: string } = {
      id: permissionId,
      title: stringValue(params.title) ?? stringValue(record.title) ?? "Permission required",
      command,
      risk: isSensitiveCommand(command) ? "high" : "medium",
      options: ["allow_once", "allow_session", "deny"],
      timestamp: Date.now(),
      sessionId: extractSessionId(payload),
    };
    ctx.pendingPermissions.set(permissionId, request);
    ctx.emitObserverEvent({
      type: "permission_requested",
      payload: request,
    });
  }
}
