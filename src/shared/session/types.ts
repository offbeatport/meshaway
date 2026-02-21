export interface Session {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: "active" | "completed" | "killed";
  frames: Frame[];
}

export interface Frame {
  id: string;
  sessionId: string;
  timestamp: number;
  type: string;
  payload: unknown;
  redacted?: boolean;
}
