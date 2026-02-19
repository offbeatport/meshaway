import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { EXIT, exit } from "../shared/errors.js";
import { sessionStore } from "./store/memory.js";
import { resolveApproval, listPendingApprovals } from "./governance/approvals.js";
import { getDefaultBackend } from "./governance/policy.js";
import { markKilled } from "../bridge/interceptors/killswitch.js";
import { EMBEDDED_UI } from "./embedded-ui.generated.js";

function findUiDir(): string | null {
  const abs = join(process.cwd(), "dist", "ui");
  if (existsSync(abs)) return abs;
  const absParent = join(process.cwd(), "..", "dist", "ui");
  if (existsSync(absParent)) return absParent;
  return null;
}

function getMimeType(path: string): string {
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  if (path.endsWith(".js")) return "application/javascript; charset=utf-8";
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  return "application/octet-stream";
}

function serveEmbeddedUi(app: Hono): void {
  const fallbackHtml =
    "<!DOCTYPE html><html><body><h1>Meshaway Hub</h1><p>UI not built.</p></body></html>";
  const html = EMBEDDED_UI["index.html"] ?? fallbackHtml;

  app.get("/assets/*", (c) => {
    const path = c.req.path.startsWith("/") ? c.req.path.slice(1) : c.req.path;
    const content = EMBEDDED_UI[path];
    if (content) {
      return new Response(content, {
        headers: { "Content-Type": getMimeType(path) },
      });
    }
    return c.notFound();
  });
  app.get("/", () => new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
  app.get("/sessions", () => new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
  app.get("/sessions/*", () => new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
  app.get("/approvals", () => new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
  app.get("/routing", () => new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
  app.get("/system", () => new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
  app.get("/playground", () => new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } }));
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
  app.get("/api/sessions/:id/export", (c) => {
    const id = c.req.param("id");
    const frames = sessionStore.getFrames(id);
    const jsonl = frames.map((f) => JSON.stringify(f)).join("\n");
    return new Response(jsonl || "\n", {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Content-Disposition": `attachment; filename="session-${id}.jsonl"`,
      },
    });
  });
  app.post("/api/admin/kill/:id", (c) => {
    const id = c.req.param("id");
    const ok = sessionStore.killSession(id);
    if (ok) markKilled(id);
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

  const defaultBridgeUrl = process.env.MESH_BRIDGE_URL ?? "http://127.0.0.1:4321";

  async function proxyToBridge(
    bridgeUrl: string,
    rpc: { jsonrpc: string; id?: number; method: string; params?: unknown },
    faultHeaders?: Record<string, string>
  ): Promise<Response> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...faultHeaders,
    };
    const res = await fetch(`${bridgeUrl}/`, {
      method: "POST",
      headers,
      body: JSON.stringify(rpc),
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.ok ? 200 : res.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  app.post("/api/playground/send", async (c) => {
    let body: { prompt?: string; sessionId?: string; bridgeUrl?: string; faultLatency?: number; faultDrop?: boolean; faultError?: string };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : undefined;
    const bridgeUrl = (typeof body.bridgeUrl === "string" && body.bridgeUrl)
      ? body.bridgeUrl.replace(/\/+$/, "")
      : defaultBridgeUrl;
    const faultHeaders: Record<string, string> = {};
    if (typeof body.faultLatency === "number" && body.faultLatency > 0) faultHeaders["X-Mesh-Fault-Latency"] = String(body.faultLatency);
    if (body.faultDrop === true) faultHeaders["X-Mesh-Fault-Drop"] = "1";
    if (typeof body.faultError === "string" && body.faultError) faultHeaders["X-Mesh-Fault-Error"] = body.faultError;
    const rpc = {
      jsonrpc: "2.0",
      id: 1,
      method: "prompt",
      params: { prompt, ...(sessionId ? { sessionId } : {}) },
    };
    try {
      const res = await proxyToBridge(bridgeUrl, rpc, faultHeaders);
      const data = await res.json();
      return c.json(data, res.status as 200 | 400 | 502);
    } catch (err) {
      return c.json({
        jsonrpc: "2.0",
        id: 1,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : "Bridge request failed",
        },
      }, 502);
    }
  });

  app.post("/api/playground/rpc", async (c) => {
    let body: { bridgeUrl?: string; method: string; params?: unknown; id?: number; faultLatency?: number; faultDrop?: boolean; faultError?: string };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const bridgeUrl = (typeof body.bridgeUrl === "string" && body.bridgeUrl)
      ? body.bridgeUrl.replace(/\/+$/, "")
      : defaultBridgeUrl;
    const faultHeaders: Record<string, string> = {};
    if (typeof body.faultLatency === "number" && body.faultLatency > 0) faultHeaders["X-Mesh-Fault-Latency"] = String(body.faultLatency);
    if (body.faultDrop === true) faultHeaders["X-Mesh-Fault-Drop"] = "1";
    if (typeof body.faultError === "string" && body.faultError) faultHeaders["X-Mesh-Fault-Error"] = body.faultError;
    const rpc = {
      jsonrpc: "2.0",
      id: body.id ?? 1,
      method: body.method,
      params: body.params ?? {},
    };
    try {
      const res = await proxyToBridge(bridgeUrl, rpc, faultHeaders);
      const data = await res.json();
      return c.json(data, res.status as 200 | 400 | 502);
    } catch (err) {
      return c.json({
        jsonrpc: "2.0",
        id: rpc.id,
        error: {
          code: -32603,
          message: err instanceof Error ? err.message : "Bridge request failed",
        },
      }, 502);
    }
  });

  app.post("/api/playground/replay", async (c) => {
    let body: { bridgeUrl?: string; entries?: Array<{ method: string; params?: unknown }> };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const bridgeUrl = (typeof body.bridgeUrl === "string" && body.bridgeUrl)
      ? body.bridgeUrl.replace(/\/+$/, "")
      : defaultBridgeUrl;
    const entries = Array.isArray(body.entries) ? body.entries : [];
    const results: unknown[] = [];
    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      const method = typeof e?.method === "string" ? e.method : "prompt";
      const params = e?.params ?? {};
      const rpc = { jsonrpc: "2.0", id: i + 1, method, params };
      try {
        const res = await fetch(`${bridgeUrl}/`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rpc),
        });
        const data = await res.json();
        results.push(data);
      } catch (err) {
        results.push({
          jsonrpc: "2.0",
          id: i + 1,
          error: { code: -32603, message: err instanceof Error ? err.message : "Request failed" },
        });
      }
    }
    return c.json({ results });
  });

  const uiDir = findUiDir();
  const hasEmbedded = Object.keys(EMBEDDED_UI).length > 0;

  if (uiDir) {
    const staticOpts = {
      root: uiDir,
      rewriteRequestPath: (p: string) => (p.startsWith("/") ? p.slice(1) : p),
    };
    app.use("/assets/*", serveStatic(staticOpts));
    app.get("/", serveStatic({ path: "index.html", root: uiDir }));
    app.get("/sessions/*", serveStatic({ path: "index.html", root: uiDir }));
    app.get("/approvals", serveStatic({ path: "index.html", root: uiDir }));
    app.get("/routing", serveStatic({ path: "index.html", root: uiDir }));
    app.get("/system", serveStatic({ path: "index.html", root: uiDir }));
    app.get("/playground", serveStatic({ path: "index.html", root: uiDir }));
  } else if (hasEmbedded) {
    serveEmbeddedUi(app);
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
