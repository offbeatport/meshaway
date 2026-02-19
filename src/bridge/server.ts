import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { parseListen } from "../shared/net.js";
import { EXIT, exit } from "../shared/errors.js";

export interface BridgeServerOptions {
  hubUrl?: string;
  backend?: string;
}

export interface BridgeHandle {
  port: number;
  host: string;
  close: () => Promise<void>;
}

function getRequestId(payload: unknown): string | number | undefined {
  if (payload === null || typeof payload !== "object") return undefined;
  const rec = payload as Record<string, unknown>;
  const id = rec.id;
  if (id === undefined) return undefined;
  if (typeof id === "string" || typeof id === "number") return id;
  return undefined;
}

export function createBridgeApp(_options: BridgeServerOptions): Hono {
  const app = new Hono();

  app.get("/", (c) => c.json({ server: "meshaway-bridge", version: "0.1.0" }));
  app.get("/health", (c) => c.json({ ok: true }));

  const handleRpc = async (c: import("hono").Context) => {
    let body: unknown;
    try {
      const raw = await c.req.text();
      if (!raw || raw.trim() === "") {
        return c.json(
          { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
          400
        );
      }
      body = JSON.parse(raw) as unknown;
    } catch {
      return c.json(
        { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
        400
      );
    }

    const requestId = getRequestId(body);
    if (requestId === undefined) {
      return c.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32600, message: "Invalid request" },
        },
        400
      );
    }

    const rec = body as Record<string, unknown>;
    const method = rec.method as string;

    if (method === "initialize") {
      return c.json({
        jsonrpc: "2.0",
        id: requestId,
        result: {
          protocolVersion: 1,
          serverInfo: { name: "meshaway", version: "0.1.0" },
        },
      });
    }

    return c.json({
      jsonrpc: "2.0",
      id: requestId,
      error: {
        code: -32601,
        message: `Method not implemented: ${method}`,
      },
    });
  };

  app.post("/", handleRpc);
  app.post("/rpc", handleRpc);

  return app;
}

export async function startBridgeServer(
  listen: string,
  options: BridgeServerOptions
): Promise<BridgeHandle> {
  const { host, port } = parseListen(listen);
  const app = createBridgeApp(options);

  const nodeServer = serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });

  nodeServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err?.code === "EADDRINUSE") {
      process.stderr.write(
        `ERROR: Cannot listen on ${host}:${port} (EADDRINUSE).\nFix: choose a different port with --listen ${host}:<port>\n`
      );
      exit(EXIT.SERVER_FAILURE);
    }
    throw err;
  });

  return {
    host,
    port,
    close: () =>
      new Promise((resolve, reject) => {
        nodeServer.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
