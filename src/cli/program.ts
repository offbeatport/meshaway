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
    .description("Meshaway — Bridge + Hub for agentic tools")
    .version(getPackageJsonVersion())
    .option("--hub-listen <host:port>", "Hub listen address", DEFAULT_HUB_LISTEN)
    .option("--hub <url>", "Connect bridge to Hub URL")
    .option("--no-hub", "Standalone bridge (no hub)")
    .option("-v, --verbose", "Verbose logging")
    .option("--log-level <level>", "Log level", "info")
    .option("--log-format <format>", "Log format: text or json", "text");

  function showInfo(): void {
    const version = getPackageJsonVersion();
    process.stdout.write(chalk.bold("Meshaway") + ` v${version}\n\n`);
    process.stdout.write("Bridge and Hub for agentic tools. Connects SDKs (e.g. GitHub Copilot, ACP)\n");
    process.stdout.write("to backends (e.g. ACP providers, OpenAI-compatible APIs) via a local Hub.\n\n");
    process.stdout.write("Usage:\n");
    process.stdout.write("  meshaway hub       Start Hub (web UI, sessions, playground)\n");
    process.stdout.write("  meshaway bridge    Start Bridge in stdio mode (for cliPath)\n");
    process.stdout.write("  meshaway doctor    Run environment checks\n");
    process.stdout.write("  meshaway status    Show runtime status\n\n");
    process.stdout.write("Examples:\n");
    process.stdout.write("  meshaway hub --listen 127.0.0.1:7337   # Hub on custom port\n");
    process.stdout.write("  meshaway bridge --backend acp:gemini-cli # Bridge for Copilot/ACP\n\n");
    process.stdout.write("  meshaway --help for options.  meshaway <command> --help for command help.\n");
  }

  program
    .command("info", { isDefault: true, hidden: true })
    .description("Show info and usage")
    .action(showInfo);

  program
    .command("hub")
    .description("Start Hub only")
    .option("--listen <host:port>", "Listen address", DEFAULT_HUB_LISTEN)
    .option("--port <port>", "Port (default 7337)")
    .option("--log-level <level>", "Log level", "info")
    .action((opts: Record<string, string | boolean | undefined>) =>
      runHub(opts)
    );

  program
    .command("bridge")
    .description("Start Bridge (stdio)")
    .option("--hub <url>", "Connect to Hub")
    .option("--no-hub", "Standalone bridge")
    .option("--backend <specifier>", "Backend")
    .option("-v, --verbose")
    .option("--log-level <level>", "Log level", "info")
    .option("--log-format <format>", "Log format", "text")
    .action((opts: Record<string, unknown>) => runBridge(opts));

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
