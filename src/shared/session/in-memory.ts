import { genId } from "../ids.js";
import type { SessionStore } from "./store.js";
import type { Session, Frame } from "./types.js";

export function createInMemorySessionStore(): SessionStore {
  const sessions = new Map<string, Session>();

  return {
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
      sessions.set(id, session);
      return session;
    },

    ensureSession(id: string): Session {
      const existing = sessions.get(id);
      if (existing) return existing;
      const now = Date.now();
      const session: Session = {
        id,
        createdAt: now,
        updatedAt: now,
        status: "active",
        frames: [],
      };
      sessions.set(id, session);
      return session;
    },

    getSession(id: string): Session | undefined {
      return sessions.get(id);
    },

    listSessions(): Session[] {
      return Array.from(sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
    },

    updateSession(id: string, updates: Partial<Session>): Session | undefined {
      const session = sessions.get(id);
      if (!session) return undefined;
      Object.assign(session, updates, { updatedAt: Date.now() });
      return session;
    },

    addFrame(sessionId: string, type: string, payload: unknown, redacted = true): Frame | undefined {
      const session = sessions.get(sessionId);
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
    },

    getFrames(sessionId: string): Frame[] {
      return sessions.get(sessionId)?.frames ?? [];
    },

    killSession(id: string): boolean {
      const session = sessions.get(id);
      if (!session) return false;
      session.status = "killed";
      session.updatedAt = Date.now();
      return true;
    },
  };
}
