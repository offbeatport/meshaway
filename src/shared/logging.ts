import { Writable } from "node:stream";
import pino from "pino";
import pinoPretty from "pino-pretty";

export function redactSecrets(input: string): string {
  return input
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED]")
    .replace(/\bghp_[A-Za-z0-9]{20,}\b/g, "[REDACTED]")
    .replace(/\bAIza[0-9A-Za-z\-_]{20,}\b/g, "[REDACTED]")
    .replace(
      /\b(ANTHROPIC_API_KEY|GITHUB_TOKEN|GOOGLE_API_KEY|OPENAI_API_KEY)\s*=\s*([^\s]+)/gi,
      (_match, name: string) => `${name}=[REDACTED]`
    )
    .replace(
      /\b(ANTHROPIC_API_KEY|GITHUB_TOKEN|GOOGLE_API_KEY|OPENAI_API_KEY)\b["']?\s*:\s*["']([^"']+)["']/gi,
      (_match, name: string) => `${name}:"[REDACTED]"`
    );
}

export function maskSensitiveObject<T>(value: T): T {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) return value;
    return JSON.parse(redactSecrets(serialized)) as T;
  } catch {
    return value;
  }
}

export type LogLevel = "error" | "warn" | "info" | "debug";
export type LogFormat = "text" | "json";

const LEVELS: LogLevel[] = ["error", "warn", "info", "debug"];

function isValidLevel(s: string): s is LogLevel {
  return LEVELS.includes(s as LogLevel);
}

function redactingStderr(): Writable {
  return new Writable({
    write(chunk: Buffer | string, _enc, cb) {
      const s = typeof chunk === "string" ? chunk : chunk.toString("utf8");
      process.stderr.write(redactSecrets(s));
      cb();
    },
  });
}

let rootLogger: pino.Logger | null = null;

export function initLogger(level = "info", format = "text"): void {
  const logLevel = isValidLevel(level) ? level : "info";
  const dest = redactingStderr();
  if (format === "text") {
    const prettyStream = pinoPretty({ colorize: true, destination: dest });
    rootLogger = pino({ level: logLevel, name: "meshaway" }, prettyStream);
  } else {
    rootLogger = pino({ level: logLevel, name: "meshaway" }, dest);
  }
}

function ensureLogger(): pino.Logger {
  if (!rootLogger) {
    initLogger("info", "text");
    if (!rootLogger)
      rootLogger = pino(
        { level: "info", name: "meshaway" },
        redactingStderr()
      );
  }
  return rootLogger;
}

export function getLogger(): pino.Logger {
  return ensureLogger();
}

export function safeLog(message: string, context?: unknown): void {
  const log = ensureLogger();
  if (context === undefined) log.info(message);
  else log.info(maskSensitiveObject(context) as object, message);
}
