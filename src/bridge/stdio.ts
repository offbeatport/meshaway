/**
 * Bridge stdio mode: stdin = JSON-RPC in, stdout = JSON-RPC out, stderr = logs.
 */

import { createInterface } from "node:readline";

function getRequestId(payload: unknown): string | number | undefined {
  if (payload === null || typeof payload !== "object") return undefined;
  const rec = payload as Record<string, unknown>;
  const id = rec.id;
  if (id === undefined) return undefined;
  if (typeof id === "string" || typeof id === "number") return id;
  return undefined;
}

function writeResponse(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

export function runStdioBridge(): void {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });

  rl.on("line", (line) => {
    let body: unknown;
    try {
      body = JSON.parse(line) as unknown;
    } catch {
      writeResponse({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      });
      return;
    }

    const requestId = getRequestId(body);
    if (requestId === undefined) {
      writeResponse({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: "Invalid request" },
      });
      return;
    }

    const rec = body as Record<string, unknown>;
    const method = rec.method as string;

    if (method === "initialize") {
      writeResponse({
        jsonrpc: "2.0",
        id: requestId,
        result: {
          protocolVersion: 1,
          serverInfo: { name: "meshaway", version: "0.1.0" },
        },
      });
      return;
    }

    writeResponse({
      jsonrpc: "2.0",
      id: requestId,
      error: {
        code: -32601,
        message: `Method not implemented: ${method}`,
      },
    });
  });
}
