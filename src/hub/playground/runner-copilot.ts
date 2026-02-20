/**
 * Playground Runner (Copilot SDK): uses @github/copilot-sdk to create and manage
 * sessions. No custom JSON-RPC; the SDK handles protocol. Pushes session events as frames to the Hub.
 * Also forwards the spawned subprocess stderr/error/exit to the client as frames.
 */

import { CopilotClient } from "@github/copilot-sdk";
import type { CopilotSession } from "@github/copilot-sdk";
import type { ChildProcess } from "node:child_process";

export type AddFrameFn = (type: string, payload: unknown) => void;
import { existsSync } from "node:fs";
import { join } from "node:path";


function extractAgentFromArgs(args: string[]): string {
  const i = args.indexOf("--agent");
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  return "";
}

export function resolveBridgeCommand(
  agentCommand: string,
  agentArgs: string[]
): { cmd: string; args: string[] } {

  const wantMeshaway = !agentCommand || agentCommand === "meshaway";
  const agent = extractAgentFromArgs(agentArgs);
  const cwd = process.cwd();
  const script = join(cwd, "src", "cli.ts");
  const built = join(cwd, "dist", "node", "meshaway.mjs");
  if (wantMeshaway) {
    const args = agentArgs.length ? agentArgs : ["bridge", "--agent", agent || "gemini-cli"];
    if (existsSync(script)) {
      const tsx = join(cwd, "node_modules", ".bin", "tsx");
      const runner = existsSync(tsx) ? tsx : "npx";
      const runnerArgs = existsSync(tsx) ? [script] : ["tsx", script];
      return { cmd: runner, args: [...runnerArgs, ...args] };
    }
    if (existsSync(built)) {
      return { cmd: process.execPath, args: [built, ...args] };
    }
    return { cmd: process.execPath, args: [built, "bridge", "--agent", agent || "gemini-cli"] };
  }
  return { cmd: agentCommand, args: agentArgs };
}

export interface CreateCopilotRunnerOptions {
  runnerSessionId: string;
  addFrame: AddFrameFn;
  cliPath: string;
  cliArgs: string[];
  model?: string;
}

export interface CopilotRunnerResult {
  client: CopilotClient;
  session: CopilotSession;
  stop: () => Promise<void>;
}
const AGENT_ERROR_PREFIX = "Agent: ";

/** Capture stderr from bridge subprocess to detect agent vs bridge errors (bridge writes "Agent: ..." on agent failure). */
function captureBridgeStderr(client: CopilotClient): string[] {
  const lines: string[] = [];
  const proc = (client as unknown as { cliProcess?: ChildProcess | null }).cliProcess;
  if (!proc?.stderr) return lines;
  proc.stderr.on("data", (chunk: Buffer | string) => {
    const text = typeof chunk === "string" ? chunk : chunk.toString("utf8");
    lines.push(...text.split(/\r?\n/).filter(Boolean));
  });
  return lines;
}


export async function createCopilotRunner(
  options: CreateCopilotRunnerOptions
): Promise<CopilotRunnerResult> {
  const { addFrame, cliPath, cliArgs, model = "gpt-5" } = options;
  const bridgeCommand = resolveBridgeCommand(cliPath, cliArgs);

  const push = addFrame;
  push("copilot.client.starting", { cliPath, cliArgs: [...cliArgs], model });
  const client = new CopilotClient({
    cliPath: bridgeCommand.cmd || cliPath,
    cliArgs: bridgeCommand.args || cliArgs,
    useStdio: true,
    autoStart: false,
  });
  await client.start();

  const stderrLines = captureBridgeStderr(client);
  push("copilot.client.started", { cliPath, cliArgs: [...cliArgs], model });

  let session: CopilotSession;
  try {
    session = await client.createSession({ model });
  } catch (err) {
    const agentLine = stderrLines.find((l) => l.startsWith(AGENT_ERROR_PREFIX));
    const augmented = err instanceof Error ? err : new Error(String(err));
    if (agentLine) {
      (augmented as Error & { errorSource?: "agent" | "bridge" }).errorSource = "agent";
      augmented.message = agentLine.slice(AGENT_ERROR_PREFIX.length);
    } else {
      (augmented as Error & { errorSource?: "agent" | "bridge" }).errorSource = "bridge";
    }
    throw augmented;
  }

  push("copilot.session.created", {
    sessionId: session.sessionId,
    model,
  });

  session.on((event: { type: string;[key: string]: unknown }) => {
    push(`copilot.${event.type}`, event);
  });

  const stop = async () => {
    try {
      await session.destroy();
    } catch {
      // ignore
    }
    try {
      await client.stop();
    } catch {
      // ignore
    }
  };

  return { client, session, stop };
}
