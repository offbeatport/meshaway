/**
 * E2E test: Copilot SDK protocol over the Meshaway bridge (HTTP JSON-RPC).
 *
 * Exercises the full path: client → HTTP → Bridge → (optional backend).
 * The official @github/copilot-sdk uses TCP + vscode-jsonrpc, so it does not
 * connect to our HTTP bridge directly. This test drives the same protocol
 * (initialize, prompt) over HTTP to validate bridge and Hub behavior.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { findOpenPort } from "../../shared/net.js";
import { startHub } from "../../hub/server.js";
import { startBridgeServer } from "../../bridge/server.js";
import { initLogger } from "../../shared/logging.js";

const rpc = (url: string, method: string, params: unknown, id = 1) =>
  fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  }).then((r) => r.json() as Promise<Record<string, unknown>>);

describe("Copilot SDK protocol e2e (HTTP)", () => {
  let hubPort: number;
  let bridgePort: number;
  let hubClose: () => Promise<void>;
  let bridgeClose: () => Promise<void>;
  let bridgeUrl: string;
  let hubUrl: string;

  beforeAll(async () => {
    initLogger("error", "json");
    hubPort = await findOpenPort(17337);
    bridgePort = await findOpenPort(14321);
    hubUrl = `http://127.0.0.1:${hubPort}`;
    bridgeUrl = `http://127.0.0.1:${bridgePort}`;

    const [hubHandle, bridgeHandle] = await Promise.all([
      startHub({ host: "127.0.0.1", port: hubPort }),
      startBridgeServer(`127.0.0.1:${bridgePort}`, {
        hubUrl,
        backend: undefined,
      }),
    ]);
    hubClose = hubHandle.close;
    bridgeClose = bridgeHandle.close;
  }, 30_000);

  afterAll(async () => {
    await Promise.all([bridgeClose(), hubClose()]);
  });

  it("initialize returns protocol version and server info", async () => {
    const res = await rpc(bridgeUrl, "initialize", {});
    expect(res.jsonrpc).toBe("2.0");
    expect(res.id).toBe(1);
    expect(res.error).toBeUndefined();
    const result = res.result as Record<string, unknown>;
    expect(result?.protocolVersion).toBe(1);
    expect((result?.serverInfo as Record<string, unknown>)?.name).toBe("meshaway");
    expect((result?.serverInfo as Record<string, unknown>)?.version).toBe("0.1.0");
  });

  it("prompt without backend returns -32001 and registers session on Hub", async () => {
    const sessionId = "e2e-session-" + Date.now();
    const res = await rpc(
      bridgeUrl,
      "prompt",
      { prompt: "Say hello", sessionId },
      2
    );
    expect(res.jsonrpc).toBe("2.0");
    expect(res.id).toBe(2);
    expect(res.result).toBeUndefined();
    const err = res.error as Record<string, unknown>;
    expect(err?.code).toBe(-32001);
    expect(err?.message).toContain("No backend");

    const sessionsRes = await fetch(`${hubUrl}/api/sessions`);
    expect(sessionsRes.ok).toBe(true);
    const sessions = (await sessionsRes.json()) as Array<{ id: string }>;
    const created = sessions.find((s) => s.id === sessionId);
    expect(created).toBeDefined();
  });

  it("cancel is accepted", async () => {
    const res = await rpc(bridgeUrl, "cancel", { sessionId: "any" }, 3);
    expect(res.jsonrpc).toBe("2.0");
    expect(res.error).toBeUndefined();
    expect((res.result as Record<string, unknown>)?.ok).toBe(true);
  });

  it("health and RPC routes respond", async () => {
    const health = await fetch(`${bridgeUrl}/health`);
    expect(health.ok).toBe(true);
    const body = (await health.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);

    const root = await fetch(bridgeUrl);
    expect(root.ok).toBe(true);
    const rootBody = (await root.json()) as Record<string, unknown>;
    expect(rootBody.server).toBe("meshaway-bridge");
  });
});
