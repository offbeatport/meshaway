/**
 * Bridge stdio mode: stdin/stdout use LSP/vscode-jsonrpc format (Content-Length header + JSON body).
 * stderr = logs only.
 */

import { BridgeEngine } from "./engine.js";
import { AgentStartError } from "../shared/errors.js";
import { EXIT } from "../shared/errors.js";

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

export async function runStdioBridge(agent?: string, agentArgs?: string[]): Promise<void> {
  const engine = new BridgeEngine({ agent, agentArgs });
  if (agent) {
    try {
      await engine.startAgent();
    } catch (err) {
      const message = err instanceof AgentStartError ? err.message : (err instanceof Error ? err.message : "Agent failed to start");
      process.stderr.write(`Agent: ${message}\n`);
      process.exit(EXIT.AGENT_FAILURE);
    }
  }
  let stdinClosed = false;
  let buffer = Buffer.alloc(0);
  let expectingBody = false;
  let bodyLength = 0;

  process.stdin.on("data", async (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (; ;) {
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
        writeResponse({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error", data: { body: bodyBytes.toString("utf8").slice(0, 80) } },
        });
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
