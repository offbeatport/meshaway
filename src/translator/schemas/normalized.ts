import { type } from "arktype";

/** Normalized internal shape for inbound messages (GitHub/Claude → ACP). */
export const NormalizedInboundSchema = type({
  "+": "reject",
  kind: "'prompt' | 'cancel' | 'permission_decision' | 'tool_use' | 'token_usage' | 'noop'",
  "requestId?": "string | number",
  sessionId: "string",
  "text?": "string",
  "thought?": "string",
  "command?": "string",
  "permissionId?": "string",
  "decision?": "'approved' | 'denied' | 'cancelled'",
  "usage?": {
    "+": "reject",
    model: "string",
    inputTokens: "number",
    outputTokens: "number",
    "cachedInputTokens?": "number",
  },
  "meta?": "Record<string, unknown>",
});

/** Normalized internal shape for outbound messages (ACP → GitHub/Claude). */
export const NormalizedOutboundSchema = type({
  "+": "reject",
  kind:
    "'message_chunk' | 'tool_call' | 'tool_call_update' | 'permission_request' | 'response' | 'error' | 'noop'",
  "requestId?": "string | number",
  "sessionId?": "string",
  "text?": "string",
  "thought?": "string",
  "toolCallId?": "string",
  "title?": "string",
  "command?": "string",
  "status?": "string",
  "permissionId?": "string",
  "stopReason?": "string",
  "error?": {
    "+": "reject",
    code: "number",
    message: "string",
  },
  "usage?": {
    "+": "reject",
    model: "string",
    inputTokens: "number",
    outputTokens: "number",
    "cachedInputTokens?": "number",
  },
  "meta?": "Record<string, unknown>",
});

export type NormalizedInbound = typeof NormalizedInboundSchema.infer;
export type NormalizedOutbound = typeof NormalizedOutboundSchema.infer;
