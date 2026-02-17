import { z } from "zod";

export const GithubJsonRpcEnvelopeSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number()]).optional(),
    method: z.string().optional(),
    params: z.unknown().optional(),
    result: z.unknown().optional(),
    error: z
      .object({
        code: z.number(),
        message: z.string(),
        data: z.unknown().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const GithubPromptParamsSchema = z
  .object({
    prompt: z.string().optional(),
    context: z.array(z.record(z.string(), z.unknown())).optional(),
    sessionId: z.string().optional(),
  })
  .passthrough();

export const GithubToolUseSchema = z
  .object({
    type: z.literal("tool_use"),
    toolName: z.string().optional(),
    command: z.string().optional(),
    arguments: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

export const GithubTokenStreamSchema = z
  .object({
    type: z.literal("token_stream"),
    delta: z.string().optional(),
    done: z.boolean().optional(),
  })
  .passthrough();

export const GithubMessageSchema = z.union([
  GithubJsonRpcEnvelopeSchema,
  GithubPromptParamsSchema,
  GithubToolUseSchema,
  GithubTokenStreamSchema,
]);

export type GithubMessage = z.infer<typeof GithubMessageSchema>;
