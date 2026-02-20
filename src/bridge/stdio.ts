/**
 * Bridge stdio mode: stdin = JSON-RPC in, stdout = JSON-RPC out, stderr = logs.
 */

import { createInterface } from "node:readline";
import { BridgeEngine } from "./engine.js";

function writeResponse(obj: unknown): void {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

export function runStdioBridge(agent?: string, agentArgs?: string[]): void {
  const engine = new BridgeEngine({ agent, agentArgs });
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let stdinClosed = false;

  rl.on("line", async (line) => {
    let body: unknown;
    try {
      body = JSON.parse(line) as unknown;
    } catch {
      writeResponse({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      });
      if (stdinClosed) engine.close();
      return;
    }

    const handled = await engine.handleIncoming(body);
    if (handled.payload) {
      writeResponse(handled.payload);
    }
    if (stdinClosed) engine.close();
  });

  rl.on("close", () => {
    stdinClosed = true;
  });
}
