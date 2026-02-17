import { z } from "zod";

/** Claude Code / Claude SDK stream message (user, assistant chunk, tool_use_summary, etc.). */
export const ClaudeMessageSchema = z.record(z.string(), z.unknown());
