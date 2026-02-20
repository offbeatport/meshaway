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
import type { CopilotSession } from "@github/copilot-sdk";
import { createCopilotRunner } from "./playground/runner-copilot.js";

/** Active runners: runnerSessionId -> Copilot session + stop. */
const activeRunners = new Map<string, { session: CopilotSession; stop: () => Promise<void> }>();

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


  // Playground API

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
    const runnerSessionId = typeof body.runnerSessionId === "string" && body.runnerSessionId
      ? body.runnerSessionId
      : null;

    if (!runnerSessionId) {
      return c.json({
        error: "runnerSessionId required. Create a session with POST /api/playground/session first.",
      }, 400);
    }

    const active = activeRunners.get(runnerSessionId);
    const runnerSession = runnerStore.get(runnerSessionId);

    if (!active || !runnerSession) {
      return c.json({
        runnerSessionId,
        status: "error",
        error: "Session not found or agent not running. Create a session with POST /api/playground/session first.",
      }, 502);
    }

    runnerStore.update(runnerSessionId, { status: "streaming" });

    await active.session.send({ prompt });

    return c.json({
      runnerSessionId,
      status: "streaming"

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

  const defaultCliArgs = ["bridge", "--agent", "acp:gemini-cli"];

  app.post("/api/playground/session", async (c) => {

    let body: { cliPath?: string; cliArgs?: string[]; };
    try {
      body = (await c.req.json().catch(() => ({}))) as typeof body;
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }

    const cliPath = typeof body.cliPath === "string" && body.cliPath ? body.cliPath : "meshaway";
    const cliArgs = Array.isArray(body.cliArgs) && body.cliArgs.length > 0 ? body.cliArgs : defaultCliArgs;

    const runnerSessionId = genId("runner");
    runnerStore.createOrGet(runnerSessionId);
    runnerStore.update(runnerSessionId, { agentCommand: cliPath, agentArgs: cliArgs, status: "connected" });

    const addFrame = (type: string, payload: unknown) => {
      runnerStore.addFrame(runnerSessionId, type, payload);
    };

    try {

      const { session, stop } = await createCopilotRunner({
        runnerSessionId,
        addFrame,
        cliPath,
        cliArgs
      });
      activeRunners.set(runnerSessionId, { session, stop });

      return c.json({
        runnerSessionId,
        bridgeType: "stdio"
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start agent";
      runnerStore.update(runnerSessionId, { status: "error" });
      runnerStore.addFrame(runnerSessionId, "session.error", { message });
      return c.json({ error: message, runnerSessionId }, 502);
    }
  });

  async function disconnectRunner(runnerSessionId: string): Promise<void> {
    const active = activeRunners.get(runnerSessionId);
    if (!active) return;
    await active.stop();
    activeRunners.delete(runnerSessionId);
    runnerStore.update(runnerSessionId, { runnerPid: undefined });
    runnerStore.reset(runnerSessionId);
  }

  app.post("/api/playground/disconnect", async (c) => {
    let body: { runnerSessionId?: string };
    try {
      body = (await c.req.json().catch(() => ({}))) as typeof body;
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const runnerSessionId = typeof body.runnerSessionId === "string" ? body.runnerSessionId : null;
    if (!runnerSessionId) return c.json({ error: "runnerSessionId required" }, 400);
    await disconnectRunner(runnerSessionId);
    return c.json({ ok: true });
  });

  app.post("/api/playground/control", async (c) => {
    let body: { runnerSessionId?: string; action?: string };
    try {
      body = (await c.req.json().catch(() => ({}))) as typeof body;
    } catch {
      return c.json({ error: "Invalid JSON" }, 400);
    }
    const runnerSessionId = typeof body.runnerSessionId === "string" ? body.runnerSessionId : null;
    const action = typeof body.action === "string" ? body.action : "";
    if (!runnerSessionId) return c.json({ error: "runnerSessionId required" }, 400);
    if (action === "reset" || action === "disconnect") {
      await disconnectRunner(runnerSessionId);
      return c.json({ ok: true, action });
    }
    if (action === "kill") {
      markKilled(runnerSessionId);
      await disconnectRunner(runnerSessionId);
      return c.json({ ok: true, action: "kill" });
    }
    return c.json({ error: "Unknown action" }, 400);
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
