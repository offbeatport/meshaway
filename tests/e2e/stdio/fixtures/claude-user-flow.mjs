import path from "node:path";
import { access, chmod } from "node:fs/promises";
import { execSync } from "node:child_process";
import { query } from "@anthropic-ai/claude-agent-sdk";

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

process.on("unhandledRejection", () => {});

await ensureMeshBuilt();

try {
  const q = query({
    prompt: "hello from claude sdk user app",
    options: {
      pathToClaudeCodeExecutable: meshCliPath,
    },
  });

  let sawAssistant = false;
  let sawError = false;
  for await (const message of q) {
    if (message.type === "assistant") {
      sawAssistant = true;
      break;
    }
    if (message.type === "error" || (message.type === "assistant" && message.error)) {
      sawError = true;
      break;
    }
  }
  q.close();

  if (sawError) {
    process.stdout.write("CLAUDE_FLOW_ERROR:protocol_or_runtime\n");
    process.exit(3);
  }
  if (sawAssistant) {
    process.stdout.write("CLAUDE_FLOW_OK\n");
  } else {
    process.stdout.write("CLAUDE_FLOW_FAIL\n");
    process.exit(2);
  }
} catch (error) {
  process.stdout.write(`CLAUDE_FLOW_ERROR:${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(3);
}
