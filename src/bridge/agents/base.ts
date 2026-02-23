/**
 * Abstract base for bridge agents (e.g. ACP over stdio).
 * Subclasses implement request/response with the agent process.
 */
export abstract class BridgeAgent {
  /** Send a JSON-RPC request to the agent and return the result. */
  abstract request(method: string, params: unknown, timeoutMs?: number): Promise<unknown>;

  /** Close the agent process and release resources. */
  abstract close(): void;
}
