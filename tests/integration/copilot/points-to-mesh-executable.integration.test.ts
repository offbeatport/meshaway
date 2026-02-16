import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawn } from "node:child_process";

test("existing Copilot SDK app can point cliPath to mesh executable", async () => {
  const fixturePath = path.resolve(
    process.cwd(),
    "tests",
    "integration",
    "copilot",
    "fixtures",
    "copilot-user-flow.mjs",
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
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });

  assert.equal(result.code, 0, `fixture failed: ${result.stderr}\n${result.stdout}`);
  assert.equal(result.stdout.includes("COPILOT_FLOW_OK"), true, `stdout: ${result.stdout}`);
});
