import { Command } from "commander";
import { spawn } from "node:child_process";
import { BridgeEngine } from "./bridge.js";
import type { MeshMode } from "./types.js";
import { ObserverEventBus } from "./ui/events.js";
import { startObserverServer } from "./ui/server.js";

interface RuntimeOptions {
  mode: MeshMode;
  clientType: MeshMode;
  agentCommand: string;
  agentArg: string[];
  cwd: string;
  port?: number;
}

export function createProgram(): Command {
  const program = new Command();
  program.name("mesh").description("Multi-client ACP bridge with local observer UI");

  program
    .command("start")
    .description("Run the bridge engine over stdio")
    .option("--mode <mode>", "Input mode detection (github|claude|auto)", "auto")
    .option("--client-type <type>", "Output translation target (github|claude|auto)", "auto")
    .option("--agent-command <command>", "Child ACP agent command", "cat")
    .option("--agent-arg <arg...>", "Arguments passed to child command", [])
    .option("--cwd <cwd>", "Working directory for child process", process.cwd())
    .action(async (options: RuntimeOptions) => {
      await runBridge(options, false);
    });

  program
    .command("ui")
    .description("Launch observer dashboard and run bridge")
    .option("--mode <mode>", "Input mode detection (github|claude|auto)", "auto")
    .option("--client-type <type>", "Output translation target (github|claude|auto)", "auto")
    .option("--agent-command <command>", "Child ACP agent command", "cat")
    .option("--agent-arg <arg...>", "Arguments passed to child command", [])
    .option("--cwd <cwd>", "Working directory for child process", process.cwd())
    .option("--port <port>", "Preferred observer port", "1618")
    .action(async (options: RuntimeOptions) => {
      await runBridge(options, true);
    });

  return program;
}

async function runBridge(options: RuntimeOptions, withUi: boolean): Promise<void> {
  const eventBus = new ObserverEventBus();
  const engine = new BridgeEngine({
    mode: options.mode,
    clientType: options.clientType,
    agentCommand: options.agentCommand,
    agentArgs: options.agentArg ?? [],
    cwd: options.cwd,
    eventBus,
  });

  if (withUi) {
    const observer = await startObserverServer({
      eventBus,
      onPermissionDecision: (id, decision) => engine.resolvePermission({ id, decision }),
      portStart: Number(options.port ?? 1618),
    });
    const url = `http://localhost:${observer.port}?token=${observer.token}`;
    openBrowser(url);
    process.stderr.write(`Observer running at ${url}\n`);
  }

  engine.start();
}

function openBrowser(url: string): void {
  const platform = process.platform;
  if (platform === "darwin") {
    spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    return;
  }
  if (platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { stdio: "ignore", detached: true }).unref();
    return;
  }
  spawn("xdg-open", [url], { stdio: "ignore", detached: true }).unref();
}
