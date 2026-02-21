/**
 * Client adapters: bridge is started with a single client (--client copilot | claude | acp).
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

export type BridgeClientKind = "copilot" | "claude" | "acp";

export const BRIDGE_CLIENT_KINDS: readonly BridgeClientKind[] = ["copilot", "claude", "acp"];

export function createBridgeClient(kind: BridgeClientKind, ctx: ClientAdapterContext): BridgeClient {
  switch (kind) {
    case "acp":
      return new AcpClient(ctx);
    case "copilot":
      return new CopilotClient(ctx);
    case "claude":
      return new ClaudeClient(ctx);
  }
}
