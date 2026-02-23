/**
 * Bridge adapters: bridge is started with a single adapter (--client copilot | claude | acp).
 * - BridgeAdapter: abstract base with shared helpers (requestAgent, addFrame, ensureSession, …).
 * - AcpAdapter: client speaks ACP → forward to agent → ACP response (passthrough).
 * - CopilotAdapter: client speaks Copilot → convert to ACP → agent → convert back to Copilot.
 * - ClaudeAdapter: stub for Claude protocol.
 */

export { BridgeAdapter } from "./base.js";
export { AcpAdapter } from "./acp.js";
export { CopilotAdapter } from "./copilot.js";
export { ClaudeAdapter } from "./claude.js";
export type { AdapterContext } from "./context.js";
export type { BridgeResponse, JsonRpcId } from "./types.js";

import type { AdapterContext } from "./context.js";
import type { BridgeAdapter } from "./base.js";
import { AcpAdapter } from "./acp.js";
import { CopilotAdapter } from "./copilot.js";
import { ClaudeAdapter } from "./claude.js";

export type BridgeAdapterKind = "copilot" | "claude" | "acp";

export const BRIDGE_ADAPTER_KINDS: readonly BridgeAdapterKind[] = ["copilot", "claude", "acp"];

export function createBridgeAdapter(kind: BridgeAdapterKind, ctx: AdapterContext): BridgeAdapter {
  switch (kind) {
    case "acp":
      return new AcpAdapter(ctx);
    case "copilot":
      return new CopilotAdapter(ctx);
    case "claude":
      return new ClaudeAdapter(ctx);
    default:
      throw new Error(`Unknown bridge adapter kind: ${kind}`);
  }
}
