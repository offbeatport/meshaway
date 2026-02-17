import { z } from "zod";
import {
  AcpEnvelopeSchema,
  type AcpEnvelope,
  type AcpResponse,
  type JsonRpcIdSchema,
} from "./protocols/acp.js";
import { ClaudeMessageSchema } from "./protocols/claude.js";
import { GithubJsonRpcEnvelopeSchema } from "./protocols/github.js";
import type { ClientType } from "../types.js";

type JsonRpcId = z.infer<typeof JsonRpcIdSchema>;

const NormalizedInboundSchema = z
  .object({
    kind: z.enum(["prompt", "cancel", "permission_decision", "tool_use", "token_usage", "noop"]),
    requestId: z.union([z.string(), z.number()]).optional(),
    sessionId: z.string().default("default"),
    text: z.string().optional(),
    thought: z.string().optional(),
    command: z.string().optional(),
    permissionId: z.string().optional(),
    decision: z.enum(["approved", "denied", "cancelled"]).optional(),
    usage: z
      .object({
        model: z.string(),
        inputTokens: z.number(),
        outputTokens: z.number(),
        cachedInputTokens: z.number().optional(),
      })
      .strict()
      .optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

const NormalizedOutboundSchema = z
  .object({
    kind: z.enum(["message_chunk", "tool_call", "tool_call_update", "permission_request", "response", "error", "noop"]),
    requestId: z.union([z.string(), z.number()]).optional(),
    sessionId: z.string().optional(),
    text: z.string().optional(),
    thought: z.string().optional(),
    toolCallId: z.string().optional(),
    title: z.string().optional(),
    command: z.string().optional(),
    status: z.string().optional(),
    permissionId: z.string().optional(),
    stopReason: z.string().optional(),
    error: z
      .object({
        code: z.number(),
        message: z.string(),
      })
      .strict()
      .optional(),
    usage: z
      .object({
        model: z.string(),
        inputTokens: z.number(),
        outputTokens: z.number(),
        cachedInputTokens: z.number().optional(),
      })
      .strict()
      .optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export class UnifiedTranslator {
  githubToAcp(raw: unknown): AcpEnvelope[] {
    const parsed = GithubJsonRpcEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      return [this.buildProtocolError("github_invalid_message", -32600, "Invalid GitHub payload")];
    }

    const normalized = NormalizedInboundSchema.parse(this.normalizeGithubInbound(parsed.data));
    return this.normalizedToAcp(normalized);
  }

  claudeToAcp(raw: unknown): AcpEnvelope[] {
    const parsed = ClaudeMessageSchema.safeParse(raw);
    if (!parsed.success) {
      return [this.buildProtocolError("claude_invalid_message", -32600, "Invalid Claude payload")];
    }

    const normalized = NormalizedInboundSchema.parse(this.normalizeClaudeInbound(parsed.data));
    return this.normalizedToAcp(normalized);
  }

  acpToGithub(raw: unknown): unknown[] {
    const parsed = AcpEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      return [this.githubErrorEnvelope("acp_invalid", -32600, "Invalid ACP payload from child agent")];
    }

    const normalized = NormalizedOutboundSchema.parse(this.normalizeAcpOutbound(parsed.data));
    return [this.toGithubEnvelope(normalized)];
  }

  acpToClaude(raw: unknown): unknown[] {
    const parsed = AcpEnvelopeSchema.safeParse(raw);
    if (!parsed.success) {
      return [
        {
          type: "error",
          subtype: "protocol",
          code: -32600,
          message: "Invalid ACP payload from child agent",
        },
      ];
    }

    const normalized = NormalizedOutboundSchema.parse(this.normalizeAcpOutbound(parsed.data));
    return [this.toClaudeEvent(normalized)];
  }

  buildCrashResponse(clientType: ClientType, requestId: JsonRpcId, message: string): unknown {
    if (clientType === "github") {
      return this.githubErrorEnvelope("agent_crash", -32001, message, requestId);
    }

    return {
      type: "error",
      subtype: "agent_crash",
      request_id: requestId,
      message,
    };
  }

  private normalizedToAcp(normalized: z.infer<typeof NormalizedInboundSchema>): AcpEnvelope[] {
    switch (normalized.kind) {
      case "prompt":
        return [
          AcpEnvelopeSchema.parse({
            jsonrpc: "2.0",
            id: normalized.requestId ?? Date.now(),
            method: "session/prompt",
            params: {
              sessionId: normalized.sessionId,
              prompt: [
                {
                  type: "text",
                  text: normalized.text ?? "",
                },
              ],
              _meta: {
                ...(normalized.meta ?? {}),
                ...(normalized.thought ? { thought: normalized.thought } : {}),
              },
            },
          }),
        ];
      case "cancel":
        return [
          AcpEnvelopeSchema.parse({
            jsonrpc: "2.0",
            method: "session/cancel",
            params: {
              sessionId: normalized.sessionId,
            },
          }),
        ];
      case "permission_decision":
        return [
          AcpEnvelopeSchema.parse({
            jsonrpc: "2.0",
            id: normalized.requestId ?? normalized.permissionId ?? Date.now(),
            method: "session/request_permission",
            params: {
              sessionId: normalized.sessionId,
              toolCall: {
                toolCallId: normalized.permissionId ?? "permission",
              },
              options: [],
              _meta: {
                outcome: normalized.decision,
              },
            },
          }),
        ];
      case "tool_use":
        return [
          AcpEnvelopeSchema.parse({
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: normalized.sessionId,
              update: {
                sessionUpdate: "tool_call",
                toolCallId: normalized.command ?? `tool_${Date.now()}`,
                title: "Tool invocation",
                kind: "other",
                status: "pending",
                _meta: {
                  command: normalized.command,
                },
              },
            },
          }),
        ];
      case "token_usage":
        return [
          AcpEnvelopeSchema.parse({
            jsonrpc: "2.0",
            method: "session/update",
            params: {
              sessionId: normalized.sessionId,
              update: {
                sessionUpdate: "agent_message_chunk",
                content: {
                  type: "text",
                  text: "",
                  _meta: {
                    usage: normalized.usage,
                  },
                },
              },
            },
          }),
        ];
      case "noop":
      default:
        return [];
    }
  }

  private normalizeGithubInbound(
    payload: z.infer<typeof GithubJsonRpcEnvelopeSchema>,
  ): z.infer<typeof NormalizedInboundSchema> {
    if (payload.method === "session/cancel") {
      return {
        kind: "cancel",
        sessionId: this.readSessionId(payload.params),
        requestId: payload.id,
      };
    }

    if (payload.method === "session/request_permission") {
      const params = this.asRecord(payload.params);
      return {
        kind: "permission_decision",
        sessionId: this.readSessionId(payload.params),
        requestId: payload.id,
        permissionId: this.asString(params.permissionId),
        decision: this.toDecision(this.asString(params.outcome)),
      };
    }

    const params = this.asRecord(payload.params);
    const promptText = this.asString(params.prompt) ?? this.asString(params.message) ?? "";

    if (params.tool_use && typeof params.tool_use === "object") {
      const tool = params.tool_use as Record<string, unknown>;
      return {
        kind: "tool_use",
        sessionId: this.readSessionId(payload.params),
        requestId: payload.id,
        command: this.asString(tool.command) ?? this.asString(tool.toolName) ?? "tool_use",
      };
    }

    return {
      kind: "prompt",
      sessionId: this.readSessionId(payload.params),
      requestId: payload.id,
      text: promptText,
      meta: this.asRecord(payload.params),
    };
  }

  private normalizeClaudeInbound(
    payload: z.infer<typeof ClaudeMessageSchema>,
  ): z.infer<typeof NormalizedInboundSchema> {
    const record = this.asRecord(payload);
    const baseSessionId = this.asString(record.session_id) ?? "default";
    const type = this.asString(record.type);
    const text = this.asString(record.text);
    const thought = this.asString(record.thought);
    const command = this.asString(record.command);
    const permission = this.asRecord(record.permission);
    const usage = this.asRecord(record.usage);

    if (type === "assistant" && thought) {
      return {
        kind: "prompt",
        sessionId: baseSessionId,
        text: text ?? "",
        thought,
        meta: record,
      };
    }

    if (Object.keys(permission).length > 0) {
      return {
        kind: "permission_decision",
        sessionId: baseSessionId,
        permissionId: this.asString(permission.id) ?? `perm_${Date.now()}`,
        decision: "approved",
      };
    }

    if (command) {
      return {
        kind: "tool_use",
        sessionId: baseSessionId,
        command,
      };
    }

    if (
      this.asString(usage.model) &&
      typeof usage.input_tokens === "number" &&
      typeof usage.output_tokens === "number"
    ) {
      return {
        kind: "token_usage",
        sessionId: baseSessionId,
        usage: {
          model: this.asString(usage.model) ?? "unknown",
          inputTokens: Number(usage.input_tokens),
          outputTokens: Number(usage.output_tokens),
          cachedInputTokens: typeof usage.cache_creation_input_tokens === "number"
            ? Number(usage.cache_creation_input_tokens)
            : undefined,
        },
      };
    }

    if (text) {
      return {
        kind: "prompt",
        sessionId: baseSessionId,
        text,
        thought,
        meta: record,
      };
    }

    return {
      kind: "noop",
      sessionId: baseSessionId,
      meta: record,
    };
  }

  private normalizeAcpOutbound(payload: AcpEnvelope): z.infer<typeof NormalizedOutboundSchema> {
    if ("error" in payload && payload.error) {
      return {
        kind: "error",
        requestId: "id" in payload ? payload.id : undefined,
        error: {
          code: payload.error.code,
          message: payload.error.message,
        },
      };
    }

    if ("result" in payload && payload.result && "id" in payload) {
      const result = this.asRecord(payload.result);
      return {
        kind: "response",
        requestId: payload.id,
        stopReason: this.asString(result.stopReason) ?? "end_turn",
      };
    }

    if ("method" in payload && payload.method === "session/update") {
      const params = this.asRecord(payload.params);
      const update = this.asRecord(params.update);
      const sessionUpdate = this.asString(update.sessionUpdate);
      const sessionId = this.asString(params.sessionId);
      if (sessionUpdate === "agent_message_chunk") {
        const content = this.asRecord(update.content);
        const text = this.asString(content.text) ?? "";
        const thought = this.asString(this.asRecord(content._meta).thought);
        const usage = this.asUsage(this.asRecord(content._meta).usage);
        return {
          kind: "message_chunk",
          sessionId,
          text,
          thought,
          usage,
          meta: this.asRecord(content._meta),
        };
      }
      if (sessionUpdate === "tool_call") {
        return {
          kind: "tool_call",
          sessionId,
          toolCallId: this.asString(update.toolCallId),
          title: this.asString(update.title),
          command: this.asString(this.asRecord(update._meta).command),
          status: this.asString(update.status),
        };
      }
      if (sessionUpdate === "tool_call_update") {
        return {
          kind: "tool_call_update",
          sessionId,
          toolCallId: this.asString(update.toolCallId),
          status: this.asString(update.status),
        };
      }
    }

    if ("method" in payload && payload.method === "session/request_permission") {
      const params = this.asRecord(payload.params);
      return {
        kind: "permission_request",
        requestId: "id" in payload ? payload.id : undefined,
        sessionId: this.asString(params.sessionId),
        permissionId: this.asString(this.asRecord(params.toolCall).toolCallId),
        command: this.asString(this.asRecord(params.toolCall).command),
        title: "Permission required",
      };
    }

    return {
      kind: "noop",
    };
  }

  private toGithubEnvelope(normalized: z.infer<typeof NormalizedOutboundSchema>): unknown {
    switch (normalized.kind) {
      case "message_chunk":
        return {
          jsonrpc: "2.0",
          method: "token_stream",
          params: {
            delta: normalized.text ?? "",
            done: false,
            thought: normalized.thought,
            usage: normalized.usage,
          },
        };
      case "tool_call":
        return {
          jsonrpc: "2.0",
          method: "tool_use",
          params: {
            toolCallId: normalized.toolCallId,
            title: normalized.title,
            command: normalized.command,
            status: normalized.status,
          },
        };
      case "tool_call_update":
        return {
          jsonrpc: "2.0",
          method: "tool_use_update",
          params: {
            toolCallId: normalized.toolCallId,
            status: normalized.status,
          },
        };
      case "permission_request":
        return {
          jsonrpc: "2.0",
          id: normalized.requestId ?? normalized.permissionId ?? Date.now(),
          method: "session/request_permission",
          params: {
            permissionId: normalized.permissionId,
            title: normalized.title,
            command: normalized.command,
            options: ["allow_once", "allow_session", "deny"],
          },
        };
      case "response":
        return {
          jsonrpc: "2.0",
          id: normalized.requestId ?? Date.now(),
          result: {
            stopReason: normalized.stopReason ?? "end_turn",
          },
        };
      case "error":
        return this.githubErrorEnvelope(
          "acp_error",
          normalized.error?.code ?? -32000,
          normalized.error?.message ?? "Unknown ACP error",
          normalized.requestId,
        );
      case "noop":
      default:
        return {
          jsonrpc: "2.0",
          method: "noop",
          params: {},
        };
    }
  }

  private toClaudeEvent(normalized: z.infer<typeof NormalizedOutboundSchema>): unknown {
    switch (normalized.kind) {
      case "message_chunk":
        return {
          type: "assistant",
          subtype: "chunk",
          text: normalized.text ?? "",
          thought: normalized.thought,
          usage: normalized.usage
            ? {
              model: normalized.usage.model,
              input_tokens: normalized.usage.inputTokens,
              output_tokens: normalized.usage.outputTokens,
              cache_creation_input_tokens: normalized.usage.cachedInputTokens,
            }
            : undefined,
        };
      case "tool_call":
        return {
          type: "tool",
          subtype: "call",
          id: normalized.toolCallId,
          title: normalized.title,
          command: normalized.command,
          status: normalized.status ?? "pending",
        };
      case "tool_call_update":
        return {
          type: "tool",
          subtype: "update",
          id: normalized.toolCallId,
          status: normalized.status,
        };
      case "permission_request":
        return {
          type: "permission",
          subtype: "request",
          id: normalized.permissionId,
          title: normalized.title,
          command: normalized.command,
          options: ["allow_once", "allow_session", "deny"],
        };
      case "response":
        return {
          type: "assistant",
          subtype: "final",
          stop_reason: normalized.stopReason ?? "end_turn",
        };
      case "error":
        return {
          type: "error",
          subtype: "acp",
          code: normalized.error?.code ?? -32000,
          message: normalized.error?.message ?? "Unknown ACP error",
        };
      case "noop":
      default:
        return {
          type: "noop",
        };
    }
  }

  private buildProtocolError(requestId: JsonRpcId | string, code: number, message: string): AcpResponse {
    return AcpEnvelopeSchema.parse({
      jsonrpc: "2.0",
      id: requestId,
      error: { code, message },
    }) as AcpResponse;
  }

  private githubErrorEnvelope(type: string, code: number, message: string, requestId?: JsonRpcId): unknown {
    return {
      jsonrpc: "2.0",
      id: requestId ?? Date.now(),
      error: {
        type,
        code,
        message,
      },
    };
  }

  private asRecord(value: unknown): Record<string, unknown> {
    if (value && typeof value === "object") {
      return value as Record<string, unknown>;
    }
    return {};
  }

  private asString(value: unknown): string | undefined {
    return typeof value === "string" ? value : undefined;
  }

  private asUsage(
    value: unknown,
  ): { model: string; inputTokens: number; outputTokens: number; cachedInputTokens?: number } | undefined {
    const record = this.asRecord(value);
    const model = this.asString(record.model);
    const inputTokens = typeof record.inputTokens === "number" ? record.inputTokens : undefined;
    const outputTokens = typeof record.outputTokens === "number" ? record.outputTokens : undefined;
    const cachedInputTokens =
      typeof record.cachedInputTokens === "number" ? record.cachedInputTokens : undefined;
    if (!model || inputTokens === undefined || outputTokens === undefined) {
      return undefined;
    }
    return { model, inputTokens, outputTokens, cachedInputTokens };
  }

  private toDecision(value: string | undefined): "approved" | "denied" | "cancelled" {
    if (value === "allow_once" || value === "allow_session" || value === "approved") {
      return "approved";
    }
    if (value === "cancelled") {
      return "cancelled";
    }
    return "denied";
  }

  private readSessionId(params: unknown): string {
    const record = this.asRecord(params);
    const sessionId = this.asString(record.sessionId);
    return sessionId ?? "default";
  }
}
