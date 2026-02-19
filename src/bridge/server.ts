import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { parseListen } from "../shared/net.js";
import { EXIT, exit } from "../shared/errors.js";
import { BridgeEngine } from "./engine.js";

export interface BridgeServerOptions {
  hubUrl?: string;
  backend?: string;
}

export interface BridgeHandle {
  port: number;
  host: string;
  close: () => Promise<void>;
}

export function createBridgeApp(_options: BridgeServerOptions): Hono {
  const app = new Hono();
  const engine = new BridgeEngine(_options);

  app.get("/", (c) => c.json({ server: "meshaway-bridge", version: "0.1.0" }));
  app.get("/health", (c) => c.json({ ok: true }));

  const handleRpc = async (c: import("hono").Context) => {
    const faultLatency = c.req.header("X-Mesh-Fault-Latency");
    const faultDrop = c.req.header("X-Mesh-Fault-Drop");
    const faultError = c.req.header("X-Mesh-Fault-Error");

    if (faultLatency) {
      const ms = Math.min(parseInt(faultLatency, 10) || 0, 30_000);
      if (ms > 0) await new Promise((r) => setTimeout(r, ms));
    }
    if (faultDrop === "1") {
      return new Response(null, { status: 502 });
    }

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

    if (faultError) {
      const id = body && typeof body === "object" && "id" in body ? (body as { id?: unknown }).id : null;
      return c.json(
        { jsonrpc: "2.0", id, error: { code: -32000, message: faultError } },
        200
      );
    }

    const handled = await engine.handleIncoming(body);
    if (!handled.payload) {
      return c.body(null, 204);
    }
    return c.json(handled.payload, handled.status as 200 | 400);
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
