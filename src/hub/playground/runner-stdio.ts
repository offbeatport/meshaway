/**
 * Playground Runner (STDIO): spawns meshaway bridge in stdio mode, sends prompt,
 * and pushes each bridge stdout line to Hub as a frame.
 * Uses agentCommand and agentArgs (e.g. meshaway + ["bridge", "--backend", "acp:gemini-cli"]).
 */

import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import { join } from "node:path";

export interface SpawnRunnerStdioOptions {
  runnerSessionId: string;
  hubUrl: string;
  clientType: "copilot" | "acp";
  prompt: string;
  /** CLI command (e.g. "meshaway"). When "meshaway" or empty, resolved to node + built script. */
  agentCommand?: string;
  /** CLI arguments (e.g. ["bridge", "--backend", "acp:gemini-cli"]). */
  agentArgs?: string[];
  record?: boolean;
  recordFilename?: string;
}

function pushFrame(hubUrl: string, runnerSessionId: string, type: string, payload: unknown): void {
  const base = hubUrl.replace(/\/$/, "");
  fetch(`${base}/api/playground/runner/${runnerSessionId}/frames`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, payload }),
  }).catch(() => {});
}

/** Extract --backend value from args, or "" if not present. */
function extractBackendFromArgs(args: string[]): string {
  const i = args.indexOf("--backend");
  if (i >= 0 && i + 1 < args.length) return args[i + 1];
  return "";
}

/** Resolve agentCommand + agentArgs to { cmd, args } for spawning. When command is "meshaway" or empty, use built/tsx meshaway. */
export function resolveBridgeCommand(
  agentCommand: string,
  agentArgs: string[]
): { cmd: string; args: string[] } {
  const wantMeshaway = !agentCommand || agentCommand === "meshaway";
  const backend = extractBackendFromArgs(agentArgs);
  const cwd = process.cwd();
  const built = join(cwd, "dist", "node", "meshaway.mjs");
  if (wantMeshaway) {
    if (existsSync(built)) {
      return { cmd: process.execPath, args: [built, ...(agentArgs.length ? agentArgs : ["bridge", "--backend", backend || "acp:gemini-cli"])] };
    }
    const tsx = join(cwd, "node_modules", ".bin", "tsx");
    const script = join(cwd, "src", "cli", "index.ts");
    if (existsSync(script)) {
      const runner = existsSync(tsx) ? tsx : "npx";
      const runnerArgs = existsSync(tsx) ? [script] : ["tsx", script];
      return {
        cmd: runner,
        args: [...runnerArgs, ...(agentArgs.length ? agentArgs : ["bridge", "--backend", backend || "acp:gemini-cli"])],
      };
    }
    return { cmd: process.execPath, args: [built, "bridge", "--backend", backend || "acp:gemini-cli"] };
  }
  return { cmd: agentCommand, args: agentArgs };
}

/** @deprecated Use resolveBridgeCommand(agentCommand, agentArgs) with agentArgs including --backend. */
export function getBridgeCommand(backend: string): { cmd: string; args: string[] } {
  return resolveBridgeCommand("meshaway", ["bridge", "--backend", backend]);
}

export function spawnPlaygroundRunnerStdio(options: SpawnRunnerStdioOptions): ReturnType<typeof spawn> {
  const { runnerSessionId, hubUrl, clientType, prompt, agentCommand = "meshaway", agentArgs = [] } = options;
  const { cmd, args } = resolveBridgeCommand(agentCommand, agentArgs.length ? agentArgs : ["bridge", "--backend", "acp:gemini-cli"]);
  const backendEnv = extractBackendFromArgs(args);
  const child = spawn(cmd, args, {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, ...(backendEnv ? { BACKEND: backendEnv } : {}) },
  });

  const push = (type: string, payload: unknown) => pushFrame(hubUrl, runnerSessionId, type, payload);

  const send = (rpc: object) => {
    child.stdin?.write(JSON.stringify(rpc) + "\n");
  };

  const rl = createInterface({ input: child.stdout!, crlfDelay: Infinity });
  if (clientType === "acp") {
    send({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
    send({ jsonrpc: "2.0", id: 2, method: "session/new", params: { cwd: ".", mcpServers: [] } });
    rl.on("line", (line: string) => {
      let obj: unknown;
      try {
        obj = JSON.parse(line) as unknown;
      } catch {
        push("raw", { line });
        return;
      }
      push("bridge.stdout", obj);
      const rec = obj as { id?: number; result?: { sessionId?: string } };
      if (rec.id === 2 && rec.result?.sessionId) {
        send({
          jsonrpc: "2.0",
          id: 3,
          method: "session/prompt",
          params: { sessionId: rec.result.sessionId, prompt: [{ type: "text", text: prompt }] },
        });
        child.stdin?.end();
      }
    });
  } else {
    send({ jsonrpc: "2.0", id: 1, method: "prompt", params: { prompt } });
    child.stdin?.end();
    rl.on("line", (line) => {
      let obj: unknown;
      try {
        obj = JSON.parse(line) as unknown;
      } catch {
        push("raw", { line });
        return;
      }
      push("bridge.stdout", obj);
    });
  }

  child.stderr?.on("data", (chunk) => {
    push("bridge.stderr", { text: String(chunk) });
  });

  child.on("error", (err) => {
    push("runner.error", { message: err.message });
  });

  child.on("exit", (code, signal) => {
    push("runner.exit", { code: code ?? null, signal: signal ?? null });
  });

  return child;
}
