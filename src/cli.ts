/**
 * Meshaway CLI — single-file entry: program, commands, and utils.
 */

import { Command, Option } from "commander";
import chalk from "chalk";
import { spawn } from "node:child_process";
import { DEFAULT_HUB_LISTEN, VERSION } from "./shared/constants.js";
import { parseListen } from "./shared/net.js";
import { log, initLogger, LogLevel, LogFormat, LOG_LEVELS, LOG_FORMATS } from "./shared/logging.js";
import { startHub } from "./hub/server.js";
import type { BridgeAdapterKind } from "./bridge/adaptors/index.js";
import { BRIDGE_ADAPTER_KINDS } from "./bridge/adaptors/index.js";
import { runStdioBridge } from "./bridge/stdio.js";

// --- utils ---

/**
 * Flags the Copilot SDK appends when it spawns the "CLI" (our bridge). Strip them
 * so they don't affect our parsing or get passed through (see github/copilot-sdk
 * nodejs/src/client.ts startCLIServer).
 */
const COPILOT_SDK_STRIP_FLAGS = new Set([
  "--headless",
  "--no-auto-update",
  "--stdio",
  "--no-auto-login",
  "--auth-token-env",
  "--port",
]);

/** Skip the next argv element (used for flags that take a value). */
const COPILOT_SDK_STRIP_VALUE = new Set(["--port", "--auth-token-env"]);

function stripCopilotSdkArgs(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (COPILOT_SDK_STRIP_FLAGS.has(arg)) {
      if (COPILOT_SDK_STRIP_VALUE.has(arg)) i++;
      continue;
    }
    out.push(arg);
  }
  return out;
}

/** Parse --agent-args into an array for the spawned process (single string split by spaces). */
function normalizeAgentArgs(value: unknown): string[] {
  if (value == null) return [];
  if (typeof value === "string") return value.trim().split(/\s+/).filter(Boolean);
  if (Array.isArray(value)) {
    return value.flatMap((a) =>
      typeof a === "string" && a.includes(" ") ? a.trim().split(/\s+/).filter(Boolean) : [a]
    );
  }
  return [];
}

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

// --- program ---

export function createProgram(): Command {
  const program = new Command();

  program
    .name("meshaway")
    .description("Meshaway — Simple Bridge + Monitor Hub")
    .version(VERSION)
    .addOption(
      new Option("--log-level <level>", "Log level").choices([...LOG_LEVELS]).default("info")
    )
    .addOption(
      new Option("--log-format <format>", "Log format").choices([...LOG_FORMATS]).default("plain")
    )
    .action(async (opts: Record<string, unknown>) => {
      initLogger((opts.logLevel as LogLevel) || "info", (opts.logFormat as LogFormat) || "plain");

      const version = VERSION;
      const help = [
        chalk.bold("Meshaway") + ` v${version}\n`,
        "Bridge and Hub for agentic tools. Connects SDKs (e.g. GitHub Copilot SDK)",
        "to ACP provider agents (e.g. gemini-cli, opencode etc.).\n",
        "Usage:",
        "  meshaway bridge    Start Bridge in stdio mode",
        "  meshaway hub       Start Hub (monitor sessions, playground)",
        "Examples:",
        "  meshaway bridge --agent gemini # Bridge for Copilot/ACP\n",
        "  meshaway hub --listen 127.0.0.1:7337   # Hub on custom port",
        "  meshaway --help for options.  meshaway <command> --help for command help.",
      ].join("\n");
      log.info(help);
    });

  program
    .command("hub")
    .description("Start Hub only")
    .option("--listen <host:port>", "Listen address", DEFAULT_HUB_LISTEN)
    .option("--port <port>", "Port (default 7337)")
    .option("--no-open", "Do not open the browser automatically")
    .addOption(
      new Option("--log-level <level>", "Log level").choices([...LOG_LEVELS]).default("info")
    )
    .addOption(
      new Option("--log-format <format>", "Log format").choices([...LOG_FORMATS]).default("text")
    )
    .action(async (opts: Record<string, string | boolean | undefined>) => {
      initLogger((opts.logLevel as LogLevel) || "info", (opts.logFormat as LogFormat) || "text");

      let host: string;
      let port: number;
      if (typeof opts.listen === "string" && opts.listen) {
        ({ host, port } = parseListen(opts.listen));
      } else {
        host = "127.0.0.1";
        const p = Number(opts.port);
        port = !isNaN(p) && p > 0 && p <= 65535 ? p : 7337;
      }

      try {
        const handle = await startHub({ host, port });
        const url = `http://${handle.host}:${handle.port}`;
        log.info(`Hub UI:      ${url}`);
        log.info("Press Ctrl+C to stop.");
        if (opts.open !== false && !process.env.MESH_NO_OPEN_BROWSER) {
          openBrowser(url);
        }

        await new Promise<void>((_, reject) => {
          process.on("SIGINT", () =>
            handle.close().then(() => process.exit(0)).catch(reject)
          );
          process.on("SIGTERM", () =>
            handle.close().then(() => process.exit(0)).catch(reject)
          );
        });
      } catch (err) {
        log.error(String(err));
        process.exit(1);
      }
    });

  program
    .command("bridge")
    .description("Start Bridge (stdio)")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .option("--agent <specifier>", "Agent command specifier (e.g. gemini)")
    .option(
      "--agent-args <value>",
      "Agent arguments as one space-separated string (e.g. \"--experimental-acp --model gemini-2.5-flash\")"
    )
    .addOption(
      new Option("--adapter <adapter>", "Client adapter")
        .choices([...BRIDGE_ADAPTER_KINDS])
        .default("copilot")
    )
    .option("--hub-url <url>", "Hub URL", "http://localhost:7337")
    .addOption(
      new Option("--log-level <level>", "Log level").choices([...LOG_LEVELS]).default("info")
    )
    .addOption(
      new Option("--log-format <format>", "Log format").choices([...LOG_FORMATS]).default("plain")
    )
    .action(async (opts: Record<string, unknown>) => {
      try {
        initLogger((opts.logLevel as LogLevel) || "info", (opts.logFormat as LogFormat) || "plain");
        const hubUrl =
          (opts.hubUrl as string) ||
          process.env.MESHAWAY_HUB_URL ||
          "";
        const runnerSessionId = process.env.MESHAWAY_RUNNER_SESSION_ID ?? "";
        const agentArgs = normalizeAgentArgs(opts.agentArgs);
        await runStdioBridge(
          opts.adapter as BridgeAdapterKind,
          opts.agent as string,
          agentArgs,
          { hubUrl: hubUrl || undefined, runnerSessionId: runnerSessionId || undefined }
        );
      } catch (err) {
        log.error(String(err));
        process.exit(1);
      }
    });

  return program;
}

initLogger("info", "plain");

// When running as bridge, strip Copilot SDK-injected args so they don't confuse parsing
if (process.argv.includes("bridge")) {
  process.argv = [process.argv[0], process.argv[1], ...stripCopilotSdkArgs(process.argv.slice(2))];
}

createProgram().parse();
