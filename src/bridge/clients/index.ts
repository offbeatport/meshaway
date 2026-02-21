/**
 * Client adapters: each client (Copilot, ACP, Claude, …) sends its protocol to the bridge.
 * Add a new client: create a class extending BridgeClient, implement canHandle/handle, add to createBridgeClients.
 *
 * - BridgeClient: abstract base with shared helpers (requestAcp, addFrame, ensureSession, …).
 * - AcpClient: client speaks ACP → forward to agent → ACP response (passthrough).
 * - CopilotClient: client speaks Copilot → convert to ACP → agent → convert back to Copilot.
 * - ClaudeClient: stub for Claude protocol.
 */

export { BridgeClient } from "./shared/index.js";
export { AcpClient } from "./acp.js";
export { CopilotClient } from "./copilot.js";
export { ClaudeClient } from "./claude.js";
export type { ClientAdapterContext, BridgeResponse, JsonRpcId } from "./shared/index.js";

import type { ClientAdapterContext, BridgeClient } from "./shared/index.js";
import { AcpClient } from "./acp.js";
import { CopilotClient } from "./copilot.js";
import { ClaudeClient } from "./claude.js";

/** Create all bridge clients with the given context. Engine uses this and routes by canHandle(method). */
export function createBridgeClients(ctx: ClientAdapterContext): BridgeClient[] {
  return [new AcpClient(ctx), new CopilotClient(ctx), new ClaudeClient(ctx)];
}

/** Build a method -> client routing table once. Throws if methods overlap. */
export function createBridgeClientRouter(ctx: ClientAdapterContext): ReadonlyMap<string, BridgeClient> {
  const map = new Map<string, BridgeClient>();
  for (const client of createBridgeClients(ctx)) {
    for (const method of client.supportedMethods()) {
      if (map.has(method)) {
        throw new Error(`Duplicate bridge client handler for method: ${method}`);
      }
      map.set(method, client);
    }
  }
  return map;
}
