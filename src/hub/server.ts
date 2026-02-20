import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { EXIT, exit } from "../shared/errors.js";
import { genId } from "../shared/ids.js";
import { sessionStore } from "./store/memory.js";
import { runnerStore } from "./store/runner.js";
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
    });
  });
  app.get("/api/sessions", (c) => c.json(sessionStore.listSessions()));
  app.post("/api/sessions", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { sessionId?: string; type?: string };
    if (typeof body.sessionId === "string" && body.sessionId) {
      const session = sessionStore.ensureSession(body.sessionId);
      return c.json(session);
    }
    const session = sessionStore.createSession();
    return c.json(session);
  });
  app.post("/api/sessions/:id/frames", async (c) => {
    const id = c.req.param("id");
    let body: { type?: string; payload?: unknown };
    try {
      body = (await c.req.json().catch(() => ({}))) as typeof body;
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const type = typeof body.type === "string" ? body.type : "raw";
    const payload = body.payload;
    sessionStore.ensureSession(id);
    const frame = sessionStore.addFrame(id, type, payload, false);
    return frame ? c.json({ ok: true }) : c.json({ error: "Session not found" }, 404);
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
  app.post("/api/playground/send", async (c) => {
    let body: {
      clientType?: string;
      prompt?: string;
      runnerSessionId?: string;
      agentCommand?: string;
      agentArgs?: string[];
      record?: boolean;
      recordFilename?: string;
      sessionId?: string;
    };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const prompt = typeof body.prompt === "string" ? body.prompt : "";
    const clientType = body.clientType === "acp" ? "acp" : "copilot";
    const runnerSessionId = typeof body.runnerSessionId === "string" && body.runnerSessionId
      ? body.runnerSessionId
      : genId("runner");

    const runnerSession = runnerStore.createOrGet(runnerSessionId);
    const agentCommand = typeof body.agentCommand === "string" ? body.agentCommand : runnerSession.agentCommand ?? "meshaway";
    const agentArgs = Array.isArray(body.agentArgs) && body.agentArgs.length > 0
      ? body.agentArgs
      : (runnerSession.agentArgs && runnerSession.agentArgs.length > 0 ? runnerSession.agentArgs : ["bridge", "--backend", "acp:gemini-cli"]);
    runnerStore.update(runnerSessionId, { status: "streaming" });
    const hubBase = process.env.MESH_HUB_URL ?? `http://127.0.0.1:${process.env.PORT ?? 7337}`;
    let bridgeCommand: { cmd: string; args: string[] } = { cmd: "node", args: [] };
    try {
      const { spawnPlaygroundRunnerStdio, resolveBridgeCommand } = await import("./playground/runner-stdio.js");
      bridgeCommand = resolveBridgeCommand(agentCommand, agentArgs);
      const child = spawnPlaygroundRunnerStdio({
        runnerSessionId,
        hubUrl: hubBase,
        clientType,
        prompt,
        agentCommand,
        agentArgs,
        record: body.record === true,
        recordFilename: typeof body.recordFilename === "string" ? body.recordFilename : undefined,
      });
      runnerStore.update(runnerSessionId, { runnerPid: child.pid });
      child.on("exit", () => {
        runnerStore.update(runnerSessionId, { runnerPid: undefined });
      });
    } catch (err) {
      runnerStore.update(runnerSessionId, { status: "error" });
      return c.json({
        runnerSessionId,
        status: "error",
        error: err instanceof Error ? err.message : "Failed to start runner",
      }, 502);
    }
    return c.json({
      runnerSessionId,
      status: "streaming",
      bridgeType: "stdio",
      agentExec: bridgeCommand.cmd,
      agentArgs: bridgeCommand.args,
    });
  });

  app.get("/api/playground/frames/:runnerSessionId", (c) => {
    const runnerSessionId = c.req.param("runnerSessionId");
    const runnerSession = runnerStore.get(runnerSessionId);
    if (!runnerSession) return c.json({ frames: [] });
    if (runnerSession.bridgeSessionId) {
      const frames = sessionStore.getFrames(runnerSession.bridgeSessionId);
      return c.json({ frames });
    }
    return c.json({ frames: runnerSession.frames });
  });

  app.post("/api/playground/session", async (c) => {
    let body: { clientType?: string; agentCommand?: string; agentArgs?: string[] };
    try {
      body = (await c.req.json().catch(() => ({}))) as typeof body;
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const runnerSessionId = genId("runner");
    runnerStore.createOrGet(runnerSessionId);
    const agentCommand = typeof body.agentCommand === "string" ? body.agentCommand : "meshaway";
    const agentArgs = Array.isArray(body.agentArgs) ? body.agentArgs : [];
    runnerStore.update(runnerSessionId, { agentCommand, agentArgs });
    let agentExec: string | null = null;
    let resolvedAgentArgs: string[] = [];
    try {
      const { resolveBridgeCommand } = await import("./playground/runner-stdio.js");
      const bridgeCommand = resolveBridgeCommand(agentCommand, agentArgs.length ? agentArgs : ["bridge", "--backend", "acp:gemini-cli"]);
      agentExec = bridgeCommand.cmd;
      resolvedAgentArgs = bridgeCommand.args;
    } catch {
      // Metadata-only; keep session creation successful.
    }
    return c.json({
      runnerSessionId,
      bridgeType: "stdio",
      agentExec,
      agentArgs: resolvedAgentArgs,
    });
  });

  app.post("/api/playground/control", async (c) => {
    let body: { runnerSessionId?: string; action?: string };
    try {
      body = (await c.req.json()) as typeof body;
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const runnerSessionId = typeof body.runnerSessionId === "string" ? body.runnerSessionId : "";
    const action = body.action === "kill" ? "kill" : body.action === "reset" ? "reset" : body.action === "cancel" ? "cancel" : undefined;
    if (!runnerSessionId || !action) {
      return c.json({ error: "runnerSessionId and action (cancel|kill|reset) required" }, 400);
    }
    const runnerSession = runnerStore.get(runnerSessionId);
    if (!runnerSession) return c.json({ error: "Runner session not found" }, 404);
    if (action === "reset") {
      if (runnerSession.runnerPid) {
        try {
          process.kill(runnerSession.runnerPid, "SIGTERM");
        } catch {
          // ignore
        }
      }
      runnerStore.reset(runnerSessionId);
      return c.json({ ok: true, action: "reset" });
    }
    if (action === "kill" && runnerSession.bridgeSessionId) {
      const ok = sessionStore.killSession(runnerSession.bridgeSessionId);
      if (ok) markKilled(runnerSession.bridgeSessionId);
      runnerStore.update(runnerSessionId, { status: "error" });
      return c.json({ ok: true, action: "kill" });
    }
    if (action === "cancel") {
      runnerStore.update(runnerSessionId, { status: "connected" });
      return c.json({ ok: true, action: "cancel" });
    }
    return c.json({ error: "Invalid action" }, 400);
  });

  app.post("/api/playground/runner/:runnerSessionId/frames", async (c) => {
    const runnerSessionId = c.req.param("runnerSessionId");
    let body: { type?: string; payload?: unknown };
    try {
      body = (await c.req.json().catch(() => ({}))) as typeof body;
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const type = typeof body.type === "string" ? body.type : "raw";
    runnerStore.createOrGet(runnerSessionId);
    const frame = runnerStore.addFrame(runnerSessionId, type, body.payload);
    return frame ? c.json({ ok: true }) : c.json({ error: "Not found" }, 404);
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
