import { Command } from "commander";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { BridgeEngine } from "./bridge/bridge-engine.js";
import type { MeshMode } from "./types.js";
import { ObserverEventBus } from "./ui/events.js";
import { startObserverServer } from "./ui/server.js";
import { EXIT, exit } from "./exit-codes.js";
import { getEnv } from "./env-defaults.js";
import {
  getDataDir,
  getConfigPath,
  configGet,
  configSet,
  configEdit,
  isConfigKey,
  type ConfigKey,
  readFullConfig,
  listAgents,
  resolveAgentConfig,
} from "./config.js";
import {
  startServer,
  parseListen,
  type ServerServeOptions,
} from "./server/server.js";

/**
 * Strip flags (and their optional value) from args. Used by SDK-specific strippers.
 */
function stripFlagsFromArgs(args: string[], flags: string[]): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    const flag = flags.find((f) => arg === f || arg.startsWith(`${f}=`));
    if (flag) {
      if (arg === flag && i + 1 < args.length && !args[i + 1].startsWith("-")) {
        i += 1;
      }
      i += 1;
      continue;
    }
    out.push(arg);
    i += 1;
  }
  return out;
}

function getCopilotStripFlags(): string[] {
  return [
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
}

function stripCopilotFlags(args: string[]): string[] {
  return stripFlagsFromArgs(args, getCopilotStripFlags());
}

function getClaudeStripFlags(): string[] {
  return [
    "--path-to-executable",
    "--log-level",
    "--verbose",
    "-v",
    "--quiet",
    "-q",
  ];
}

function stripClaudeFlags(args: string[]): string[] {
  return stripFlagsFromArgs(args, getClaudeStripFlags());
}

/** Known SDK callers; used to strip only that SDK's flags when detectable. */
type SdkKind = "copilot" | "claude" | "cursor";

const SDK_KINDS: SdkKind[] = ["copilot", "claude", "cursor"];

/**
 * Detect which SDK/IDE is invoking the CLI so we can strip only that SDK's flags.
 * Uses MESHAWAY_SDK override (copilot|claude|cursor), then TERM_PROGRAM (Cursor vs vscode), etc.
 */
function detectSdkCaller(): SdkKind | undefined {
  const override = process.env.MESHAWAY_SDK;
  if (override && SDK_KINDS.includes(override as SdkKind)) {
    return override as SdkKind;
  }
  const term = process.env.TERM_PROGRAM;
  if (term === "Cursor") return "cursor";
  if (term === "vscode") return "copilot";
  return undefined;
}


/** Strip SDK-specific flags. If caller is detected (or passed), only that SDK's flags are stripped; otherwise all. */
function stripSdkFlags(args: string[], sdk?: SdkKind): string[] {
  const who = sdk ?? detectSdkCaller();
  switch (who) {
    case "copilot":
      return stripCopilotFlags(args);
    case "claude":
      return stripClaudeFlags(args);
    case "cursor":
      return stripCopilotFlags(args);
    default:
      return stripClaudeFlags(stripCopilotFlags(args));
  }
}

interface RuntimeOptions {
  /** Logical client type (github|claude|auto) — used for both input and output. */
  clientType: MeshMode;
  agentCommand: string;
  agentArg: string[];
  cwd: string;
  port?: number;
  /** When set, use remote HTTP agent instead of spawning agentCommand. */
  agentUrl?: string;
  apiKeyEnv?: string;
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

async function runBridge(options: RuntimeOptions, withUi: boolean): Promise<void> {
  const eventBus = new ObserverEventBus();
  const agentArgs = stripSdkFlags(options.agentArg ?? []);
  const engine = new BridgeEngine({
    clientType: options.clientType,
    agentCommand: options.agentCommand,
    agentArgs,
    cwd: options.cwd,
    eventBus,
    agentUrl: options.agentUrl,
    apiKeyEnv: options.apiKeyEnv,
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

export function createProgram(): Command {
  const program = new Command();
  program
    .name("meshaway")
    .description("Meshaway CLI — stdio adapter (default), server (serve), status, logs, config")
    .version("0.1.0")
    .allowExcessArguments(true)
    .allowUnknownOption(true);

  // ---- Default: stdio adapter (meshaway [options]) ----
  program
    .option("--server <url>", "Forward all traffic to a running server")
    .option("--token <token>", "Auth token for connecting to a remote server")
    .option("--connect-timeout <ms>", "Connection timeout in ms")
    .option("--request-timeout <ms>", "Request timeout in ms", "60000")
    .option("--log-level <level>", "Log level: error, warn, info, debug", "info")
    .option("--log-format <format>", "Log format: text or json", "text")
    .option("--client-type <type>", "Client protocol (github|claude|auto)", "auto")
    .option("--agent <name>", "Logical agent name (from config.agents)")
    .option("--agent-arg <arg...>", "Arguments passed to agent child command", [])
    .option("--agent-command <command>", "Child ACP agent command")
    .option("--cwd <cwd>", "Working directory for child process")
    .action(async (opts: Record<string, string | undefined>) => {
      if (process.stdin.isTTY) {
        process.stdout.write(
          "meshaway is typically run by SDKs over stdio (stdin/stdout).\n" +
          "For interactive usage, try: \n" +
          "  meshaway --help\n" +
          "  meshaway serve         — start the server\n" +
          "  meshaway serve --ui    — server + dashboard\n" +
          "  meshaway status        — show runtime and connectivity\n",
        );
        exit(EXIT.SUCCESS);
      }

      const server = opts.server ?? getEnv("SERVER");
      if (server) {
        process.stderr.write("Forwarding to server is not yet implemented. Use local stdio or run `meshaway serve`.\n");
        exit(EXIT.SERVER_FAILURE);
      }

      const clientType = (opts.clientType ?? getEnv("MODE") ?? "auto") as MeshMode;
      const agentName = opts.agent ?? getEnv("AGENT") ?? undefined;
      const cwd = opts.cwd ?? process.cwd();
      const agentArg = Array.isArray(opts.agentArg) ? opts.agentArg : [];

      // Direct agent-command overrides config.
      if (opts.agentCommand) {
        await runBridge(
          {
            clientType,
            agentCommand: opts.agentCommand,
            agentArg: stripSdkFlags(agentArg),
            cwd,
          },
          false,
        );
        return;
      }

      // Otherwise, resolve from config: default.agent and agents[].
      const dataDir = getDataDir();
      const defaultAgent = (await configGet(dataDir, "default.agent")) ?? undefined;
      const resolvedName = agentName ?? defaultAgent;
      const resolved = await resolveAgentConfig(dataDir, resolvedName);
      const agentCommand = resolved?.command ?? "cat";
      const combinedArgs = [
        ...(resolved?.args ?? []),
        ...stripSdkFlags(agentArg),
      ];
      const runOpts: RuntimeOptions = {
        clientType,
        agentCommand,
        agentArg: combinedArgs,
        cwd,
      };
      if (resolved?.type === "remote" && resolved.url) {
        runOpts.agentUrl = resolved.url;
        if (resolved.apiKeyEnv) runOpts.apiKeyEnv = resolved.apiKeyEnv;
      }

      await runBridge(runOpts, false);
    });

  // ---- meshaway serve ----
  program
    .command("serve")
    .description("Start the Meshaway server for remote SDKs and stdio shims")
    .option("--listen <host:port>", "Listen address", "127.0.0.1:7777")
    .option("--ui", "Start server with web dashboard")
    .option("--no-open", "Do not open dashboard in browser (use with --ui)")
    .option("--public-url <url>", "Public URL for snippets")
    .option("--auth <type>", "Auth: none, token, oidc, mtls", "none")
    .option("--token <token>", "Static auth token (when --auth token)")
    .option("--tls-cert <path>", "TLS certificate path")
    .option("--tls-key <path>", "TLS key path")
    .option("--insecure", "Allow insecure (warn loudly)")
    .option("--data-dir <path>", "Data directory", "~/.meshaway")
    .option("--log-level <level>", "Log level", "info")
    .action(async (opts: Record<string, string | boolean | undefined>) => {
      const withUi = opts.ui === true;
      const doOpen = opts.open !== false;
      const listen = typeof opts.listen === "string" ? opts.listen : "127.0.0.1:7777";
      const { host, port } = parseListen(listen);

      if (withUi) {
        const eventBus = new ObserverEventBus();
        const engine = new BridgeEngine({
          clientType: "github",
          agentCommand: "cat",
          agentArgs: [],
          cwd: process.cwd(),
          eventBus,
        });

        const observer = await startObserverServer({
          eventBus,
          onPermissionDecision: (id, decision) => engine.resolvePermission({ id, decision }),
          listenHost: host,
          listenPort: port,
        });

        const url = `http://${host}:${observer.port}?token=${observer.token}`;
        process.stderr.write(`Server + UI at ${url}\n`);
        if (doOpen) openBrowser(url);
        engine.start();

        await new Promise<void>(() => { });
      } else {
        const auth = (typeof opts.auth === "string" ? opts.auth : "none") as ServerServeOptions["auth"];
        const token = typeof opts.token === "string" ? opts.token : undefined;

        const serverOptions: ServerServeOptions = {
          host,
          port,
          auth,
          token: auth === "token" ? token : undefined,
          publicUrl: typeof opts.publicUrl === "string" ? opts.publicUrl : undefined,
        };

        try {
          const handle = await startServer(serverOptions);
          process.stderr.write(`Server listening on http://${handle.host}:${handle.port}\n`);
          process.stderr.write("Press Ctrl+C to stop.\n");
          await new Promise<void>((_, reject) => {
            process.on("SIGINT", () => {
              handle.close().then(() => process.exit(EXIT.SUCCESS)).catch(reject);
            });
            process.on("SIGTERM", () => {
              handle.close().then(() => process.exit(EXIT.SUCCESS)).catch(reject);
            });
          });
        } catch (err) {
          process.stderr.write(String(err) + "\n");
          exit(EXIT.SERVER_FAILURE);
        }
      }
    });

  // ---- meshaway status ----
  program
    .command("status")
    .description("Show runtime and connectivity")
    .option("--data-dir <path>", "Config/data directory", "~/.meshaway")
    .action(async (opts: { dataDir?: string }) => {
      const dataDir = opts.dataDir
        ? path.resolve(opts.dataDir.replace(/^~/, homedir()))
        : getDataDir();

      const serverUrl = getEnv("SERVER");
      if (serverUrl) {
        const token = getEnv("TOKEN");
        process.stdout.write(
          JSON.stringify(
            {
              mode: "client",
              server: serverUrl,
              ...(token ? { token: "***" } : {}),
            },
            null,
            2,
          ) + "\n",
        );
        return;
      }

      const [configAgent, configServerUrl, configLogLevel] = await Promise.all([
        configGet(dataDir, "default.agent"),
        configGet(dataDir, "server.url"),
        configGet(dataDir, "log.level"),
      ]);

      const format = getEnv("MODE") ?? "auto";
      const agent = getEnv("AGENT") ?? configAgent ?? "cat";
      const logLevel = getEnv("LOG_LEVEL") ?? configLogLevel ?? "info";

      const stdioStatus = {
        mode: "stdio",
        format,
        agent,
        cwd: process.cwd(),
        logLevel,
        version: "0.1.0",
        configPath: getConfigPath(dataDir),
        ...(configServerUrl
          ? { serverConfigured: configServerUrl, serverUsed: false }
          : {}),
      };

      process.stdout.write(JSON.stringify(stdioStatus, null, 2) + "\n");
    });

  // ---- meshaway logs ----
  program
    .command("logs")
    .description("Tail logs")
    .option("-f, --follow", "Follow log output")
    .option("--session <id>", "Filter by session id")
    .option("--since <duration>", "Logs since (e.g. 1h)")
    .action(async (opts: { follow?: boolean; session?: string; since?: string }) => {
      process.stderr.write("Log aggregation not yet implemented. Use --log-level for process output.\n");
    });

  // ---- meshaway config ----
  const configDataDir = () => {
    const args = process.argv.slice(2);
    const idx = args.indexOf("--data-dir");
    const val = idx >= 0 && args[idx + 1] && !args[idx + 1].startsWith("-") ? args[idx + 1] : undefined;
    return val ? path.resolve(val.replace(/^~/, homedir())) : getDataDir();
  };

  const configCmd = program
    .command("config")
    .description("Manage config (server.url, server.token, default.agent, log.level, agents)")
    .option("--data-dir <path>", "Config/data directory", "~/.meshaway");

  configCmd
    .command("get <key>")
    .description("Get config value")
    .option("--data-dir <path>", "Config/data directory")
    .action(async (key: string) => {
      const dataDir = configDataDir();
      if (!isConfigKey(key)) {
        process.stderr.write(`Unknown key. Suggested: server.url, server.token, default.agent, log.level\n`);
        exit(EXIT.INVALID_ARGS);
      }
      const value = await configGet(dataDir, key);
      if (value !== undefined) process.stdout.write(value + "\n");
    });

  configCmd
    .command("set <key> <value>")
    .description("Set config value")
    .option("--data-dir <path>", "Config/data directory")
    .action(async (key: string, value: string) => {
      const dataDir = configDataDir();
      if (!isConfigKey(key)) {
        process.stderr.write(`Unknown key. Suggested: server.url, server.token, default.agent, log.level\n`);
        exit(EXIT.INVALID_ARGS);
      }
      await configSet(dataDir, key as ConfigKey, value);
      process.stdout.write(`Set ${key}\n`);
    });

  configCmd
    .command("edit")
    .description("Edit config file with $EDITOR")
    .option("--data-dir <path>", "Config/data directory")
    .action(async () => {
      await configEdit(configDataDir());
    });

  configCmd
    .command("show")
    .description("Show full config object as JSON")
    .option("--data-dir <path>", "Config/data directory")
    .action(async () => {
      const dataDir = configDataDir();
      const full = await readFullConfig(dataDir);
      process.stdout.write(JSON.stringify(full, null, 2) + "\n");
    });

  // ---- meshaway agents ----
  program
    .command("agents")
    .description("List configured agents from config.json")
    .option("--data-dir <path>", "Config/data directory", "~/.meshaway")
    .action(async (opts: { dataDir?: string }) => {
      const dataDir = opts.dataDir
        ? path.resolve(opts.dataDir.replace(/^~/, homedir()))
        : getDataDir();
      const agents = await listAgents(dataDir);
      if (agents.length === 0) {
        process.stdout.write("No agents configured. Use `meshaway config edit` to add an agents[] array.\n");
        return;
      }
      for (const agent of agents) {
        const summaryParts: string[] = [];
        if (agent.type) summaryParts.push(agent.type);
        if (agent.command) summaryParts.push(agent.command);
        if (agent.url) summaryParts.push(agent.url);
        const summary = summaryParts.length ? ` (${summaryParts.join(" · ")})` : "";
        process.stdout.write(`- ${agent.name}${summary}\n`);
      }
    });

  return program;
}
