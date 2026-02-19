/**
 * JSON-RPC codec for newline-delimited JSON (stdio) and HTTP.
 */

export function parseJsonRpcLine(line: string): unknown {
  const trimmed = line.trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed) as unknown;
}

export function serializeJsonRpc(obj: unknown): string {
  return JSON.stringify(obj) + "\n";
}
