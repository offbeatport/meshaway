import { genId } from "../../shared/ids.js";

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

class MemoryStore {
  private sessions = new Map<string, Session>();

  createSession(): Session {
    const id = genId("sess");
    const now = Date.now();
    const session: Session = {
      id,
      createdAt: now,
      updatedAt: now,
      status: "active",
      frames: [],
    };
    this.sessions.set(id, session);
    return session;
  }

  ensureSession(id: string): Session {
    const existing = this.sessions.get(id);
    if (existing) return existing;
    const now = Date.now();
    const session: Session = {
      id,
      createdAt: now,
      updatedAt: now,
      status: "active",
      frames: [],
    };
    this.sessions.set(id, session);
    return session;
  }

  getSession(id: string): Session | undefined {
    return this.sessions.get(id);
  }

  listSessions(): Session[] {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
  }

  updateSession(id: string, updates: Partial<Session>): Session | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;
    Object.assign(session, updates, { updatedAt: Date.now() });
    return session;
  }

  addFrame(sessionId: string, type: string, payload: unknown, redacted = true): Frame | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;
    const frame: Frame = {
      id: genId("frame"),
      sessionId,
      timestamp: Date.now(),
      type,
      payload,
      redacted,
    };
    session.frames.push(frame);
    session.updatedAt = Date.now();
    return frame;
  }

  getFrames(sessionId: string): Frame[] {
    return this.sessions.get(sessionId)?.frames ?? [];
  }

  killSession(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.status = "killed";
    session.updatedAt = Date.now();
    return true;
  }
}

export const sessionStore = new MemoryStore();
