import { test, expect } from "vitest";
import path from "node:path";
import { spawn } from "node:child_process";

const SERVE_PORT = 17777;
const meshPath = path.join(process.cwd(), "dist", "meshaway.cjs");

async function waitForServer(port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

/**
 * E2E server + Copilot: meshaway serve starts, health responds, then stops.
 * (Full SDK→server flow can be added when server speaks Copilot protocol.)
 */
test("Copilot server: server starts, health responds, then stops", async () => {
  const child = spawn(process.execPath, [meshPath, "serve", "--listen", `127.0.0.1:${SERVE_PORT}`], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const ready = await waitForServer(SERVE_PORT, 5000);
  expect(ready, `server did not become ready: ${stderr}`).toBe(true);

  const res = await fetch(`http://127.0.0.1:${SERVE_PORT}/health`);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { ok?: boolean };
  expect(body.ok).toBe(true);

  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    child.on("exit", () => resolve());
  });
});
