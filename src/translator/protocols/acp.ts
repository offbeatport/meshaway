import { type } from "arktype";

export const JsonRpcIdSchema = type("string | number");
export type JsonRpcId = typeof JsonRpcIdSchema.infer;

const MetaSchema = "Record<string, unknown>";

export const JsonRpcBaseSchema = type({
  "+": "reject",
  jsonrpc: "'2.0'",
});

export const InitializeRequestParamsSchema = type({
  "+": "reject",
  protocolVersion: "number",
  clientCapabilities: {
    "+": "reject",
    fs: {
      "+": "reject",
      readTextFile: "boolean",
      writeTextFile: "boolean",
    },
    terminal: "boolean",
  },
  "clientInfo?": type("null").or(type({ name: "string", version: "string" })),
  _meta: MetaSchema,
});

export const NewSessionRequestParamsSchema = type({
  "+": "reject",
  cwd: "string",
  mcpServers: "Record<string, unknown>[]",
  _meta: MetaSchema,
});

export const PromptContentTextSchema = type({
  "+": "reject",
  type: "'text'",
  text: "string",
  _meta: MetaSchema,
});

export const PromptContentResourceLinkSchema = type({
  "+": "reject",
  type: "'resource_link'",
  uri: "string",
  "mimeType?": "string",
  _meta: MetaSchema,
});

export const PromptContentResourceSchema = type({
  "+": "reject",
  type: "'resource'",
  resource: "Record<string, unknown>",
  _meta: MetaSchema,
});

export const PromptContentSchema = type.or(
  PromptContentTextSchema,
  PromptContentResourceLinkSchema,
  PromptContentResourceSchema,
);

export const PromptRequestParamsSchema = type({
  "+": "reject",
  sessionId: "string",
  prompt: PromptContentSchema.array(),
  _meta: MetaSchema,
});

export const SessionCancelParamsSchema = type({
  "+": "reject",
  sessionId: "string",
  _meta: MetaSchema,
});

export const ToolCallStatusSchema = type(
  "'pending' | 'in_progress' | 'completed' | 'failed' | 'cancelled'",
);

export const SessionUpdateSchema = type.or(
  type({
    "+": "reject",
    sessionUpdate: "'plan'",
    entries: type("Record<string, unknown>").array(),
    _meta: MetaSchema,
  }),
  type({
    "+": "reject",
    sessionUpdate: "'agent_message_chunk'",
    content: PromptContentSchema,
    _meta: MetaSchema,
  }),
  type({
    "+": "reject",
    sessionUpdate: "'tool_call'",
    toolCallId: "string",
    title: "string",
    kind: "string",
    status: ToolCallStatusSchema,
    _meta: MetaSchema,
  }),
  type({
    "+": "reject",
    sessionUpdate: "'tool_call_update'",
    toolCallId: "string",
    status: ToolCallStatusSchema,
    "content?": type("Record<string, unknown>").array(),
    _meta: MetaSchema,
  }),
  type({
    "+": "reject",
    sessionUpdate: "'user_message_chunk'",
    content: PromptContentSchema,
    _meta: MetaSchema,
  }),
);

export const SessionUpdateNotificationParamsSchema = type({
  "+": "reject",
  sessionId: "string",
  update: SessionUpdateSchema,
  _meta: MetaSchema,
});

export const RequestPermissionParamsSchema = type({
  "+": "reject",
  sessionId: "string",
  toolCall: "Record<string, unknown>",
  options: type("Record<string, unknown>").array(),
  _meta: MetaSchema,
});

export const StopReasonSchema = type(
  "'end_turn' | 'max_tokens' | 'max_requests' | 'refusal' | 'cancelled'",
);

export const PromptResponseResultSchema = type({
  "+": "reject",
  stopReason: StopReasonSchema,
  _meta: MetaSchema,
});

export const JsonRpcRequestSchema = type({
  "+": "reject",
  jsonrpc: "'2.0'",
  id: JsonRpcIdSchema,
  method:
    "'initialize' | 'session/new' | 'session/prompt' | 'session/cancel' | 'session/request_permission'",
  params: "unknown",
});

export const JsonRpcNotificationSchema = type({
  "+": "reject",
  jsonrpc: "'2.0'",
  method: "'session/update' | 'session/cancel'",
  params: "unknown",
});

export const JsonRpcResponseSchema = type({
  "+": "reject",
  jsonrpc: "'2.0'",
  id: JsonRpcIdSchema,
  "result?": "unknown",
  "error?": {
    "+": "reject",
    code: "number",
    message: "string",
    "data?": "unknown",
  },
});

export const AcpEnvelopeSchema = type.or(
  JsonRpcRequestSchema,
  JsonRpcNotificationSchema,
  JsonRpcResponseSchema,
);

export type AcpEnvelope = typeof AcpEnvelopeSchema.infer;
export type AcpRequest = typeof JsonRpcRequestSchema.infer;
export type AcpNotification = typeof JsonRpcNotificationSchema.infer;
export type AcpResponse = typeof JsonRpcResponseSchema.infer;
