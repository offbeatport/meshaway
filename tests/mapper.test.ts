import { test } from "node:test";
import assert from "node:assert/strict";
import { UnifiedTranslator } from "../src/mapper.js";

test("maps claude thought into ACP metadata", () => {
  const mapper = new UnifiedTranslator();
  const results = mapper.claudeToAcp({
    type: "assistant",
    subtype: "chunk",
    text: "visible text",
    thought: "hidden thought",
    session_id: "sess_1",
  });

  assert.equal(results.length > 0, true);
  const first = results[0] as Record<string, unknown>;
  assert.equal(first.method, "session/prompt");
  const params = first.params as Record<string, unknown>;
  const meta = params?._meta as Record<string, unknown>;
  assert.equal(meta.thought, "hidden thought");
});

test("maps ACP permission requests to github permission envelope", () => {
  const mapper = new UnifiedTranslator();
  const outgoing = mapper.acpToGithub({
    jsonrpc: "2.0",
    id: 42,
    method: "session/request_permission",
    params: {
      sessionId: "sess_2",
      toolCall: {
        toolCallId: "perm_123",
        command: "rm -rf node_modules",
      },
      options: [],
    },
  });
  assert.equal(outgoing.length, 1);
  const first = outgoing[0] as Record<string, unknown>;
  assert.equal(first.method, "session/request_permission");
});
