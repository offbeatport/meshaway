import { test } from "node:test";
import assert from "node:assert/strict";
import { query, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { UnifiedTranslator } from "../../../src/mapper.js";
import { claudeSdkMessageToStreamJson } from "./lib/sdk-adapters.js";

test("claude code sdk tool_use_summary message preserves thought into ACP metadata", () => {
  const message = {
    type: "tool_use_summary",
    summary: "Planning edits before applying patches",
    preceding_tool_use_ids: [],
    uuid: "123e4567-e89b-12d3-a456-426614174000",
    session_id: "claude_session_1",
  } as unknown as SDKMessage;

  const claudePayload = claudeSdkMessageToStreamJson(message);
  const translator = new UnifiedTranslator();
  const acp = translator.claudeToAcp(claudePayload);

  assert.equal(acp.length, 1);
  const first = acp[0] as Record<string, unknown>;
  assert.equal(first.method, "session/prompt");
  const params = first.params as Record<string, unknown>;
  const meta = params._meta as Record<string, unknown>;
  assert.equal(meta.thought, "Planning edits before applying patches");
});

test("claude code sdk user message can be adapted to ACP prompt text", () => {
  const message = {
    type: "user",
    message: {
      role: "user",
      content: [{ type: "text", text: "explain this diff" }],
    },
    parent_tool_use_id: null,
    session_id: "claude_session_1",
  } as unknown as SDKMessage;

  const claudePayload = claudeSdkMessageToStreamJson(message);
  const translator = new UnifiedTranslator();
  const acp = translator.claudeToAcp(claudePayload);

  assert.equal(acp.length, 1);
  const first = acp[0] as Record<string, unknown>;
  assert.equal(first.method, "session/prompt");
});

test("claude code sdk query API is available for runtime integration", () => {
  assert.equal(typeof query, "function");
});
