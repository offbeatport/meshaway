import { type } from "arktype";

/** Claude Code / Claude SDK stream message (user, assistant chunk, tool_use_summary, etc.). */
export const ClaudeMessageSchema = type("Record<string, unknown>");

export type ClaudeMessage = typeof ClaudeMessageSchema.infer;
