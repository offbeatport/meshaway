import { test, expect } from "vitest";
import path from "node:path";
import { spawn } from "node:child_process";

/**
 * E2E stdio + Claude: Claude SDK app → meshaway (as Claude Code executable) → bridge → agent.
 * Skipped until meshaway implements Claude Code CLI transport.
 */
test.skip("Claude stdio: full flow (SDK → meshaway → bridge → agent)", async () => {
  const fixturePath = path.resolve(
    process.cwd(),
    "tests",
    "e2e",
    "stdio",
    "fixtures",
    "claude-user-flow.mjs",
  );

  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [fixturePath], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
      process.stderr.write(chunk.toString());
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });

  expect(result.code, `e2e fixture failed: ${result.stderr}\n${result.stdout}`).toBe(0);
  expect(result.stdout.includes("CLAUDE_FLOW_OK"), `expected CLAUDE_FLOW_OK in stdout: ${result.stdout}`).toBe(true);
});
