import path from "node:path";
import { spawn } from "node:child_process";

/** Path to an e2e fixture script (e.g. stdio/fixtures/copilot-user-flow.mjs). */
export function fixturePath(...segments: string[]): string {
  return path.resolve(process.cwd(), "tests", "e2e", ...segments);
}

/** Run a script with node; returns exit code and stdio. */
export function runFixture(
  scriptPath: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, ...env },
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

/** Poll /health until 200 or timeout. */
export async function waitForServer(port: number, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) return true;
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

export const MESH_PATH = path.join(process.cwd(), "dist", "meshaway.cjs");
export const SERVE_PORT = 17777;
