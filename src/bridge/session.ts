import { genId } from "../shared/ids.js";

export interface SessionState {
  id: string;
  createdAt: number;
  status: "active" | "completed" | "killed";
}

export function createSession(): SessionState {
  return {
    id: genId("sess"),
    createdAt: Date.now(),
    status: "active",
  };
}
