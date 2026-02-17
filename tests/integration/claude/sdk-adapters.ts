import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

export function claudeSdkMessageToStreamJson(message: SDKMessage): unknown {
  const record = message as Record<string, unknown>;
  const type = typeof record.type === "string" ? record.type : "unknown";

  if (type === "tool_use_summary") {
    return {
      type: "assistant",
      subtype: "chunk",
      thought: String(record.summary ?? ""),
      text: "",
      session_id: String(record.session_id ?? "claude-session"),
    };
  }

  if (type === "user") {
    const body = extractUserText(record.message);
    return {
      type: "assistant",
      subtype: "chunk",
      text: body,
      session_id: String(record.session_id ?? "claude-session"),
    };
  }

  return {
    type: "assistant",
    subtype: "chunk",
    text: "",
    session_id: String(record.session_id ?? "claude-session"),
  };
}

function extractUserText(message: unknown): string {
  if (!message || typeof message !== "object") {
    return "";
  }
  const record = message as Record<string, unknown>;
  if (typeof record.content === "string") {
    return record.content;
  }
  if (Array.isArray(record.content)) {
    const textPart = record.content.find(
      (entry) => typeof entry === "object" && entry && (entry as Record<string, unknown>).type === "text",
    ) as Record<string, unknown> | undefined;
    if (textPart && typeof textPart.text === "string") {
      return textPart.text;
    }
  }
  return "";
}
