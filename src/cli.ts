import { Command } from "commander";
import { spawn } from "node:child_process";
import { BridgeEngine } from "./bridge.js";
import type { MeshMode, Provider } from "./types.js";
import { ObserverEventBus } from "./ui/events.js";
import { startObserverServer } from "./ui/server.js";

/** Copilot/SDK-specific flags to strip before passing args to the ACP child agent. */
const COPILOT_STRIP_FLAGS = [
  "--stdio",
  "--headless",
  "--log-level",
  "--logLevel",
  "--verbose",
  "-v",
  "--quiet",
  "-q",
  "--no-open",
  "--port",
  "--host",
];

function stripCopilotArgs(args: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    const flag = COPILOT_STRIP_FLAGS.find((f) => arg === f || arg.startsWith(`${f}=`));
    if (flag) {
      if (arg === flag && i + 1 < args.length && !args[i + 1].startsWith("-")) {
        i += 1; // skip value for --flag value
      }
      i += 1;
      continue;
    }
    out.push(arg);
    i += 1;
  }
  return out;
}

interface RuntimeOptions {
  mode: MeshMode;
  clientType: MeshMode;
  provider?: Provider;
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
    .option("--provider <provider>", "Agent provider (github|claude|gemini)", "github")
    .option("--agent-command <command>", "Child ACP agent command", "cat")
    .option("--agent-arg <arg...>", "Arguments passed to child command (Copilot flags stripped)", [])
    .option("--cwd <cwd>", "Working directory for child process", process.cwd())
    .action(async (options: RuntimeOptions) => {
      await runBridge(options, false);
    });

  program
    .command("ui")
    .description("Launch observer dashboard and run bridge")
    .option("--mode <mode>", "Input mode detection (github|claude|auto)", "auto")
    .option("--client-type <type>", "Output translation target (github|claude|auto)", "auto")
    .option("--provider <provider>", "Agent provider (github|claude|gemini)", "github")
    .option("--agent-command <command>", "Child ACP agent command", "cat")
    .option("--agent-arg <arg...>", "Arguments passed to child command (Copilot flags stripped)", [])
    .option("--cwd <cwd>", "Working directory for child process", process.cwd())
    .option("--port <port>", "Preferred observer port", "1618")
    .action(async (options: RuntimeOptions) => {
      await runBridge(options, true);
    });

  return program;
}

export async function runCompatFromRawArgs(rawArgs: string[]): Promise<boolean> {
  const hasCopilotServerFlags = rawArgs.includes("--stdio") || rawArgs.includes("--headless");
  const hasSubcommand = rawArgs.some((arg) => arg === "start" || arg === "ui" || arg === "help");
  if (!hasCopilotServerFlags || hasSubcommand) {
    return false;
  }

  const getOption = (name: string): string | undefined => {
    const index = rawArgs.findIndex((arg) => arg === name);
    if (index === -1 || index + 1 >= rawArgs.length) {
      return undefined;
    }
    const candidate = rawArgs[index + 1];
    return candidate.startsWith("--") ? undefined : candidate;
  };

  const rawAgentArg = ((): string[] => {
    const idx = rawArgs.findIndex((a) => a === "--agent-arg");
    if (idx === -1 || idx + 1 >= rawArgs.length) return [];
    const rest = rawArgs.slice(idx + 1);
    return rest.filter((a) => !a.startsWith("--"));
  })();
  await runBridge(
    {
      mode: (getOption("--mode") as MeshMode | undefined) ?? "github",
      clientType: (getOption("--client-type") as MeshMode | undefined) ?? "github",
      provider: (getOption("--provider") as Provider | undefined) ?? "github",
      agentCommand: getOption("--agent-command") ?? "cat",
      agentArg: stripCopilotArgs(rawAgentArg),
      cwd: getOption("--cwd") ?? process.cwd(),
    },
    false,
  );

  return true;
}

async function runBridge(options: RuntimeOptions, withUi: boolean): Promise<void> {
  const eventBus = new ObserverEventBus();
  const agentArgs = stripCopilotArgs(options.agentArg ?? []);
  const engine = new BridgeEngine({
    mode: options.mode,
    clientType: options.clientType,
    provider: options.provider ?? "github",
    agentCommand: options.agentCommand,
    agentArgs,
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
