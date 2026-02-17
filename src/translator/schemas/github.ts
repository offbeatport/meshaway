import { type } from "arktype";

export const GithubJsonRpcEnvelopeSchema = type({
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

export const GithubPromptParamsSchema = type({
  "prompt?": "string",
  "context?": "Record<string, unknown>[]",
  "sessionId?": "string",
});

export const GithubToolUseSchema = type({
  type: "'tool_use'",
  "toolName?": "string",
  "command?": "string",
  "arguments?": "Record<string, unknown>",
});

export const GithubTokenStreamSchema = type({
  type: "'token_stream'",
  "delta?": "string",
  "done?": "boolean",
});

export const GithubMessageSchema = type.or(
  GithubJsonRpcEnvelopeSchema,
  GithubPromptParamsSchema,
  GithubToolUseSchema,
  GithubTokenStreamSchema,
);

export type GithubMessage = typeof GithubMessageSchema.infer;
