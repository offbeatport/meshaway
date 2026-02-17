import { serve } from "@hono/node-server";
import { Hono } from "hono";

export interface ServerServeOptions {
  host: string;
  port: number;
  auth: "none" | "token" | "oidc" | "mtls";
  token?: string;
  publicUrl?: string;
}

/**
 * Parse --listen value (e.g. "127.0.0.1:7777" or "7777") into host and port.
 */
export function parseListen(listen: string): { host: string; port: number } {
  const defaultHost = "127.0.0.1";
  const defaultPort = 7777;
  if (!listen || listen === "") {
    return { host: defaultHost, port: defaultPort };
  }
  const colon = listen.lastIndexOf(":");
  if (colon === -1) {
    const port = parseInt(listen, 10);
    if (Number.isNaN(port) || port <= 0 || port > 65535) {
      return { host: defaultHost, port: defaultPort };
    }
    return { host: defaultHost, port };
  }
  const host = listen.slice(0, colon).trim() || defaultHost;
  const port = parseInt(listen.slice(colon + 1), 10);
  if (Number.isNaN(port) || port <= 0 || port > 65535) {
    return { host, port: defaultPort };
  }
  return { host, port };
}

export interface ServerHandle {
  port: number;
  host: string;
  close: () => Promise<void>;
}

/**
 * Start the Meshaway server (minimal HTTP server for remote SDKs and stdio shims).
 */
export async function startServer(options: ServerServeOptions): Promise<ServerHandle> {
  const app = new Hono();

  app.get("/", (c) => c.json({ server: true, version: "0.1.0" }));
  app.get("/health", (c) => c.json({ ok: true }));

  if (options.auth === "token" && options.token) {
    app.use("*", async (c, next) => {
      const auth = c.req.header("authorization");
      const token = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice(7) : c.req.query("token");
      if (token !== options.token) {
        return c.json({ error: "Unauthorized" }, 401);
      }
      await next();
    });
  }

  const nodeServer = serve({
    fetch: app.fetch,
    port: options.port,
    hostname: options.host,
  });

  return {
    port: options.port,
    host: options.host,
    close: () =>
      new Promise((resolve, reject) => {
        nodeServer.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}
