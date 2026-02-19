import { type } from "arktype";

/** Copilot SDK / GitHub dialect JSON-RPC envelope. */
export const CopilotJsonRpcEnvelopeSchema = type({
  jsonrpc: "'2.0'",
  "id?": "string | number",
  "method?": "string",
  "params?": "unknown",
  "result?": "unknown",
  "error?": {
    code: "number",
    message: "string",
    "data?": "unknown",
  },
});

export const CopilotPromptParamsSchema = type({
  "prompt?": "string",
  "context?": "Record<string, unknown>[]",
  "sessionId?": "string",
});

export const CopilotToolUseSchema = type({
  type: "'tool_use'",
  "toolName?": "string",
  "command?": "string",
  "arguments?": "Record<string, unknown>",
});

export const CopilotTokenStreamSchema = type({
  type: "'token_stream'",
  "delta?": "string",
  "done?": "boolean",
});

export type CopilotJsonRpcEnvelope = typeof CopilotJsonRpcEnvelopeSchema.infer;
export type CopilotPromptParams = typeof CopilotPromptParamsSchema.infer;
export type CopilotToolUse = typeof CopilotToolUseSchema.infer;
export type CopilotTokenStream = typeof CopilotTokenStreamSchema.infer;
