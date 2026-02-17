import { z } from "zod";

export const JsonRpcIdSchema = z.union([z.string(), z.number()]);

export const JsonRpcBaseSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
  })
  .strict();

export const MetaSchema = z.record(z.string(), z.unknown()).optional();

export const InitializeRequestParamsSchema = z
  .object({
    protocolVersion: z.number(),
    clientCapabilities: z
      .object({
        fs: z
          .object({
            readTextFile: z.boolean(),
            writeTextFile: z.boolean(),
          })
          .strict()
          .default({ readTextFile: false, writeTextFile: false }),
        terminal: z.boolean().default(false),
      })
      .strict(),
    clientInfo: z
      .object({
        name: z.string(),
        version: z.string(),
      })
      .strict()
      .nullable()
      .optional(),
    _meta: MetaSchema,
  })
  .strict();

export const NewSessionRequestParamsSchema = z
  .object({
    cwd: z.string(),
    mcpServers: z.array(z.record(z.string(), z.unknown())),
    _meta: MetaSchema,
  })
  .strict();

export const PromptContentTextSchema = z
  .object({
    type: z.literal("text"),
    text: z.string(),
    _meta: MetaSchema,
  })
  .strict();

export const PromptContentResourceLinkSchema = z
  .object({
    type: z.literal("resource_link"),
    uri: z.string(),
    mimeType: z.string().optional(),
    _meta: MetaSchema,
  })
  .strict();

export const PromptContentResourceSchema = z
  .object({
    type: z.literal("resource"),
    resource: z.record(z.string(), z.unknown()),
    _meta: MetaSchema,
  })
  .strict();

export const PromptContentSchema = z.discriminatedUnion("type", [
  PromptContentTextSchema,
  PromptContentResourceLinkSchema,
  PromptContentResourceSchema,
]);

export const PromptRequestParamsSchema = z
  .object({
    sessionId: z.string(),
    prompt: z.array(PromptContentSchema),
    _meta: MetaSchema,
  })
  .strict();

export const SessionCancelParamsSchema = z
  .object({
    sessionId: z.string(),
    _meta: MetaSchema,
  })
  .strict();

export const ToolCallStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
]);

export const SessionUpdateSchema = z.discriminatedUnion("sessionUpdate", [
  z
    .object({
      sessionUpdate: z.literal("plan"),
      entries: z.array(z.record(z.string(), z.unknown())),
      _meta: MetaSchema,
    })
    .strict(),
  z
    .object({
      sessionUpdate: z.literal("agent_message_chunk"),
      content: PromptContentSchema,
      _meta: MetaSchema,
    })
    .strict(),
  z
    .object({
      sessionUpdate: z.literal("tool_call"),
      toolCallId: z.string(),
      title: z.string(),
      kind: z.string(),
      status: ToolCallStatusSchema,
      _meta: MetaSchema,
    })
    .strict(),
  z
    .object({
      sessionUpdate: z.literal("tool_call_update"),
      toolCallId: z.string(),
      status: ToolCallStatusSchema,
      content: z.array(z.record(z.string(), z.unknown())).optional(),
      _meta: MetaSchema,
    })
    .strict(),
  z
    .object({
      sessionUpdate: z.literal("user_message_chunk"),
      content: PromptContentSchema,
      _meta: MetaSchema,
    })
    .strict(),
]);

export const SessionUpdateNotificationParamsSchema = z
  .object({
    sessionId: z.string(),
    update: SessionUpdateSchema,
    _meta: MetaSchema,
  })
  .strict();

export const RequestPermissionParamsSchema = z
  .object({
    sessionId: z.string(),
    toolCall: z.record(z.string(), z.unknown()),
    options: z.array(z.record(z.string(), z.unknown())),
    _meta: MetaSchema,
  })
  .strict();

export const StopReasonSchema = z.enum([
  "end_turn",
  "max_tokens",
  "max_requests",
  "refusal",
  "cancelled",
]);

export const PromptResponseResultSchema = z
  .object({
    stopReason: StopReasonSchema,
    _meta: MetaSchema,
  })
  .strict();

export const JsonRpcRequestSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: JsonRpcIdSchema,
    method: z.enum([
      "initialize",
      "session/new",
      "session/prompt",
      "session/cancel",
      "session/request_permission",
    ]),
    params: z.unknown(),
  })
  .strict();

export const JsonRpcNotificationSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    method: z.enum(["session/update", "session/cancel"]),
    params: z.unknown(),
  })
  .strict();

export const JsonRpcResponseSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: JsonRpcIdSchema,
    result: z.unknown().optional(),
    error: z
      .object({
        code: z.number(),
        message: z.string(),
        data: z.unknown().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const AcpEnvelopeSchema = z.union([
  JsonRpcRequestSchema,
  JsonRpcNotificationSchema,
  JsonRpcResponseSchema,
]);

export type AcpEnvelope = z.infer<typeof AcpEnvelopeSchema>;
export type AcpRequest = z.infer<typeof JsonRpcRequestSchema>;
export type AcpNotification = z.infer<typeof JsonRpcNotificationSchema>;
export type AcpResponse = z.infer<typeof JsonRpcResponseSchema>;
