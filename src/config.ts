import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";

const CONFIG_FILENAME = "meshaway.json";

export function getDataDir(custom?: string): string {
  if (custom) return path.resolve(custom);
  return path.join(homedir(), ".meshaway");
}

export function getConfigPath(dataDir: string): string {
  return path.join(dataDir, CONFIG_FILENAME);
}

export type ConfigKey =
  | "server.url"
  | "server.token"
  | "default.agent"
  | "log.level";

const CONFIG_KEYS: ConfigKey[] = [
  "server.url",
  "server.token",
  "default.agent",
  "log.level",
];

export function isConfigKey(s: string): s is ConfigKey {
  return CONFIG_KEYS.includes(s as ConfigKey);
}

/** Full config shape as stored on disk. */
export interface AgentConfig {
  name: string;
  type?: "local" | "remote";
  command?: string;
  args?: string[];
  url?: string;
  apiKeyEnv?: string;
}

export interface FullConfig {
  [key: string]: unknown;
  agents?: AgentConfig[];
}

const DEFAULT_CONFIG: FullConfig = {
  "log.level": "info",
  "default.agent": "local-echo",
  agents: [
    // Safe local default: just echoes ACP back.
    {
      name: "local-echo",
      type: "local",
      command: "cat",
      args: [],
    },
    // ACP-capable agent defaults from https://agentclientprotocol.com/get-started/agents
    { name: "agentpool", type: "local", command: "agentpool", args: ["serve-acp"], url: "https://phil65.github.io/agentpool/advanced/acp-integration/" },
    { name: "augment-code", type: "local", command: "auggie", args: ["--acp"], url: "https://docs.augmentcode.com/cli/acp" },
    { name: "autodev", type: "local", command: "autodev", args: ["acp"], url: "https://github.com/phodal/auto-dev" },
    { name: "blackbox-ai", type: "local", command: "blackbox", args: ["--experimental-acp"], url: "https://docs.blackbox.ai/features/blackbox-cli/introduction" },
    { name: "cline", type: "local", command: "cline", args: ["--acp"], url: "https://cline.bot/" },
    { name: "codex-cli", type: "local", command: "auggie", args: ["--acp"], url: "https://developers.openai.com/codex/cli" },
    { name: "code-assistant", type: "local", command: "code-assistant", args: ["acp"], url: "https://github.com/stippi/code-assistant" },
    { name: "docker-cagent", type: "local", command: "cagent", args: [], url: "https://github.com/docker/cagent" },
    { name: "fast-agent", type: "local", command: "fast-agent", args: ["acp"], url: "https://fast-agent.ai/acp" },
    { name: "fount", type: "local", command: "fount", args: ["acp"], url: "https://github.com/steve02081504/fount" },
    { name: "gemini-cli", type: "local", command: "gemini", args: ["--experimental-acp"], url: "https://github.com/google-gemini/gemini-cli" },
    { name: "github-copilot", type: "local", command: "copilot", args: ["--acp", "--stdio"], url: "https://github.blog/changelog/2026-01-28-acp-support-in-copilot-cli-is-now-in-public-preview/" },
    { name: "goose", type: "local", command: "goose", args: ["acp"], url: "https://block.github.io/goose/docs/guides/acp-clients" },
    { name: "junie", type: "local", command: "junie", args: ["acp"], url: "https://www.jetbrains.com/junie/" },
    { name: "kimi-cli", type: "local", command: "kimi", args: ["acp"], url: "https://github.com/MoonshotAI/kimi-cli" },
    { name: "kiro-cli", type: "local", command: "kiro", args: ["acp"], url: "https://kiro.dev/docs/cli/acp/" },
    { name: "minion-code", type: "local", command: "mcode", args: ["acp"], url: "https://github.com/femto/minion-code" },
    { name: "mistral-vibe", type: "local", command: "vibe-acp", args: [], url: "https://github.com/mistralai/mistral-vibe" },
    { name: "opencode", type: "local", command: "opencode", args: ["acp"], url: "https://github.com/sst/opencode" },
    { name: "openhands", type: "local", command: "openhands", args: ["acp"], url: "https://docs.openhands.dev/openhands/usage/run-openhands/acp" },
    { name: "pi-agent", type: "local", command: "pi", args: ["acp"], url: "https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent" },
    { name: "qoder-cli", type: "local", command: "qodercli", args: ["--acp"], url: "https://docs.qoder.com/cli/acp" },
    { name: "qwen-code", type: "local", command: "qwen", args: ["acp"], url: "https://github.com/QwenLM/qwen-code" },
    { name: "stakpak-agent", type: "local", command: "stakpak", args: ["acp"], url: "https://github.com/stakpak/agent?tab=readme-ov-file#agent-client-protocol-acp" },
    { name: "vt-code", type: "local", command: "vtcode", args: ["acp"], url: "https://github.com/vinhnx/vtcode/blob/main/README.md#zed-ide-integration-agent-client-protocol" },
    // Remote: Ollama API (run `ollama serve` locally or point url at your Ollama host; see https://ollama.com/docs/api).
    { name: "ollama", type: "remote", url: "http://localhost:11434" },
  ],
};

export async function readFullConfig(dataDir: string): Promise<FullConfig> {
  const configPath = getConfigPath(dataDir);
  try {
    const raw = await readFile(configPath, "utf8");
    const data = JSON.parse(raw) as FullConfig;
    return data ?? {};
  } catch {
    return {};
  }
}

export async function writeFullConfig(dataDir: string, cfg: FullConfig): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const configPath = getConfigPath(dataDir);
  await writeFile(configPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}

/** Ensure a config file exists with sensible defaults. Called on first CLI entry. */
export async function ensureDefaultConfig(dataDir: string): Promise<void> {
  const configPath = getConfigPath(dataDir);
  try {
    await readFile(configPath, "utf8");
    return; // already exists
  } catch {
    try {
      await writeFullConfig(dataDir, DEFAULT_CONFIG);
    } catch (error) {
      // In restricted/sandboxed environments we may not be allowed to write ~/.meshaway.
      // CLI should still run with in-memory defaults.
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === "EPERM" || code === "EACCES" || code === "EROFS") return;
      throw error;
    }
  }
}

export async function configGet(dataDir: string, key: ConfigKey): Promise<string | undefined> {
  const cfg = await readFullConfig(dataDir);
  const raw = cfg[key];
  return typeof raw === "string" ? raw : undefined;
}

export async function configSet(
  dataDir: string,
  key: ConfigKey,
  value: string,
): Promise<void> {
  const cfg = await readFullConfig(dataDir);
  cfg[key] = value;
  await writeFullConfig(dataDir, cfg);
}

export async function configEdit(dataDir: string): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const configPath = getConfigPath(dataDir);
  try {
    await readFile(configPath, "utf8");
  } catch {
    await writeFile(configPath, "{}\n", "utf8");
  }
  const { execSync } = await import("node:child_process");
  const editor = process.env.EDITOR ?? process.env.VISUAL ?? "vi";
  execSync(`${editor} ${configPath}`, { stdio: "inherit" });
}

/** Return all configured agents, if any. */
export async function listAgents(dataDir: string): Promise<AgentConfig[]> {
  const cfg = await readFullConfig(dataDir);
  if (!Array.isArray(cfg.agents)) return [];
  return cfg.agents.filter((a): a is AgentConfig => typeof a?.name === "string");
}

/** Resolve an agent by name, or fall back to treating the name as a raw command. */
export async function resolveAgentConfig(
  dataDir: string,
  name: string | undefined,
): Promise<AgentConfig | undefined> {
  if (!name) return undefined;
  const agents = await listAgents(dataDir);
  const found = agents.find((a) => a.name === name);
  if (found) return found;
  // Backwards-compat: if there is no structured entry, treat the name as a command.
  return { name, command: name, args: [] };
}
