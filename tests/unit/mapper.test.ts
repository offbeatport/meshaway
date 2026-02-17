import { test, expect } from "vitest";
import { UnifiedTranslator } from "../../src/mapper.js";

test("maps claude thought into ACP metadata", () => {
  const mapper = new UnifiedTranslator();
  const results = mapper.claudeToAcp({
    type: "assistant",
    subtype: "chunk",
    text: "visible text",
    thought: "hidden thought",
    session_id: "sess_1",
  });

  expect(results).toHaveLength(1);
  expect(results[0]).toMatchObject({
    method: "session/prompt",
    params: { _meta: { thought: "hidden thought" } },
  });
});

test("maps ACP permission requests to github permission envelope", () => {
  const mapper = new UnifiedTranslator();
  const outgoing = mapper.acpToGithub({
    jsonrpc: "2.0",
    id: 42,
    method: "session/request_permission",
    params: {
      sessionId: "sess_2",
      toolCall: { toolCallId: "perm_123", command: "rm -rf node_modules" },
      options: [],
    },
  });
  expect(outgoing).toHaveLength(1);
  expect(outgoing[0]).toMatchObject({ method: "session/request_permission" });
});
