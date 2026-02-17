import { test, expect } from "vitest";
import { readFileSync, unlinkSync, existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";


/**
 * E2E stdio + Copilot: SDK app → meshaway (CLI, stdio) → bridge → agent.
 */
test("Copilot stdio: full flow (SDK → meshaway stdio → bridge → agent)", async () => {
  const fixturePath = path.resolve(
    process.cwd(),
    "tests",
    "e2e",
    "stdio",
    "fixtures",
    "copilot-user-flow.mjs",
  );

  const result = await new Promise<{ code: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [fixturePath], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, MESHAWAY_DEBUG_ARGS: "1" },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      const s = chunk.toString();
      stderr += s;
      process.stderr.write(s);
    });
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });

  // const debugArgsPath = path.join(process.cwd(), DEBUG_ARGS_FILE);
  // if (existsSync(debugArgsPath)) {
  //   const argv = readFileSync(debugArgsPath, "utf8");
  //   process.stderr.write(`[meshaway] argv: ${argv}\n`);
  //   unlinkSync(debugArgsPath);
  // }

  expect(result.code, `e2e fixture failed: ${result.stderr}\n${result.stdout}`).toBe(0);
  expect(result.stdout.includes("COPILOT_FLOW_OK"), `expected COPILOT_FLOW_OK in stdout: ${result.stdout}`).toBe(true);
});
