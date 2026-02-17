import { test, expect } from "vitest";
import { UnifiedTranslator } from "../../src/translator/translator.js";

test("maps claude thought into ACP metadata", () => {
  const translator = new UnifiedTranslator();
  const results = translator.claudeToAcp({
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
  const translator = new UnifiedTranslator();
  const outgoing = translator.acpToGithub({
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
