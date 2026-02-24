/**
 * Playground Runner (Copilot SDK): uses @github/copilot-sdk to create and manage
 * sessions. No custom JSON-RPC; the SDK handles protocol. Pushes session events as frames to the Hub.
 * Also forwards the spawned subprocess stderr/error/exit to the client as frames.
 */

import { CopilotClient } from "@github/copilot-sdk";
import type { CopilotSession } from "@github/copilot-sdk";

export type AddFrameFn = (type: string, payload: unknown) => void;
import { existsSync } from "node:fs";
import { join } from "node:path";
import { log } from "../../shared/logging.js";
import type { PlaygroundPreset } from "./presets.js";


function extractAgentFromArgs(args: string[]): string {
  const i = args.indexOf("--agent");
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  return "";
}

/** True when the current process is the meshaway binary (native or node running meshaway.mjs). */
function isMeshawayProcess(): boolean {
  const exe = process.execPath;
  const argv0 = process.argv[0] ?? "";
  return exe.endsWith("meshaway") || argv0.endsWith("meshaway") || exe.includes("meshaway.mjs");
}

/** When process.execPath is node (e.g. packaged native binary), resolve the real meshaway binary in cwd. */
function meshawayBinaryInCwd(): string | null {
  const cwd = process.cwd();
  const unix = join(cwd, "meshaway");
  if (existsSync(unix)) return unix;
  const win = join(cwd, "meshaway.exe");
  if (existsSync(win)) return win;
  return null;
}

export function resolveBridgeCommand(
  agentCommand: string,
  agentArgs: string[]
): { cmd: string; args: string[] } {

  const wantMeshaway = !agentCommand || agentCommand === "meshaway";
  const agent = extractAgentFromArgs(agentArgs);
  const args = agentArgs.length ? agentArgs : ["bridge", "--agent", agent || "gemini"];

  if (wantMeshaway) {
    if (isMeshawayProcess()) {
      return { cmd: process.execPath, args };
    }
    const cwd = process.cwd();
    const script = join(cwd, "src", "cli.ts");
    if (existsSync(script)) {
      const tsx = join(cwd, "node_modules", ".bin", "tsx");
      const runner = existsSync(tsx) ? tsx : "npx";
      const runnerArgs = existsSync(tsx) ? [script] : ["tsx", script];
      return { cmd: runner, args: [...runnerArgs, ...args] };
    }
    const binary = meshawayBinaryInCwd();
    if (binary) return { cmd: binary, args };
    return { cmd: process.execPath, args };
  }
  return { cmd: agentCommand, args: agentArgs };
}

export interface CreateCopilotRunnerOptions {
  runnerSessionId: string;
  addFrame: AddFrameFn;
  preset: PlaygroundPreset;
}

export interface CopilotRunnerResult {
  client: CopilotClient;
  session: CopilotSession;
  stop: () => Promise<void>;
}


export async function createCopilotRunner(
  options: CreateCopilotRunnerOptions
): Promise<CopilotRunnerResult> {
  const { addFrame, preset } = options;
  const { cliPath, cliArgs } = preset;
  const bridgeCommand = resolveBridgeCommand(cliPath, cliArgs);

  addFrame("session.connecting", { cliPath, cliArgs: [...cliArgs] });
  addFrame("copilot.client.starting", { cliPath, cliArgs: [...cliArgs] });
  const hubBaseUrl = process.env.MESH_HUB_URL ?? "http://127.0.0.1:7337";
  process.env.MESHAWAY_HUB_URL = hubBaseUrl;
  process.env.MESHAWAY_RUNNER_SESSION_ID = options.runnerSessionId;
  console.error("Creating Copilot client", bridgeCommand.cmd, bridgeCommand.args);
  const client = new CopilotClient({
    cliPath: bridgeCommand.cmd || cliPath,
    cliArgs: bridgeCommand.args || cliArgs,
    useStdio: true,
    autoStart: false,
  });
  console.error("Starting Copilot client ...");
  await client.start();
  console.error("Copilot client started");
  addFrame("copilot.client.started", { cliPath, cliArgs: [...cliArgs] });

  let session: CopilotSession;
  try {
    session = await client.createSession();
  } catch (err) {
    throw err;
  }

  addFrame("copilot.session.created", {
    sessionId: session.sessionId,
  });

  session.on((event: { type: string;[key: string]: unknown }) => {
    addFrame(`copilot.${event.type}`, event);
  });

  const stop = async () => {
    try {
      await session.destroy();
    } catch { /* ignore */ }

    try {
      await client.stop();
    } catch { /* ignore */ }

  };

  return { client, session, stop };
}
