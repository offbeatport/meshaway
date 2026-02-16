export type MeshMode = "github" | "claude" | "auto";
export type ClientType = "github" | "claude";
/** Provider for agent execution / translation (github, claude, gemini). */
export type Provider = "github" | "claude" | "gemini";

export type ActionStatus = "pending" | "approved" | "success" | "failed";
export type PermissionDecision = "approved" | "denied" | "cancelled";

export interface ThoughtChunkEvent {
  id: string;
  content: string;
  hidden?: boolean;
  timestamp: number;
}

export interface ActionEvent {
  id: string;
  command: string;
  status: ActionStatus;
  source: ClientType;
  timestamp: number;
}

export interface PermissionRequestEvent {
  id: string;
  title: string;
  command: string;
  risk: "low" | "medium" | "high";
  options: Array<"allow_once" | "allow_session" | "deny">;
  timestamp: number;
}

export interface PermissionResolvedEvent {
  id: string;
  decision: PermissionDecision;
  timestamp: number;
}

export type ObserverEvent =
  | { type: "thought_chunk"; payload: ThoughtChunkEvent }
  | { type: "action_intercepted"; payload: ActionEvent }
  | { type: "action_status_changed"; payload: ActionEvent }
  | { type: "permission_requested"; payload: PermissionRequestEvent }
  | { type: "permission_resolved"; payload: PermissionResolvedEvent };

export interface BridgeInboundMessage {
  raw: unknown;
  clientType: ClientType;
}

export interface PermissionDecisionInput {
  id: string;
  decision: PermissionDecision;
}
