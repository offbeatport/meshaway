import { Command } from "commander";
import chalk from "chalk";
import {
  DEFAULT_BRIDGE_LISTEN,
  DEFAULT_HUB_LISTEN,
} from "../shared/constants.js";
import { startHub } from "../hub/server.js";
import { startBridgeServer } from "../bridge/server.js";
import { initLogger } from "../shared/logging.js";
import { EXIT, exit } from "../shared/errors.js";
import { parseListenWithDefault } from "./utils.js";
import { getEnv } from "../shared/env.js";
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
    .option("--listen <host:port>", "Bridge listen address", DEFAULT_BRIDGE_LISTEN)
    .option("--hub-listen <host:port>", "Hub listen address", DEFAULT_HUB_LISTEN)
    .option("--hub <url>", "Connect bridge to Hub URL")
    .option("--no-hub", "Standalone bridge (no hub)")
    .option("--backend <specifier>", "Backend (acp:* or openai-compat:*)")
    .option("-v, --verbose", "Verbose logging")
    .option("--log-level <level>", "Log level", "info")
    .option("--log-format <format>", "Log format: text or json", "text")
    .action(async (opts: Record<string, unknown>) => {
      initLogger(
        String((opts.verbose ? "debug" : opts.logLevel) || "info"),
        String((opts.logFormat as string) || "text")
      );

      const hubListen =
        (opts.hubListen as string) || getEnv("HUB_LISTEN") || DEFAULT_HUB_LISTEN;
      const bridgeListen =
        (opts.listen as string) || getEnv("LISTEN") || DEFAULT_BRIDGE_LISTEN;
      const backend =
        (opts.backend as string) || getEnv("BACKEND") || (await import("./utils.js").then((m) => m.detectOllamaBackend()));

      const hub = parseListenWithDefault(hubListen, DEFAULT_HUB_LISTEN);
      const bridge = parseListenWithDefault(bridgeListen, DEFAULT_BRIDGE_LISTEN);
      const hubBaseUrl = `http://${hub.host}:${hub.port}`;

      const [hubHandle, bridgeHandle] = await Promise.all([
        startHub({ host: hub.host, port: hub.port }),
        startBridgeServer(bridgeListen, {
          hubUrl: hubBaseUrl,
          backend: backend ?? undefined,
        }),
      ]);

      const hubUrl = `http://${hubHandle.host}:${hubHandle.port}`;
      const bridgeUrl = `http://${bridgeHandle.host}:${bridgeHandle.port}`;

      const backendDisplay = backend ?? "not configured";
      const version = getPackageJsonVersion();

      process.stderr.write("\n");
      process.stderr.write(chalk.bold("Meshaway") + "\n");
      process.stderr.write(
        "───────────────────────────────────────────────────────────────\n"
      );
      process.stderr.write(`Version:     v${version} (local)\n`);
      process.stderr.write(`Hub UI:      ${hubUrl}\n`);
      process.stderr.write(`Bridge URL:  ${bridgeUrl}\n`);
      process.stderr.write(`Backend:     ${backendDisplay}\n`);
      process.stderr.write(`Status:      waiting for client…\n`);
      process.stderr.write("\nNext:\n");
      process.stderr.write(`  - Copilot SDK: set cliUrl = ${bridgeUrl}\n`);
      process.stderr.write(`  - Open Hub UI: ${hubUrl}\n`);
      process.stderr.write(
        "───────────────────────────────────────────────────────────────\n\n"
      );

      const { openBrowser } = await import("./utils.js");
      if (process.env.MESH_NO_OPEN_BROWSER !== "1") {
        openBrowser(hubUrl);
      }

      await new Promise<void>((_, reject) => {
        const closeAll = () =>
          Promise.all([hubHandle.close(), bridgeHandle.close()])
            .then(() => process.exit(EXIT.SUCCESS))
            .catch(reject);
        process.on("SIGINT", closeAll);
        process.on("SIGTERM", closeAll);
      });
    });

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
    .description("Start Bridge only (URL or stdio)")
    .option("--transport <mode>", "tcp or stdio", "tcp")
    .option("--listen <host:port>", "Bridge listen", DEFAULT_BRIDGE_LISTEN)
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
    .option("--agent <name>", "Agent name")
    .option("--data-dir <path>", "Data directory", "~/.meshaway")
    .action((opts: { agent?: string; dataDir?: string }) => runDoctor(opts));

  program
    .command("status")
    .description("Runtime and connectivity status")
    .option("--data-dir <path>", "Data directory", "~/.meshaway")
    .action((opts: { dataDir?: string }) => runStatus(opts));

  return program;
}
