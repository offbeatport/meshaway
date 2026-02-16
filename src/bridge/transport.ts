import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

const DEFAULT_ENV_ALLOWLIST = [
  "PATH",
  "HOME",
  "PWD",
  "SHELL",
  "TERM",
  "LANG",
  "GITHUB_TOKEN",
  "ANTHROPIC_API_KEY",
  "GOOGLE_API_KEY",
  "OPENAI_API_KEY",
];

export function buildChildEnv(allowlist?: string[]): NodeJS.ProcessEnv {
  const keys = allowlist ?? DEFAULT_ENV_ALLOWLIST;
  const env: NodeJS.ProcessEnv = {};
  for (const key of keys) {
    if (process.env[key]) {
      env[key] = process.env[key];
    }
  }
  return env;
}

export function spawnAgent(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): ChildProcessWithoutNullStreams {
  return spawn(command, args, {
    cwd,
    stdio: ["pipe", "pipe", "pipe"],
    env,
  });
}

export function formatClientMessage(message: unknown, usesFraming: boolean): string {
  const payload = JSON.stringify(message);
  if (usesFraming) {
    const length = Buffer.byteLength(payload, "utf8");
    return `Content-Length: ${length}\r\n\r\n${payload}`;
  }
  return `${payload}\n`;
}

export interface StdinParseState {
  frameBuffer: Buffer;
  lineBuffer: string;
  usesJsonRpcFraming: boolean;
}

export function parseStdinChunk(
  data: Buffer,
  state: StdinParseState,
  onMessage: (payload: string) => void,
): void {
  state.frameBuffer = Buffer.concat([state.frameBuffer, data]);

  for (;;) {
    const headerEnd = state.frameBuffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) break;
    const headers = state.frameBuffer.subarray(0, headerEnd).toString("utf8");
    const match = headers.match(/Content-Length:\s*(\d+)/i);
    if (!match) break;
    const contentLength = Number(match[1]);
    const totalLength = headerEnd + 4 + contentLength;
    if (state.frameBuffer.length < totalLength) break;
    const payload = state.frameBuffer.subarray(headerEnd + 4, totalLength).toString("utf8");
    state.frameBuffer = state.frameBuffer.subarray(totalLength);
    state.usesJsonRpcFraming = true;
    onMessage(payload);
  }
}

export function parseStdinLineDelimited(
  data: string,
  state: { lineBuffer: string },
  onMessage: (line: string) => void,
): void {
  state.lineBuffer += data;
  for (;;) {
    const newlineIndex = state.lineBuffer.indexOf("\n");
    if (newlineIndex === -1) break;
    const line = state.lineBuffer.slice(0, newlineIndex).trim();
    state.lineBuffer = state.lineBuffer.slice(newlineIndex + 1);
    if (line) onMessage(line);
  }
}
