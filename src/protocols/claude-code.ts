import { z } from "zod";

export const ClaudeStreamEventSchema = z
  .object({
    type: z.string(),
    subtype: z.string().optional(),
    id: z.string().optional(),
    role: z.string().optional(),
    text: z.string().optional(),
    thought: z.string().optional(),
    command: z.string().optional(),
    status: z.string().optional(),
    permission: z
      .object({
        id: z.string().optional(),
        kind: z.enum(["read", "write", "bash"]).optional(),
        command: z.string().optional(),
        reason: z.string().optional(),
      })
      .passthrough()
      .optional(),
    usage: z
      .object({
        model: z.string().optional(),
        input_tokens: z.number().optional(),
        output_tokens: z.number().optional(),
        cache_creation_input_tokens: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const ClaudeAssistantInitSchema = z
  .object({
    type: z.literal("assistant"),
    subtype: z.literal("init"),
    session_id: z.string().optional(),
    model: z.string().optional(),
  })
  .passthrough();

export const ClaudeAssistantChunkSchema = z
  .object({
    type: z.literal("assistant"),
    subtype: z.enum(["chunk", "delta", "final"]).optional(),
    text: z.string().optional(),
    thought: z.string().optional(),
  })
  .passthrough();

export const ClaudeMessageSchema = z.union([
  ClaudeStreamEventSchema,
  ClaudeAssistantInitSchema,
  ClaudeAssistantChunkSchema,
]);

export type ClaudeMessage = z.infer<typeof ClaudeMessageSchema>;
