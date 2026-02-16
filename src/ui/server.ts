import { randomBytes } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ObserverEvent, PermissionDecision } from "../types.js";
import { ObserverEventBus } from "./events.js";

export interface ObserverServerOptions {
  eventBus: ObserverEventBus;
  onPermissionDecision: (id: string, decision: PermissionDecision) => boolean;
  portStart?: number;
}

export interface ObserverServerHandle {
  port: number;
  token: string;
  close: () => Promise<void>;
}

export async function startObserverServer(options: ObserverServerOptions): Promise<ObserverServerHandle> {
  const port = await findOpenPort(options.portStart ?? 1618);
  const token = randomBytes(24).toString("hex");
  const app = new Hono();
  app.use("*", cors());

  const assets = await loadUiAssets();

  app.get("/", (c) => {
    if (!hasValidToken(c.req.query("token"), token)) {
      return c.text("Unauthorized observer access", 401);
    }
    return c.html(renderHtml(token, assets.css));
  });

  app.get("/dashboard.js", (c) => {
    if (!hasValidToken(c.req.query("token"), token)) {
      return c.text("Unauthorized observer access", 401);
    }
    c.header("content-type", "text/javascript; charset=utf-8");
    return c.body(assets.dashboardJs);
  });

  app.get("/events", (c) => {
    if (!hasValidToken(c.req.query("token"), token)) {
      return c.text("Unauthorized observer access", 401);
    }
    c.header("content-type", "text/event-stream");
    c.header("cache-control", "no-cache");
    c.header("connection", "keep-alive");

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        const unsubscribe = options.eventBus.subscribe((event: ObserverEvent) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        });
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "ready", payload: { ok: true } })}\n\n`));

        const cancel = () => {
          unsubscribe();
          controller.close();
        };
        c.req.raw.signal?.addEventListener("abort", cancel, { once: true });
      },
    });

    return new Response(stream);
  });

  app.post("/permission/:id", async (c) => {
    const id = c.req.param("id");
    const bodyUnknown = await c.req.json<{ token?: string; decision?: string }>().catch(() => ({} as unknown));
    const body = (bodyUnknown && typeof bodyUnknown === "object"
      ? (bodyUnknown as { token?: string; decision?: string })
      : {}) as { token?: string; decision?: string };
    if (!hasValidToken(body.token, token)) {
      return c.json({ ok: false, error: "unauthorized" }, 401);
    }
    const decision = toDecision(body.decision);
    const ok = options.onPermissionDecision(id, decision);
    return c.json({ ok });
  });

  const nodeServer = serve({
    fetch: app.fetch,
    port,
    hostname: "127.0.0.1",
  });

  return {
    port,
    token,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        nodeServer.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

async function loadUiAssets(): Promise<{ dashboardJs: string; css: string }> {
  const candidates = [
    process.env.MESHAWAY_UI_ASSET_DIR,
    path.resolve(process.cwd(), "dist", "ui"),
    path.resolve(path.dirname(process.execPath), "ui"),
    path.resolve(process.cwd(), "src", "ui"),
  ].filter((value): value is string => Boolean(value));

  for (const base of candidates) {
    const jsPath = path.resolve(base, "dashboard.js");
    const cssPath = path.resolve(base, "index.css");
    if (await exists(jsPath) && await exists(cssPath)) {
      const [dashboardJs, css] = await Promise.all([readFile(jsPath, "utf8"), readFile(cssPath, "utf8")]);
      return { dashboardJs, css };
    }
  }

  throw new Error(
    "Observer UI assets not found. Run `npm run build` first or set MESHAWAY_UI_ASSET_DIR to a valid asset folder.",
  );
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findOpenPort(start: number): Promise<number> {
  let port = start;
  // Keep incrementing until we find an available local port.
  for (;;) {
    const available = await isPortAvailable(port);
    if (available) {
      return port;
    }
    port += 1;
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

function hasValidToken(input: string | undefined, token: string): boolean {
  return typeof input === "string" && input.length > 0 && input === token;
}

function toDecision(value: string | undefined): PermissionDecision {
  if (value === "approved") {
    return "approved";
  }
  if (value === "cancelled") {
    return "cancelled";
  }
  return "denied";
}

function renderHtml(token: string, css: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Meshaway Observer</title>
    <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    <style type="text/tailwindcss">
${css}
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script>
      window.__MESH_OBSERVER_CONFIG__ = {
        token: ${JSON.stringify(token)},
        eventsUrl: "/events",
        permissionUrl: "/permission/:id"
      };
    </script>
    <script type="module" src="/dashboard.js?token=${encodeURIComponent(token)}"></script>
  </body>
</html>`;
}
