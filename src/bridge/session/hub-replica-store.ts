import type { HubLinkClient } from "../hublink/client.js";
import type { SessionStore } from "../../shared/session/store.js";
import type { Session, Frame } from "../../shared/session/types.js";

/**
 * Write-only SessionStore that forwards writes to the hub via HubLinkClient.
 * Reads (getSession, listSessions, getFrames) are no-ops; use the primary store for reads.
 */
export function createHubReplicaStore(hubLink: HubLinkClient): SessionStore {
  function fireAndForget(promise: Promise<void>): void {
    promise.catch(() => {});
  }

  return {
    createSession(): Session {
      // Composite calls primary.createSession() then ensureSession(id) on replicas; this is never used for primary flow.
      return {
        id: "",
        createdAt: 0,
        updatedAt: 0,
        status: "active",
        frames: [],
      };
    },

    ensureSession(id: string): Session {
      fireAndForget(hubLink.reportSessionStart(id));
      return {
        id,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        status: "active",
        frames: [],
      };
    },

    getSession(): Session | undefined {
      return undefined;
    },

    listSessions(): Session[] {
      return [];
    },

    updateSession(id: string, updates: Partial<Session>): Session | undefined {
      if (updates.status === "completed" || updates.status === "killed") {
        fireAndForget(hubLink.reportSessionEnd(id));
      }
      return undefined;
    },

    addFrame(sessionId: string, type: string, payload: unknown): Frame | undefined {
      fireAndForget(hubLink.reportFrame(sessionId, type, payload));
      return undefined;
    },

    getFrames(): Frame[] {
      return [];
    },

    killSession(id: string): boolean {
      fireAndForget(hubLink.reportSessionEnd(id));
      return true;
    },

    resetRunnerSession(): Session | undefined {
      return undefined;
    },
  };
}
