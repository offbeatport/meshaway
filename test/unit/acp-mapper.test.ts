import { describe, it, expect } from "vitest";
import { acpSessionUpdateToSessionEvent } from "../../src/protocols/copilot/acp-mapper.js";

describe("acpSessionUpdateToSessionEvent", () => {
  it("maps agent_message with text content to assistant.message", () => {
    const event = acpSessionUpdateToSessionEvent({
      sessionUpdate: "agent_message",
      content: { text: "Hello" },
    });
    expect(event).not.toBeNull();
    expect(event!.type).toBe("assistant.message");
    expect(event!.data).toMatchObject({ content: "Hello", messageId: expect.any(String) });
  });

  it("maps end_turn to session.idle", () => {
    const event = acpSessionUpdateToSessionEvent({ sessionUpdate: "end_turn" });
    expect(event).not.toBeNull();
    expect(event!.type).toBe("session.idle");
    expect(event!.data).toEqual({});
  });

  it("maps error to session.error with message", () => {
    const event = acpSessionUpdateToSessionEvent({
      sessionUpdate: "error",
      message: "Something failed",
    });
    expect(event).not.toBeNull();
    expect(event!.type).toBe("session.error");
    expect(event!.data).toMatchObject({ message: "Something failed" });
  });

  it("returns null for unsupported sessionUpdate", () => {
    expect(acpSessionUpdateToSessionEvent({ sessionUpdate: "unknown" })).toBeNull();
    expect(acpSessionUpdateToSessionEvent({})).toBeNull();
  });

  it("extracts text from content array", () => {
    const event = acpSessionUpdateToSessionEvent({
      sessionUpdate: "agent_message",
      content: [{ text: "A" }, { text: "B" }],
    });
    expect(event).not.toBeNull();
    expect(event!.data).toMatchObject({ content: "AB" });
  });
});
