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


/** Extract --agent value from args, or "" if not present. */
function extractAgentFromArgs(args: string[]): string {
  const i = args.indexOf("--agent");
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  return "";
}

/** Resolve agentCommand + agentArgs to { cmd, args } for spawning. When command is "meshaway" or empty, use tsx (source) or built meshaway. */
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
    const args = agentArgs.length ? agentArgs : ["bridge", "--agent", agent || "acp:gemini-cli"];
    if (existsSync(script)) {
      const tsx = join(cwd, "node_modules", ".bin", "tsx");
      const runner = existsSync(tsx) ? tsx : "npx";
      const runnerArgs = existsSync(tsx) ? [script] : ["tsx", script];
      return { cmd: runner, args: [...runnerArgs, ...args] };
    }
    if (existsSync(built)) {
      return { cmd: process.execPath, args: [built, ...args] };
    }
    return { cmd: process.execPath, args: [built, "bridge", "--agent", agent || "acp:gemini-cli"] };
  }
  return { cmd: agentCommand, args: agentArgs };
}





// /** SDK spawns the CLI process; we attach to stdout/stderr so the client can see subprocess output. */
// function attachSubprocessFrames(
//   client: CopilotClient,
//   push: (type: string, payload: unknown) => void
// ): void {
//   const proc = (client as unknown as { cliProcess?: ChildProcess | null }).cliProcess;
//   if (!proc) return;

//   proc.stdout?.on("data", (chunk: Buffer | string) => {
//     push("copilot.stdout", { text: chunk.toString() });
//   });
//   proc.stdout?.on("error", (err: Error) => {
//     push("copilot.stdout.error", { message: err.message });
//   });

//   proc.stderr?.on("data", (chunk: Buffer | string) => {
//     push("copilot.stderr", { text: chunk.toString() });
//   });
//   proc.stderr?.on("error", (err: Error) => {
//     push("copilot.stderr.error", { message: err.message });
//   });

//   proc.on("error", (err: Error) => {
//     push("copilot.subprocess.error", { message: err.message });
//   });
//   proc.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
//     push("copilot.subprocess.exit", { code, signal: signal ?? undefined });
//   });
// }

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
/**
 * Create and start a Copilot client, create a session, wire event handlers to push frames.
 * Call stop() when disconnecting.
 */
export async function createCopilotRunner(
  options: CreateCopilotRunnerOptions
): Promise<CopilotRunnerResult> {
  const { addFrame, cliPath, cliArgs, model = "gpt-5" } = options;
  const bridgeCommand = resolveBridgeCommand(cliPath, cliArgs);

  const push = addFrame;
  const client = new CopilotClient({
    cliPath: bridgeCommand.cmd || cliPath,
    cliArgs: bridgeCommand.args || cliArgs,
    useStdio: true,
    autoStart: false,
  });
  await client.start();

  push("copilot.client.started", { cliPath, cliArgs: [...cliArgs], model });


  const session = await client.createSession({ model });
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
