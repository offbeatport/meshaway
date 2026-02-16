import type { SessionEvent } from "@github/copilot-sdk";

export function copilotEventToGithubRpc(event: SessionEvent): unknown {
  if (event.type === "user.message") {
    return {
      jsonrpc: "2.0",
      id: event.id,
      method: "session/prompt",
      params: {
        sessionId: event.parentId ?? "copilot-session",
        prompt: event.data.content,
      },
    };
  }

  if (event.type === "tool.user_requested") {
    return {
      jsonrpc: "2.0",
      id: event.id,
      method: "session/prompt",
      params: {
        sessionId: event.parentId ?? "copilot-session",
        tool_use: {
          toolName: event.data.toolName,
          command: event.data.toolName,
          arguments: event.data.arguments,
        },
      },
    };
  }

  return {
    jsonrpc: "2.0",
    id: event.id,
    method: "session/prompt",
    params: {
      sessionId: event.parentId ?? "copilot-session",
      prompt: "",
    },
  };
}
