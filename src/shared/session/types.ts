export interface Session {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: "active" | "completed" | "killed";
  frames: Frame[];
  client?: string;
  agent?: string;
  agentArgs?: string[];
}

export interface Frame {
  id: string;
  sessionId: string;
  timestamp: number;
  type: string;
  payload: unknown;
  redacted?: boolean;
}
