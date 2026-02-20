import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseListen } from "../shared/net.js";
import { DEFAULT_HUB_LISTEN } from "../shared/constants.js";

export function openBrowser(url: string): void {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}

export function parseListenWithDefault(
  listen: string | undefined,
  fallback: string
) {
  return parseListen(
    typeof listen === "string" && listen ? listen : fallback
  );
}

export async function detectOllamaBackend(): Promise<string | undefined> {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 500);
  try {
    const res = await fetch("http://127.0.0.1:11434/api/tags", {
      signal: ctrl.signal,
    });
    return undefined;
  } catch {
    return undefined;
  }
}

export function getPackageJsonVersion(): string {
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
