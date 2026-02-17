import { test, expect } from "vitest";
import { defineTool, type SessionEvent } from "@github/copilot-sdk";
import { UnifiedTranslator } from "../../../src/mapper.js";
import { copilotEventToGithubRpc } from "./sdk-adapters.js";

test("github copilot sdk user.message event maps to ACP session/prompt", () => {
  const event: SessionEvent = {
    id: "evt_user_1",
    timestamp: new Date().toISOString(),
    parentId: "session_1",
    type: "user.message",
    data: {
      content: "review this project",
    },
  };

  const rpcPayload = copilotEventToGithubRpc(event);
  const translator = new UnifiedTranslator();
  const acp = translator.githubToAcp(rpcPayload);

  expect(acp.length).toBe(1);
  const first = acp[0] as Record<string, unknown>;
  expect(first.method).toBe("session/prompt");
});

test("github copilot sdk tool event maps to ACP tool_call update", () => {
  const event: SessionEvent = {
    id: "evt_tool_1",
    timestamp: new Date().toISOString(),
    parentId: "session_1",
    type: "tool.user_requested",
    data: {
      toolCallId: "call_1",
      toolName: "bash",
      arguments: { command: "npm install" },
    },
  };

  const rpcPayload = copilotEventToGithubRpc(event);
  const translator = new UnifiedTranslator();
  const acp = translator.githubToAcp(rpcPayload);

  expect(acp.length).toBe(1);
  const first = acp[0] as Record<string, unknown>;
  expect(first.method).toBe("session/update");
});

test("github copilot sdk defineTool helper is usable in integration", async () => {
  const tool = defineTool("mesh_echo", {
    description: "Echo input back to caller",
    handler: async () => "ok",
  });

  const result = await tool.handler(
    {},
    { sessionId: "session_1", toolCallId: "call_1", toolName: tool.name, arguments: {} },
  );
  expect(tool.name).toBe("mesh_echo");
  expect(result).toBe("ok");
});
