/**
 * Drives the meshaway CLI with the same JSON-RPC sequence as the Copilot SDK
 * (Content-Length framing). Used to verify the bridge sends session.idle.
 */
import { spawn } from "node:child_process";
import path from "node:path";

const projectRoot = process.cwd();
const meshPath = path.join(projectRoot, "dist", "meshaway.cjs");

function frame(payload) {
  const body = JSON.stringify(payload);
  const len = Buffer.byteLength(body, "utf8");
  return `Content-Length: ${len}\r\n\r\n${body}`;
}

const ping = { jsonrpc: "2.0", id: 1, method: "ping", params: { protocolVersion: 2 } };
const sessionCreate = { jsonrpc: "2.0", id: 2, method: "session.create", params: { model: "mesh-local" } };
const sessionSend = { jsonrpc: "2.0", id: 3, method: "session.send", params: { prompt: "hello", sessionId: null } };

async function main() {
  const child = spawn(process.execPath, [meshPath, "--stdio", "--headless", "--log-level", "error", "--no-auto-login"], {
    cwd: projectRoot,
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, COPILOT_SDK_AUTH_TOKEN: "test" },
  });

  let sessionId = null;
  const received = [];
  let buffer = "";

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const headers = buffer.slice(0, headerEnd);
      const m = headers.match(/Content-Length:\s*(\d+)/i);
      if (!m) break;
      const len = Number(m[1]);
      const total = headerEnd + 4 + len;
      if (buffer.length < total) break;
      const body = buffer.slice(headerEnd + 4, total);
      buffer = buffer.slice(total);
      try {
        const msg = JSON.parse(body);
        received.push(msg);
        if (msg.method === "session.event" && msg.params?.event?.type === "session.idle") {
          child.kill();
          process.stdout.write("SESSION_IDLE_RECEIVED\n");
          process.exit(0);
        }
      } catch (_) {}
    }
  });

  child.on("exit", (code) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(`child exit ${code}\n`);
      process.exit(1);
    }
  });

  const write = (msg) => child.stdin.write(frame(msg));

  write(ping);
  await new Promise((r) => setTimeout(r, 200));
  write(sessionCreate);
  await new Promise((r) => setTimeout(r, 200));

  const createResp = received.find((r) => r.id === 2 && r.result);
  if (createResp?.result?.sessionId) sessionId = createResp.result.sessionId;

  const sendParams = { prompt: "hello", sessionId: sessionId ?? undefined };
  write({ ...sessionSend, params: sendParams });

  setTimeout(() => {
    for (;;) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;
      const m = buffer.slice(0, headerEnd).match(/Content-Length:\s*(\d+)/i);
      if (!m) break;
      const len = Number(m[1]);
      const total = headerEnd + 4 + len;
      if (buffer.length < total) break;
      try {
        const msg = JSON.parse(buffer.slice(headerEnd + 4, total));
        received.push(msg);
        if (msg.method === "session.event" && msg.params?.event?.type === "session.idle") {
          child.kill();
          process.stdout.write("SESSION_IDLE_RECEIVED\n");
          process.exit(0);
        }
      } catch (_) {}
      buffer = buffer.slice(total);
    }
    process.stderr.write("Timeout: session.idle not received\n");
    process.exit(1);
  }, 12_000);
}

main().catch((e) => {
  process.stderr.write(String(e));
  process.exit(1);
});
