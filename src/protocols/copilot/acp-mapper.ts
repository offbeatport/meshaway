/**
 * Maps ACP session/update notification params to Copilot SDK SessionEvent format.
 * See: https://github.com/yazelin/copilot-sdk-acp (acp-mapper.ts)
 */

let eventIdCounter = 0;

function generateEventId(): string {
  return `acp-${Date.now()}-${++eventIdCounter}`;
}

function createEventMeta(): { id: string; timestamp: string; parentId: null } {
  return {
    id: generateEventId(),
    timestamp: new Date().toISOString(),
    parentId: null,
  };
}

/** Extract plain text from ACP content (single part or array of { type, text }). */
function extractText(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "object" && "text" in content && typeof (content as { text: string }).text === "string") {
    return (content as { text: string }).text;
  }
  if (Array.isArray(content)) {
    return content
      .map((p) =>
        p && typeof p === "object" && "text" in p && typeof (p as { text?: string }).text === "string"
          ? (p as { text: string }).text
          : ""
      )
      .filter(Boolean)
      .join("");
  }
  return "";
}

/** Copilot SessionEvent shape the SDK expects for session.event notifications. */
export interface CopilotSessionEvent {
  id: string;
  timestamp: string;
  parentId: string | null;
  type: string;
  data: Record<string, unknown>;
  ephemeral?: boolean;
}

export type AcpSessionUpdateParams = Record<string, unknown>;

/**
 * Maps ACP session/update notification params to a Copilot SessionEvent.
 * Returns null if the update kind is not supported or no event should be sent.
 */
export function acpSessionUpdateToSessionEvent(params: AcpSessionUpdateParams): CopilotSessionEvent | null {
  const meta = createEventMeta();
  const sessionUpdate = typeof params.sessionUpdate === "string" ? params.sessionUpdate : null;
  const content = params.content;

  switch (sessionUpdate) {
    case "user_message_chunk":
    case "agent_message_chunk": {
      const text = extractText(content);
      if (!text) return null;
      return {
        ...meta,
        ephemeral: true,
        type: "assistant.message_delta",
        data: {
          messageId: meta.id,
          deltaContent: text,
        },
      };
    }

    case "agent_thought_chunk": {
      const text = extractText(content);
      if (!text) return null;
      return {
        ...meta,
        ephemeral: true,
        type: "assistant.reasoning_delta",
        data: {
          reasoningId: meta.id,
          deltaContent: text,
        },
      };
    }

    case "agent_message": {
      const text = extractText(content);
      return {
        ...meta,
        type: "assistant.message",
        data: {
          messageId: meta.id,
          content: text,
          toolRequests: [],
        },
      };
    }

    case "end_turn":
      return {
        ...meta,
        ephemeral: true,
        type: "session.idle",
        data: {},
      };

    case "error":
      return {
        ...meta,
        type: "session.error",
        data: {
          errorType: "internal",
          message: typeof params.message === "string" ? params.message : "Unknown error",
        },
      };
    case "tool_call": {
      const toolCallId = typeof params.toolCallId === "string" ? params.toolCallId : meta.id;
      const kind = typeof params.kind === "string" ? params.kind : "unknown";
      const status = params.status;

      if (status === "completed" || status === "failed") {
        const contentText = extractText(params.content);
        return {
          ...meta,
          type: "tool.execution_complete",
          data: {
            toolCallId,
            success: status === "completed",
            ...(status === "completed"
              ? { result: { content: contentText } }
              : { error: { message: contentText || "Tool execution failed" } }),
          },
        };
      }
      return {
        ...meta,
        type: "tool.execution_start",
        data: {
          toolCallId,
          toolName: kind,
          ...(params.rawInput !== undefined && { arguments: params.rawInput }),
        },
      };
    }

    case "tool_call_update": {
      const toolCallId = typeof params.toolCallId === "string" ? params.toolCallId : meta.id;
      const contentText = extractText(params.content);
      const status = params.status;

      if (status === "completed") {
        return {
          ...meta,
          type: "tool.execution_complete",
          data: {
            toolCallId,
            success: true,
            result: { content: contentText },
          },
        };
      }
      if (status === "failed") {
        return {
          ...meta,
          type: "tool.execution_complete",
          data: {
            toolCallId,
            success: false,
            error: { message: contentText || "Tool execution failed" },
          },
        };
      }
      return {
        ...meta,
        ephemeral: true,
        type: "tool.execution_progress",
        data: {
          toolCallId,
          progressMessage: contentText,
        },
      };
    }

    default:
      return null;
  }
}
