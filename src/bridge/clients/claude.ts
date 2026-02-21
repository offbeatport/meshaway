/**
 * Claude client: would accept Claude protocol, convert to ACP → agent → convert back to Claude.
 * Stub only for now.
 */

import { BridgeClient, type JsonRpcId } from "./shared/index.js";

export class ClaudeClient extends BridgeClient {
  supportedMethods(): readonly string[] {
    return []; // No Claude methods wired yet
  }

  async handle(id: JsonRpcId, _method: string, _params: unknown) {
    return this.error(id, -32601, "Claude protocol not implemented");
  }
}
