import { Command } from "commander";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { BridgeEngine } from "./bridge/index.js";
import type { MeshMode, Provider } from "./types.js";
import { ObserverEventBus } from "./ui/events.js";
import { startObserverServer } from "./ui/server.js";
import { EXIT, exit } from "./exit-codes.js";
import { getEnv } from "./env-defaults.js";
import {
  getDataDir,
  configGet,
  configSet,
  configEdit,
  isConfigKey,
  type ConfigKey,
} from "./config.js";
import {
  startGatewayServer,
  parseListen,
  type GatewayServeOptions,
} from "./gateway/server.js";

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

interface StdioOptions {
  server?: string;
  token?: string;
  protocol: "auto" | "copilot" | "acp";
  agent: string;
  connectTimeout?: number;
  requestTimeout: number;
  logLevel: string;
  logFormat: "text" | "json";
  mode: MeshMode;
  clientType: MeshMode;
  provider: Provider;
  agentCommand: string;
  agentArgs: string[];
  cwd: string;
}

interface RuntimeOptions {
  mode: MeshMode;
  clientType: MeshMode;
  provider: Provider;
  agentCommand: string;
  agentArg: string[];
  cwd: string;
  port?: number;
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
  const agentArgs = stripCopilotArgs(options.agentArg ?? []);
  const engine = new BridgeEngine({
    mode: options.mode,
    clientType: options.clientType,
    provider: options.provider,
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

export function createProgram(): Command {
  const program = new Command();
  program
    .name("meshaway")
    .description("Meshaway CLI — stdio adapter (default), gateway (serve), status, logs, config")
    .version("0.1.0");

  // ---- Default: stdio adapter (meshaway [options]) ----
  program
    .option("--server <url>", "Forward all traffic to a running server")
    .option("--token <token>", "Auth token for connecting to a remote gateway")
    .option("--protocol <auto|copilot|acp>", "Protocol to speak on stdio", "auto")
    .option("--agent <name>", "Default backend route when not using a gateway")
    .option("--connect-timeout <ms>", "Connection timeout in ms")
    .option("--request-timeout <ms>", "Request timeout in ms", "60000")
    .option("--log-level <level>", "Log level: error, warn, info, debug", "info")
    .option("--log-format <format>", "Log format: text or json", "text")
    .option("--mode <mode>", "Input mode (github|claude|auto)", "auto")
    .option("--client-type <type>", "Output translation (github|claude|auto)", "auto")
    .option("--provider <provider>", "Agent provider (github|claude|gemini)", "github")
    .option("--agent-command <command>", "Child ACP agent command")
    .option("--agent-arg <arg...>", "Arguments passed to child command", [])
    .option("--cwd <cwd>", "Working directory for child process")
    .action(async (opts: Record<string, string | undefined>) => {
      const server = opts.server ?? getEnv("GATEWAY");
      if (server) {
        process.stderr.write("Forwarding to gateway is not yet implemented. Use local stdio or run `meshaway serve`.\n");
        exit(EXIT.GATEWAY_FAILURE);
      }

      const protocol = (opts.protocol ?? getEnv("MODE") ?? "auto") as "auto" | "copilot" | "acp";
      const mode = (opts.mode ?? getEnv("MODE") ?? "auto") as MeshMode;
      const clientType = (opts.clientType ?? "auto") as MeshMode;
      const provider = (opts.provider ?? "github") as Provider;
      const agentFromEnv = getEnv("AGENT");
      const agentCommand = opts.agentCommand ?? opts.agent ?? agentFromEnv ?? "cat";
      const requestTimeout = parseInt(String(opts.requestTimeout ?? "60000"), 10) || 60000;
      const cwd = opts.cwd ?? process.cwd();
      const agentArg = Array.isArray(opts.agentArg) ? opts.agentArg : [];

      await runBridge(
        {
          mode: protocol === "copilot" ? "github" : protocol === "acp" ? "auto" : mode,
          clientType: protocol === "copilot" ? "github" : protocol === "acp" ? "claude" : clientType,
          provider,
          agentCommand,
          agentArg: stripCopilotArgs(agentArg),
          cwd,
        },
        false,
      );
    });

  // ---- meshaway serve ----
  const serveCmd = program
    .command("serve")
    .description("Start the Meshaway gateway for remote SDKs and stdio shims")
    .option("--listen <host:port>", "Listen address", "127.0.0.1:7777")
    .option("--public-url <url>", "Public URL for snippets")
    .option("--auth <type>", "Auth: none, token, oidc, mtls", "none")
    .option("--token <token>", "Static auth token (when --auth token)")
    .option("--tls-cert <path>", "TLS certificate path")
    .option("--tls-key <path>", "TLS key path")
    .option("--insecure", "Allow insecure (warn loudly)")
    .option("--data-dir <path>", "Data directory", "~/.meshaway")
    .option("--log-level <level>", "Log level", "info");

  serveCmd
    .action(async (opts: Record<string, string | undefined>) => {
      const dataDir = opts.dataDir
        ? path.resolve(opts.dataDir.replace(/^~/, homedir()))
        : getDataDir();
      const { host, port } = parseListen(opts.listen ?? "127.0.0.1:7777");
      const auth = (opts.auth ?? "none") as GatewayServeOptions["auth"];
      const token = opts.token;

      const gatewayOptions: GatewayServeOptions = {
        host,
        port,
        auth,
        token: auth === "token" ? token : undefined,
        publicUrl: opts.publicUrl,
      };

      try {
        const handle = await startGatewayServer(gatewayOptions);
        process.stderr.write(`Gateway listening on http://${handle.host}:${handle.port}\n`);
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
        exit(EXIT.GATEWAY_FAILURE);
      }
    });

  // ---- meshaway serve ui ----
  const serveUiCmd = serveCmd
    .command("ui")
    .description("Start the gateway plus web dashboard")
    .option("--open", "Open dashboard in browser");

  serveUiCmd
    .option("--listen <host:port>", "Listen address", "127.0.0.1:7777")
    .action(async (opts: Record<string, string | undefined>) => {
      const listen = (opts as { listen?: string }).listen ?? "127.0.0.1:7777";
      const { host, port } = parseListen(listen);
      const doOpen = (opts as { open?: boolean }).open ?? false;

      const eventBus = new ObserverEventBus();
      const engine = new BridgeEngine({
        mode: "auto",
        clientType: "github",
        provider: "github",
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
      process.stderr.write(`Gateway + UI at ${url}\n`);
      if (doOpen) openBrowser(url);
      engine.start();

      await new Promise<void>(() => { });
    });


  program
    .command("ui")
    .description("Launch observer dashboard and run bridge")
    .option("--mode <mode>", "Input mode", "auto")
    .option("--client-type <type>", "Output translation", "auto")
    .option("--provider <provider>", "Agent provider", "github")
    .option("--agent-command <command>", "Child ACP agent command", "cat")
    .option("--agent-arg <arg...>", "Arguments for child", [])
    .option("--cwd <cwd>", "Working directory")
    .option("--port <port>", "Observer port", "1618")
    .action(async (opts: Record<string, string | undefined>) => {
      await runBridge(
        {
          mode: (opts.mode ?? "auto") as MeshMode,
          clientType: (opts.clientType ?? "auto") as MeshMode,
          provider: (opts.provider ?? "github") as Provider,
          agentCommand: opts.agentCommand ?? "cat",
          agentArg: stripCopilotArgs(Array.isArray(opts.agentArg) ? opts.agentArg : []),
          cwd: opts.cwd ?? process.cwd(),
          port: Number(opts.port ?? 1618),
        },
        true,
      );
    });

  // ---- meshaway status ----
  program
    .command("status")
    .description("Show runtime and connectivity")
    .action(async () => {
      const gateway = getEnv("GATEWAY");
      if (gateway) {
        process.stdout.write(JSON.stringify({ gateway, mode: "client" }, null, 2) + "\n");
      } else {
        process.stdout.write(JSON.stringify({ mode: "stdio" }, null, 2) + "\n");
      }
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
    .description("Manage config (gateway.url, gateway.token, default.agent, log.level)")
    .option("--data-dir <path>", "Config/data directory", "~/.meshaway");

  configCmd
    .command("get <key>")
    .description("Get config value")
    .option("--data-dir <path>", "Config/data directory")
    .action(async (key: string) => {
      const dataDir = configDataDir();
      if (!isConfigKey(key)) {
        process.stderr.write(`Unknown key. Suggested: gateway.url, gateway.token, default.agent, log.level\n`);
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
        process.stderr.write(`Unknown key. Suggested: gateway.url, gateway.token, default.agent, log.level\n`);
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

  return program;
}

export async function runCompatFromRawArgs(rawArgs: string[]): Promise<boolean> {
  const hasCopilotServerFlags = rawArgs.includes("--stdio") || rawArgs.includes("--headless");
  const hasSubcommand = rawArgs.some(
    (arg) =>
      arg === "serve" ||
      arg === "status" ||
      arg === "logs" ||
      arg === "config" ||
      arg === "ui",
  );
  if (!hasCopilotServerFlags || hasSubcommand) {
    return false;
  }

  const getOption = (name: string): string | undefined => {
    const index = rawArgs.findIndex((arg) => arg === name);
    if (index === -1 || index + 1 >= rawArgs.length) return undefined;
    const candidate = rawArgs[index + 1];
    return candidate.startsWith("--") ? undefined : candidate;
  };

  const rawAgentArg = ((): string[] => {
    const idx = rawArgs.findIndex((a) => a === "--agent-arg");
    if (idx === -1 || idx + 1 >= rawArgs.length) return [];
    return rawArgs.slice(idx + 1).filter((a) => !a.startsWith("--"));
  })();

  await runBridge(
    {
      mode: (getOption("--mode") as MeshMode | undefined) ?? "github",
      clientType: (getOption("--client-type") as MeshMode | undefined) ?? "github",
      provider: (getOption("--provider") as Provider | undefined) ?? "github",
      agentCommand: getOption("--agent-command") ?? getOption("--agent") ?? "cat",
      agentArg: stripCopilotArgs(rawAgentArg),
      cwd: getOption("--cwd") ?? process.cwd(),
    },
    false,
  );

  return true;
}
