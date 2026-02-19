/** Hub <-> Bridge control protocol message types. */

export type HubLinkMessage =
  | { type: "session_start"; sessionId: string; payload?: unknown }
  | { type: "session_update"; sessionId: string; update: unknown }
  | { type: "session_end"; sessionId: string }
  | { type: "kill"; sessionId: string }
  | { type: "approve"; sessionId: string; toolCallId: string; decision: "approve" | "deny" };
