import { Command } from "commander";
import chalk from "chalk";
import { DEFAULT_HUB_LISTEN } from "../shared/constants.js";
import { getPackageJsonVersion } from "./utils.js";
import { runHub } from "./commands/hub.js";
import { runBridge } from "./commands/bridge.js";
import { runDoctor } from "./commands/doctor.js";
import { runStatus } from "./commands/status.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("meshaway")
    .description("Meshaway — Simple Bridge + Monitor Hub")
    .version(getPackageJsonVersion())
    .option("-v, --verbose", "Verbose logging")
    .option("--log-level <level>", "Log level", "info")
    .option("--log-format <format>", "Log format: text or json", "text")
    .action(() => {
      const version = getPackageJsonVersion();
      process.stdout.write(chalk.bold("Meshaway") + ` v${version}\n\n`);
      process.stdout.write("Bridge and Hub for agentic tools. Connects SDKs (e.g. GitHub Copilot SDK)\n");
      process.stdout.write("to ACP provider backends (e.g. gemeni-cli, opencode etc.).\n\n");
      process.stdout.write("Usage:\n");
      process.stdout.write("  meshaway hub       Start Hub (monitor sessions, playground)\n");
      process.stdout.write("  meshaway bridge    Start Bridge in stdio mode\n");
      process.stdout.write("  meshaway doctor    Run environment checks\n");
      process.stdout.write("  meshaway status    Show runtime status\n\n");
      process.stdout.write("Examples:\n");
      process.stdout.write("  meshaway hub --listen 127.0.0.1:7337   # Hub on custom port\n");
      process.stdout.write("  meshaway bridge --agent acp:gemini-cli # Bridge for Copilot/ACP\n\n");
      process.stdout.write("  meshaway --help for options.  meshaway <command> --help for command help.\n");
    });

  program
    .command("hub")
    .description("Start Hub only")
    .option("--listen <host:port>", "Listen address", DEFAULT_HUB_LISTEN)
    .option("--port <port>", "Port (default 7337)")
    .option("--no-open", "Do not open the browser automatically")
    .option("--log-level <level>", "Log level", "info")
    .action((opts: Record<string, string | boolean | undefined>) =>
      runHub(opts)
    );

  program
    .command("bridge")
    .description("Start Bridge (stdio)")
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .option("--agent <specifier>", "Agent/backend specifier (e.g. acp:gemini-cli)")
    .option("--agent-args <args...>", "Extra arguments for the agent")
    .option("--log-level <level>", "Log level", "info")
    .option("--log-format <format>", "Log format", "text")
    .action((opts: Record<string, unknown>) => runBridge(opts))

  program
    .command("doctor")
    .description("Environment checks and fixes")
    .option("--data-dir <path>", "Data directory", "~/.meshaway")
    .action((opts: { dataDir?: string }) => runDoctor(opts));

  program
    .command("status")
    .description("Runtime and connectivity status")
    .option("--data-dir <path>", "Data directory", "~/.meshaway")
    .action((opts: { dataDir?: string }) => runStatus(opts));

  return program;
}
