/**
 * Meshaway CLI — single-file entry: program, commands, and utils.
 */

import { Command } from "commander";
import chalk from "chalk";
import { spawn } from "node:child_process";
import { readFileSync, existsSync, openSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_HUB_LISTEN } from "./shared/constants.js";
import { parseListen } from "./shared/net.js";
import { getLogger, initLogger, LogLevel, LogFormat } from "./shared/logging.js";
import { getEnv } from "./shared/env.js";
import { EXIT, exit } from "./shared/errors.js";
import { startHub } from "./hub/server.js";
import { runStdioBridge } from "./bridge/stdio.js";

// --- utils ---

function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

function getPackageJsonVersion(): string {
  try {
    const candidates = [
      join(process.cwd(), "package.json"),
      join(process.cwd(), "..", "package.json"),
    ];
    for (const p of candidates) {
      if (existsSync(p)) {
        const raw = readFileSync(p, "utf8");
        const pkg = JSON.parse(raw) as { version?: string };
        return pkg?.version ?? "0.1.0";
      }
    }
  } catch {
    // fallthrough
  }
  return "0.1.0";
}


// --- program ---

export function createProgram(): Command {
  const program = new Command();

  program
    .name("meshaway")
    .description("Meshaway — Simple Bridge + Monitor Hub")
    .version(getPackageJsonVersion())
    .option("--log-level <level>", "Log level", "info")
    .option("--log-format <format>", "Log format: text or json", "text")
    .action(() => {
      const version = getPackageJsonVersion();
      const help = [
        chalk.bold("Meshaway") + ` v${version}\n`,
        "Bridge and Hub for agentic tools. Connects SDKs (e.g. GitHub Copilot SDK)",
        "to ACP provider agents (e.g. gemeni-cli, opencode etc.).\n",
        "Usage:",
        "  meshaway hub       Start Hub (monitor sessions, playground)",
        "  meshaway bridge    Start Bridge in stdio mode",
        "  meshaway doctor    Run environment checks",
        "Examples:",
        "  meshaway hub --listen 127.0.0.1:7337   # Hub on custom port",
        "  meshaway bridge --agent gemini # Bridge for Copilot/ACP\n",
        "  meshaway --help for options.  meshaway <command> --help for command help.",
      ].join("\n");
      getLogger().info(help);
    });

  program
    .command("hub")
    .description("Start Hub only")
    .option("--listen <host:port>", "Listen address", DEFAULT_HUB_LISTEN)
    .option("--port <port>", "Port (default 7337)")
    .option("--no-open", "Do not open the browser automatically")
    .option("--log-level <level>", "Log level", "info")
    .option("--log-format <format>", "Log format", "text")
    .action(async (opts: Record<string, string | boolean | undefined>) => {
      initLogger((opts.logLevel as LogLevel) || "info", (opts.logFormat as LogFormat || "text"));

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
        getLogger().info(`Hub UI:      ${url}`);
        getLogger().info("Press Ctrl+C to stop.");
        if (opts.open !== false && !process.env.MESH_NO_OPEN_BROWSER) {
          openBrowser(url);
        }

        await new Promise<void>((_, reject) => {
          process.on("SIGINT", () =>
            handle.close().then(() => process.exit(EXIT.SUCCESS)).catch(reject)
          );
          process.on("SIGTERM", () =>
            handle.close().then(() => process.exit(EXIT.SUCCESS)).catch(reject)
          );
        });
      } catch (err) {
        getLogger().error(String(err));
        exit(EXIT.SERVER_FAILURE);
      }
    });

  program
    .command("bridge")
    .description("Start Bridge (stdio)")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .option("--agent <specifier>", "Agent command specifier (e.g. gemini)")
    .option("--agent-args <args...>", "Extra arguments for the agent")
    .option("--log-level <level>", "Log level", "info")
    .option("--log-format <format>", "Log format", "text")
    .action(async (opts: Record<string, unknown>) => {
      try {
        initLogger(
          (opts.logLevel as LogLevel || "info"),
          (opts.logFormat as LogFormat || "text")
        );
        await runStdioBridge(opts.agent as string, opts.agentArgs as string[]);
      } catch (err) {
        getLogger().error(String(err));
        exit(EXIT.SERVER_FAILURE);
      }
    });

  program
    .command("doctor")
    .description("Environment checks and fixes")
    .option("--data-dir <path>", "Data directory", "~/.meshaway")
    .action(async (opts: { dataDir?: string }) => {

      const log = getLogger();
      log.info("Meshaway doctor");
      log.info("───────────────────────────────────────────────────────────────");

      const agent = getEnv("AGENT");
      if (agent) {
        log.info(`Agent (MESH_AGENT): ${agent}`);
      } else {
        log.info("Agent: not set (MESH_AGENT)");
      }

      log.info("Fix:");
      log.info("  - ACP agent:  meshaway bridge --agent gemini");
      log.info("  - Or set:      MESH_AGENT=...");
      log.info("───────────────────────────────────────────────────────────────");

    });

  return program;
}

initLogger("info", "plain");

createProgram().parse();
