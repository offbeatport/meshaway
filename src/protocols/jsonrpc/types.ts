import { type } from "arktype";

export const JsonRpcIdSchema = type("string | number");
export type JsonRpcId = typeof JsonRpcIdSchema.infer;

export const JsonRpcRequestSchema = type({
  jsonrpc: "'2.0'",
  id: JsonRpcIdSchema,
  method: "string",
  "params?": "unknown",
});

export const JsonRpcResponseSchema = type({
  jsonrpc: "'2.0'",
  id: JsonRpcIdSchema,
  "result?": "unknown",
  "error?": {
    code: "number",
    message: "string",
    "data?": "unknown",
  },
});

export const JsonRpcNotificationSchema = type({
  jsonrpc: "'2.0'",
  "id?": "null",
  method: "string",
  "params?": "unknown",
});

export type JsonRpcRequest = typeof JsonRpcRequestSchema.infer;
export type JsonRpcResponse = typeof JsonRpcResponseSchema.infer;
export type JsonRpcNotification = typeof JsonRpcNotificationSchema.infer;
