import type { JsonRpcId } from "./types.js";

/**
 * Build a JSON-RPC 2.0 error response.
 * @param id - Request id (or null for parse errors).
 * @param code - JSON-RPC error code (e.g. -32600, -32601, -32000).
 * @param message - Fallback message when `errorOrData` is not an Error.
 * @param errorOrData - If Error, its message is used; otherwise message is used. If defined and not Error, set as error.data.
 */
export function jsonRpcError(
  id: JsonRpcId | null,
  code: number,
  message: string,
  errorOrData?: unknown
): { jsonrpc: "2.0"; id: JsonRpcId | null; error: { code: number; message: string; data?: unknown } } {
  const finalMessage = errorOrData instanceof Error ? errorOrData.message : message;
  const data =
    errorOrData !== undefined && !(errorOrData instanceof Error) ? errorOrData : undefined;
  return { jsonrpc: "2.0", id, error: { code, message: finalMessage, ...(data !== undefined && { data }) } };
}

export function jsonRpcResult(
  id: JsonRpcId,
  result: unknown
): { jsonrpc: "2.0"; id: JsonRpcId; result: unknown } {
  return { jsonrpc: "2.0", id, result };
}
