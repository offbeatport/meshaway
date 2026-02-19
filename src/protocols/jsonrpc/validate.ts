import { type } from "arktype";
import type { JsonRpcRequest, JsonRpcResponse } from "./types.js";

const EnvelopeSchema = type({
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

export function parseEnvelope(data: unknown): JsonRpcRequest | JsonRpcResponse {
  const result = EnvelopeSchema(data);
  if (result instanceof type.errors) {
    throw new Error(`Invalid JSON-RPC: ${result.summary}`);
  }
  return result as JsonRpcRequest | JsonRpcResponse;
}

export function isRequest(
  msg: JsonRpcRequest | JsonRpcResponse
): msg is JsonRpcRequest {
  return "method" in msg && msg.method !== undefined;
}

export function isResponse(
  msg: JsonRpcRequest | JsonRpcResponse
): msg is JsonRpcResponse {
  return "result" in msg || "error" in msg;
}
