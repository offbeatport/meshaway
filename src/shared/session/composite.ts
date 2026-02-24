import type { SessionStore } from "./store.js";
import type { Session, Frame } from "./types.js";

/**
 * Session store that writes to multiple stores (e.g. local + hub replica).
 * Reads are served from the primary (first) store only.
 */
export function createCompositeSessionStore(stores: [SessionStore, ...SessionStore[]]): SessionStore {
  const [primary, ...replicas] = stores;

  return {
    createSession(): Session {
      const session = primary.createSession();
      for (const store of replicas) {
        try {
          store.ensureSession(session.id);
        } catch {
          // ignore
        }
      }
      return session;
    },

    ensureSession(id: string): Session {
      const session = primary.ensureSession(id);
      for (const store of replicas) {
        try {
          store.ensureSession(id);
        } catch {
          // ignore
        }
      }
      return session;
    },

    getSession(id: string): Session | undefined {
      return primary.getSession(id);
    },

    listSessions(): Session[] {
      return primary.listSessions();
    },

    updateSession(id: string, updates: Partial<Session>): Session | undefined {
      const result = primary.updateSession(id, updates);
      for (const store of replicas) {
        try {
          store.updateSession(id, updates);
        } catch {
          // ignore
        }
      }
      return result;
    },

    addFrame(sessionId: string, type: string, payload: unknown, redacted = true): Frame | undefined {
      const frame = primary.addFrame(sessionId, type, payload, redacted);
      if (frame) {
        for (const store of replicas) {
          try {
            store.addFrame(sessionId, type, payload, redacted);
          } catch {
            // ignore
          }
        }
      }
      return frame;
    },

    getFrames(sessionId: string): Frame[] {
      return primary.getFrames(sessionId);
    },

    killSession(id: string): boolean {
      const ok = primary.killSession(id);
      if (ok) {
        for (const store of replicas) {
          try {
            store.killSession(id);
          } catch {
            // ignore
          }
        }
      }
      return ok;
    },

    deleteSession(id: string): boolean {
      const ok = primary.deleteSession(id);
      if (ok) {
        for (const store of replicas) {
          try {
            store.deleteSession(id);
          } catch {
            // ignore
          }
        }
      }
      return ok;
    },

    resetRunnerSession(id: string): Session | undefined {
      const session = primary.resetRunnerSession(id);
      for (const store of replicas) {
        try {
          store.resetRunnerSession(id);
        } catch {
          // ignore
        }
      }
      return session;
    },
  };
}
