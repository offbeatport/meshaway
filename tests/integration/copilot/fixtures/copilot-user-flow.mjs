import path from "node:path";
import { access, chmod } from "node:fs/promises";
import { execSync } from "node:child_process";
import { CopilotClient } from "@github/copilot-sdk";

const projectRoot = process.cwd();
const meshCliPath = path.join(projectRoot, "dist", "meshaway.cjs");

async function ensureMeshBuilt() {
  try {
    await access(meshCliPath);
  } catch {
    execSync("npm run build", { cwd: projectRoot, stdio: "ignore" });
  }
  await chmod(meshCliPath, 0o755);
}

process.on("unhandledRejection", () => {
  // Keep fixture process stable; parent integration test validates outcomes.
});

await ensureMeshBuilt();

const client = new CopilotClient({
  cliPath: meshCliPath,
  useStdio: true,
  autoRestart: false,
  useLoggedInUser: false,
  githubToken: "mesh-test-token",
  logLevel: "error",
});

try {
  await client.start();
  const ping = await client.ping("mesh-health");
  const session = await client.createSession({ model: "mesh-local" });
  const reply = await session.sendAndWait({ prompt: "hello from copilot sdk user app" }, 10_000);
  const events = await session.getMessages();

  const ok =
    ping.protocolVersion === 2 &&
    typeof reply?.data?.content === "string" &&
    reply.data.content.includes("Mesh received:") &&
    events.some((event) => event.type === "assistant.message");

  if (!ok) {
    process.stdout.write("COPILOT_FLOW_FAIL\n");
    process.exit(2);
  }

  process.stdout.write("COPILOT_FLOW_OK\n");
} catch (error) {
  process.stdout.write(`COPILOT_FLOW_ERROR:${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(3);
} finally {
  await client.stop().catch(() => {});
  await client.forceStop().catch(() => {});
}
