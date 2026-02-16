import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { homedir } from "node:os";

const CONFIG_FILENAME = "config.json";

export function getDataDir(custom?: string): string {
  if (custom) return path.resolve(custom);
  return path.join(homedir(), ".meshaway");
}

export function getConfigPath(dataDir: string): string {
  return path.join(dataDir, CONFIG_FILENAME);
}

export type ConfigKey =
  | "gateway.url"
  | "gateway.token"
  | "default.agent"
  | "log.level";

const CONFIG_KEYS: ConfigKey[] = [
  "gateway.url",
  "gateway.token",
  "default.agent",
  "log.level",
];

export function isConfigKey(s: string): s is ConfigKey {
  return CONFIG_KEYS.includes(s as ConfigKey);
}

export async function configGet(dataDir: string, key: ConfigKey): Promise<string | undefined> {
  const configPath = getConfigPath(dataDir);
  try {
    const raw = await readFile(configPath, "utf8");
    const data = JSON.parse(raw) as Record<string, string>;
    return data[key];
  } catch {
    return undefined;
  }
}

export async function configSet(
  dataDir: string,
  key: ConfigKey,
  value: string,
): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const configPath = getConfigPath(dataDir);
  let data: Record<string, string> = {};
  try {
    const raw = await readFile(configPath, "utf8");
    data = JSON.parse(raw) as Record<string, string>;
  } catch {
    // start fresh
  }
  data[key] = value;
  await writeFile(configPath, JSON.stringify(data, null, 2) + "\n", "utf8");
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
