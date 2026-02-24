/**
 * Bridge stdio mode: stdin/stdout use LSP/vscode-jsonrpc format (Content-Length header + JSON body).
 * stderr = logs only.
 */

import { jsonRpcError } from "../protocols/jsonrpc/response.js";
import { isResponse } from "../protocols/jsonrpc/validate.js";
import type { JsonRpcRequest, JsonRpcResponse } from "../protocols/jsonrpc/types.js";
import type { BridgeAdapterKind } from "./adaptors/index.js";
import { BridgeEngine } from "./engine.js";

const HEADER_END = "\r\n\r\n";

function writeResponse(obj: unknown): void {
  const body = JSON.stringify(obj);
  const buf = Buffer.from(body, "utf8");
  process.stdout.write(`Content-Length: ${buf.length}\r\n\r\n`, "utf8");
  process.stdout.write(buf);
}

function readContentLengthHeader(header: string): number | null {
  const match = /Content-Length:\s*(\d+)/i.exec(header);
  return match ? parseInt(match[1], 10) : null;
}

export interface StdioBridgeOptions {
  hubUrl?: string;
  runnerSessionId?: string;
}

export async function runStdioBridge(
  adapter: BridgeAdapterKind,
  agent: string,
  agentArgs: string[] = [],
  options: StdioBridgeOptions = {}
): Promise<void> {
  let nextClientReqId = 1;
  const pendingClientRequests = new Map<
    string | number,
    { resolve: (value: unknown) => void; reject: (err: Error) => void }
  >();
  const sendRequestToClient = (method: string, params: unknown): Promise<unknown> => {
    const id = nextClientReqId++;
    const payload = { jsonrpc: "2.0" as const, id, method, params };
    writeResponse(payload);
    return new Promise((resolve, reject) => {
      pendingClientRequests.set(id, { resolve, reject });
    });
  };

  const engine = new BridgeEngine({
    adapter,
    agent,
    agentArgs,
    hubUrl: options.hubUrl,
    runnerSessionId: options.runnerSessionId,
    sendToClient: (payload) => writeResponse(payload),
    sendRequestToClient,
  });
  try {
    await engine.startAgent();
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : "Agent failed to start");
  }
  let stdinClosed = false;
  let buffer = Buffer.alloc(0);
  let expectingBody = false;
  let bodyLength = 0;

  process.stdin.on("data", async (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    while (true) {
      if (!expectingBody) {
        const idx = buffer.indexOf(HEADER_END);
        if (idx === -1) break;
        const header = buffer.subarray(0, idx).toString("utf8");
        buffer = buffer.subarray(idx + HEADER_END.length);
        bodyLength = readContentLengthHeader(header) ?? 0;
        expectingBody = true;
      }
      if (buffer.length < bodyLength) break;
      const bodyBytes = buffer.subarray(0, bodyLength);
      buffer = buffer.subarray(bodyLength);
      expectingBody = false;
      let body: unknown;
      try {
        body = JSON.parse(bodyBytes.toString("utf8")) as unknown;
      } catch {
        writeResponse(jsonRpcError(null, -32700, "Parse error", { body: bodyBytes.toString("utf8").slice(0, 80) }));
        if (stdinClosed) engine.close();
        continue;
      }
      const envelope = body as JsonRpcRequest | JsonRpcResponse;
      if (isResponse(envelope) && envelope.id !== undefined && pendingClientRequests.has(envelope.id)) {
        const pending = pendingClientRequests.get(envelope.id)!;
        pendingClientRequests.delete(envelope.id);
        if ("error" in envelope && envelope.error) {
          pending.reject(new Error(typeof envelope.error === "object" && envelope.error && "message" in envelope.error ? String(envelope.error.message) : "Client error"));
        } else {
          pending.resolve(("result" in envelope ? envelope.result : undefined));
        }
        if (stdinClosed) engine.close();
        continue;
      }
      const handled = await engine.handleIncoming(body);
      if (handled.payload) {
        writeResponse(handled.payload);
      }
      if (stdinClosed) engine.close();
    }
  });

  process.stdin.on("end", () => {
    stdinClosed = true;
  });
}
