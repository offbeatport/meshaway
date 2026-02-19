import { type } from "arktype";

export const AcpInitializeParamsSchema = type({
  protocolVersion: "number",
  clientCapabilities: "object",
  "clientInfo?": "object",
  "_meta?": "Record<string, unknown>",
});

export const AcpNewSessionParamsSchema = type({
  cwd: "string",
  mcpServers: "Record<string, unknown>[]",
  "_meta?": "Record<string, unknown>",
});

export const AcpPromptContentTextSchema = type({
  type: "'text'",
  text: "string",
  "_meta?": "Record<string, unknown>",
});

export const AcpPromptContentResourceLinkSchema = type({
  type: "'resource_link'",
  uri: "string",
  "mimeType?": "string",
  "_meta?": "Record<string, unknown>",
});

export const AcpPromptContentResourceSchema = type({
  type: "'resource'",
  resource: "Record<string, unknown>",
  "_meta?": "Record<string, unknown>",
});

export const AcpPromptContentSchema = type.or(
  AcpPromptContentTextSchema,
  AcpPromptContentResourceLinkSchema,
  AcpPromptContentResourceSchema
);

export const AcpPromptParamsSchema = type({
  sessionId: "string",
  prompt: AcpPromptContentSchema.array(),
  "_meta?": "Record<string, unknown>",
});

export const AcpSessionCancelParamsSchema = type({
  sessionId: "string",
  "_meta?": "Record<string, unknown>",
});

export const AcpToolCallStatusSchema = type(
  "'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'"
);

export const AcpSessionUpdateSchema = type.or(
  type({
    sessionUpdate: "'plan'",
    entries: "Record<string, unknown>[]",
    "_meta?": "Record<string, unknown>",
  }),
  type({
    sessionUpdate: "'agent_message_chunk'",
    content: AcpPromptContentSchema,
    "_meta?": "Record<string, unknown>",
  }),
  type({
    sessionUpdate: "'tool_call'",
    toolCallId: "string",
    title: "string",
    kind: "string",
    status: AcpToolCallStatusSchema,
    "_meta?": "Record<string, unknown>",
  }),
  type({
    sessionUpdate: "'tool_call_update'",
    toolCallId: "string",
    status: AcpToolCallStatusSchema,
    "content?": "Record<string, unknown>[]",
    "_meta?": "Record<string, unknown>",
  }),
  type({
    sessionUpdate: "'user_message_chunk'",
    content: AcpPromptContentSchema,
    "_meta?": "Record<string, unknown>",
  })
);

export const AcpRequestPermissionParamsSchema = type({
  sessionId: "string",
  toolCall: "Record<string, unknown>",
  options: "Record<string, unknown>[]",
  "_meta?": "Record<string, unknown>",
});

export const AcpStopReasonSchema = type(
  "'end_turn' | 'max_tokens' | 'max_requests' | 'refusal' | 'cancelled'"
);

export const AcpPromptResponseResultSchema = type({
  stopReason: AcpStopReasonSchema,
  "_meta?": "Record<string, unknown>",
});

export const AcpRequestSchema = type({
  jsonrpc: "'2.0'",
  id: "string | number",
  method:
    "'initialize' | 'session/new' | 'session/prompt' | 'session/cancel' | 'session/request_permission'",
  params: "unknown",
});

export const AcpNotificationSchema = type({
  jsonrpc: "'2.0'",
  method: "'session/update' | 'session/cancel'",
  params: "unknown",
});

export const AcpResponseSchema = type({
  jsonrpc: "'2.0'",
  id: "string | number",
  "result?": "unknown",
  "error?": {
    code: "number",
    message: "string",
    "data?": "unknown",
  },
});

export const AcpEnvelopeSchema = type.or(
  AcpRequestSchema,
  AcpNotificationSchema,
  AcpResponseSchema
);

export type AcpRequest = typeof AcpRequestSchema.infer;
export type AcpNotification = typeof AcpNotificationSchema.infer;
export type AcpResponse = typeof AcpResponseSchema.infer;
export type AcpEnvelope = typeof AcpEnvelopeSchema.infer;
