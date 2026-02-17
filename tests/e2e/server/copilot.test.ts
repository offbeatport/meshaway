import { test, expect } from "vitest";
import { spawn } from "node:child_process";
import { MESH_PATH, SERVE_PORT, waitForServer } from "../helpers.js";

test("Copilot server: server starts, health responds, then stops", async () => {
  const child = spawn(process.execPath, [MESH_PATH, "serve", "--listen", `127.0.0.1:${SERVE_PORT}`], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  const ready = await waitForServer(SERVE_PORT, 5000);
  expect(ready, "server did not become ready").toBe(true);

  const res = await fetch(`http://127.0.0.1:${SERVE_PORT}/health`);
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true });

  child.kill("SIGTERM");
  await new Promise<void>((r) => child.on("exit", r));
});
