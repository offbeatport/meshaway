/** JSON-RPC id for request/response correlation. */
export type JsonRpcId = string | number;

/** Bridge JSON-RPC response envelope (success or error). */
export type BridgeResponse =
  | { jsonrpc: "2.0"; id: JsonRpcId; result: unknown }
  | {
      jsonrpc: "2.0";
      id: JsonRpcId | null;
      error: { code: number; message: string; data?: unknown };
    };
