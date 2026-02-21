import type { Session, Frame } from "./types.js";

export interface SessionStore {
  createSession(): Session;
  ensureSession(id: string): Session;
  getSession(id: string): Session | undefined;
  listSessions(): Session[];
  updateSession(id: string, updates: Partial<Session>): Session | undefined;
  addFrame(sessionId: string, type: string, payload: unknown, redacted?: boolean): Frame | undefined;
  getFrames(sessionId: string): Frame[];
  killSession(id: string): boolean;
  /** Clear frames and runner fields (for playground disconnect/reset). */
  resetRunnerSession(id: string): Session | undefined;
}
