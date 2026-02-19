import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { EXIT, exit } from "../shared/errors.js";
import { sessionStore } from "./store/memory.js";
import { resolveApproval, listPendingApprovals } from "./governance/approvals.js";
import { getDefaultBackend } from "./governance/policy.js";

function findUiDir(): string | null {
  const abs = join(process.cwd(), "dist", "ui");
  if (existsSync(abs)) return "dist/ui";
  const absParent = join(process.cwd(), "..", "dist", "ui");
  if (existsSync(absParent)) return join("..", "dist", "ui");
  return null;
}

export interface HubServeOptions {
  host: string;
  port: number;
}

export interface HubHandle {
  port: number;
  host: string;
  close: () => Promise<void>;
}

export function createHubApp(): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/api/health", async (c) => {
    const backend = getDefaultBackend();
    return c.json({
      hub: true,
      backend: backend ?? "not configured",
      bridgeUrl: "http://127.0.0.1:4321",
    });
  });
  app.get("/api/approvals", (c) =>
    c.json(listPendingApprovals())
  );
  app.get("/api/routing/rules", (c) => {
    const backend = getDefaultBackend();
    return c.json({ rules: backend ? [{ backend }] : [] });
  });
  app.get("/api/sessions", (c) => c.json(sessionStore.listSessions()));
  app.post("/api/sessions", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { sessionId?: string };
    const session = sessionStore.createSession();
    return c.json(session);
  });
  app.get("/api/sessions/:id", (c) => {
    const session = sessionStore.getSession(c.req.param("id"));
    if (!session) return c.json({ error: "Not found" }, 404);
    return c.json(session);
  });
  app.get("/api/sessions/:id/frames", (c) => {
    const frames = sessionStore.getFrames(c.req.param("id"));
    return c.json(frames);
  });
  app.post("/api/admin/kill/:id", (c) => {
    const ok = sessionStore.killSession(c.req.param("id"));
    return c.json({ ok });
  });
  app.post("/api/admin/approve/:id", async (c) => {
    const body = (await c.req.json()) as { toolCallId?: string; decision?: string };
    const sessionId = c.req.param("id");
    const toolCallId = body.toolCallId ?? "";
    const decision = body.decision === "approve";
    const ok = resolveApproval(sessionId, toolCallId, decision);
    return c.json({ ok });
  });
  app.post("/api/routing/rules", async (c) => {
    const body = (await c.req.json()) as { backend?: string };
    if (body.backend) {
      const { setDefaultBackend } = await import("./governance/policy.js");
      setDefaultBackend(body.backend);
    }
    return c.json({ ok: true });
  });

  const uiDir = findUiDir();
  if (uiDir) {
    app.use("/assets/*", serveStatic({ root: uiDir }));
    app.get("/", serveStatic({ path: "index.html", root: uiDir }));
    app.get("/sessions/*", serveStatic({ path: "index.html", root: uiDir }));
    app.get("/approvals", serveStatic({ path: "index.html", root: uiDir }));
    app.get("/routing", serveStatic({ path: "index.html", root: uiDir }));
    app.get("/system", serveStatic({ path: "index.html", root: uiDir }));
  } else {
    app.get("/", (c) =>
      c.html(
        "<!DOCTYPE html><html><body><h1>Meshaway Hub</h1><p>UI not built. Run <code>pnpm run build</code>.</p></body></html>"
      )
    );
  }

  return app;
}

export async function startHub(options: HubServeOptions): Promise<HubHandle> {
  const app = createHubApp();
  const { host, port } = options;

  const nodeServer = serve({
    fetch: app.fetch,
    port,
    hostname: host,
  });

  nodeServer.on("error", (err: NodeJS.ErrnoException) => {
    if (err?.code === "EADDRINUSE") {
      process.stderr.write(
        `ERROR: Cannot listen on ${host}:${port} (EADDRINUSE).\nFix: choose a different port with --hub-listen ${host}:<port>\n`
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
