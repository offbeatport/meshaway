#!/usr/bin/env node
/**
 * Mock ACP agent for e2e tests: responds to initialize, session/new, session/prompt,
 * then emits session/update notifications for tool_call (start + complete) so the
 * bridge forwards tool events to the Copilot client.
 * Usage: node test/e2e/copilot/mock-acp-agent-tools.mjs
 */
import { createInterface } from "node:readline";

const AGENT_SESSION_ID = "mock-agent-sess-1";

function send(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const id = msg.id;
  const method = msg.method;
  const params = msg.params || {};

  if (id === undefined || id === null) return;

  if (method === "initialize") {
    send({ jsonrpc: "2.0", id, result: { protocolVersion: 1 } });
    return;
  }

  if (method === "session/new") {
    send({ jsonrpc: "2.0", id, result: { sessionId: AGENT_SESSION_ID } });
    return;
  }

  if (method === "session/prompt") {
    send({
      jsonrpc: "2.0",
      id,
      result: { messageId: "msg-1", stopReason: "end_turn" },
    });
    // Emit tool_call start then completed so the client receives tool events
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: AGENT_SESSION_ID,
        sessionUpdate: "tool_call",
        toolCallId: "tc-e2e-1",
        kind: "get_time",
        rawInput: {},
      },
    });
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: AGENT_SESSION_ID,
        sessionUpdate: "tool_call",
        toolCallId: "tc-e2e-1",
        kind: "get_time",
        status: "completed",
        content: { text: "2024-01-15T12:00:00Z" },
      },
    });
    // End turn so client gets session.idle
    send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: AGENT_SESSION_ID,
        sessionUpdate: "end_turn",
      },
    });
    return;
  }

  send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
});
