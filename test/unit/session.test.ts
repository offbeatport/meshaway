import { describe, it, expect, vi } from "vitest";
import { createInMemorySessionStore } from "../../src/shared/session/in-memory.js";
import { createCompositeSessionStore } from "../../src/shared/session/composite.js";
import type { SessionStore } from "../../src/shared/session/store.js";
import type { Session, Frame } from "../../src/shared/session/types.js";

describe("createInMemorySessionStore", () => {
  it("createSession returns new session with id, timestamps, active status, empty frames", () => {
    const store = createInMemorySessionStore();
    const session = store.createSession();
    expect(session.id).toMatch(/^sess-/);
    expect(session.createdAt).toBeGreaterThan(0);
    expect(session.updatedAt).toBe(session.createdAt);
    expect(session.status).toBe("active");
    expect(session.frames).toEqual([]);
  });

  it("ensureSession creates session when missing", () => {
    const store = createInMemorySessionStore();
    const session = store.ensureSession("custom-id");
    expect(session.id).toBe("custom-id");
    expect(session.status).toBe("active");
    expect(session.frames).toEqual([]);
  });

  it("ensureSession returns existing session when present", () => {
    const store = createInMemorySessionStore();
    const first = store.ensureSession("s-1");
    const second = store.ensureSession("s-1");
    expect(first).toBe(second);
  });

  it("getSession returns undefined for unknown id", () => {
    const store = createInMemorySessionStore();
    expect(store.getSession("missing")).toBeUndefined();
  });

  it("getSession returns session after ensureSession", () => {
    const store = createInMemorySessionStore();
    store.ensureSession("s-2");
    const session = store.getSession("s-2");
    expect(session?.id).toBe("s-2");
  });

  it("listSessions returns sessions sorted by updatedAt descending", () => {
    const store = createInMemorySessionStore();
    store.ensureSession("old");
    store.ensureSession("newer");
    store.addFrame("newer", "touch", {}); // make "newer" have later updatedAt
    const list = store.listSessions();
    expect(list.length).toBe(2);
    expect(list[0].id).toBe("newer");
    expect(list[1].id).toBe("old");
  });

  it("addFrame appends frame and updates session updatedAt", () => {
    const store = createInMemorySessionStore();
    store.ensureSession("s-3");
    const frame = store.addFrame("s-3", "prompt", { text: "hi" }, false);
    expect(frame).toBeDefined();
    expect(frame!.sessionId).toBe("s-3");
    expect(frame!.type).toBe("prompt");
    expect(frame!.payload).toEqual({ text: "hi" });
    expect(frame!.redacted).toBe(false);
    expect(frame!.id).toMatch(/^frame-/);

    const frames = store.getFrames("s-3");
    expect(frames).toHaveLength(1);
    expect(frames[0]).toEqual(frame);
    expect(store.getSession("s-3")!.updatedAt).toBeGreaterThanOrEqual(frame!.timestamp);
  });

  it("addFrame returns undefined for unknown sessionId", () => {
    const store = createInMemorySessionStore();
    const frame = store.addFrame("nonexistent", "prompt", {});
    expect(frame).toBeUndefined();
    expect(store.getFrames("nonexistent")).toEqual([]);
  });

  it("calls onFrameAdded when frame is added", () => {
    const onFrameAdded = vi.fn();
    const store = createInMemorySessionStore({ onFrameAdded });
    store.ensureSession("s-cb");
    store.addFrame("s-cb", "event", { data: 1 });
    expect(onFrameAdded).toHaveBeenCalledTimes(1);
    expect(onFrameAdded).toHaveBeenCalledWith(
      "s-cb",
      expect.objectContaining({ type: "event", payload: { data: 1 } })
    );
  });

  it("updateSession merges updates and sets updatedAt", () => {
    const store = createInMemorySessionStore();
    store.ensureSession("s-4");
    const before = store.getSession("s-4")!.updatedAt;
    const updated = store.updateSession("s-4", { status: "completed" });
    expect(updated?.status).toBe("completed");
    expect(updated?.updatedAt).toBeGreaterThanOrEqual(before);
  });

  it("updateSession returns undefined for unknown id", () => {
    const store = createInMemorySessionStore();
    expect(store.updateSession("missing", { status: "completed" })).toBeUndefined();
  });

  it("killSession sets status to killed", () => {
    const store = createInMemorySessionStore();
    store.ensureSession("s-5");
    const ok = store.killSession("s-5");
    expect(ok).toBe(true);
    expect(store.getSession("s-5")?.status).toBe("killed");
  });

  it("killSession returns false for unknown id", () => {
    const store = createInMemorySessionStore();
    expect(store.killSession("missing")).toBe(false);
  });

  it("deleteSession removes session", () => {
    const store = createInMemorySessionStore();
    store.ensureSession("s-6");
    expect(store.deleteSession("s-6")).toBe(true);
    expect(store.getSession("s-6")).toBeUndefined();
    expect(store.deleteSession("s-6")).toBe(false);
  });

  it("resetRunnerSession clears frames", () => {
    const store = createInMemorySessionStore();
    store.ensureSession("s-7");
    store.addFrame("s-7", "a", {});
    store.addFrame("s-7", "b", {});
    const session = store.resetRunnerSession("s-7");
    expect(session?.frames).toEqual([]);
    expect(store.getFrames("s-7")).toEqual([]);
  });

  it("resetRunnerSession returns undefined for unknown id", () => {
    const store = createInMemorySessionStore();
    expect(store.resetRunnerSession("missing")).toBeUndefined();
  });
});

describe("createCompositeSessionStore", () => {
  function createMockStore(): SessionStore & { calls: Array<{ method: string; args: unknown[] }> } {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const sessions = new Map<string, Session>();
    const record = (method: string, ...args: unknown[]) => {
      calls.push({ method, args: [...args] });
    };
    return {
      calls,
      createSession() {
        record("createSession");
        const id = `sess-${Date.now()}`;
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
      ensureSession(id: string) {
        record("ensureSession", id);
        let s = sessions.get(id);
        if (!s) {
          s = {
            id,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            status: "active",
            frames: [],
          };
          sessions.set(id, s);
        }
        return s;
      },
      getSession(id: string) {
        record("getSession", id);
        return sessions.get(id);
      },
      listSessions() {
        record("listSessions");
        return Array.from(sessions.values()).sort((a, b) => b.updatedAt - a.updatedAt);
      },
      updateSession(id: string, updates: Partial<Session>) {
        record("updateSession", id, updates);
        const s = sessions.get(id);
        if (!s) return undefined;
        Object.assign(s, updates, { updatedAt: Date.now() });
        return s;
      },
      addFrame(sessionId: string, type: string, payload: unknown, redacted = true): Frame | undefined {
        record("addFrame", sessionId, type, payload, redacted);
        const s = sessions.get(sessionId);
        if (!s) return undefined;
        const frame: Frame = {
          id: `frame-${Date.now()}`,
          sessionId,
          timestamp: Date.now(),
          type,
          payload,
          redacted,
        };
        s.frames.push(frame);
        s.updatedAt = frame.timestamp;
        return frame;
      },
      getFrames(sessionId: string) {
        record("getFrames", sessionId);
        return sessions.get(sessionId)?.frames ?? [];
      },
      killSession(id: string) {
        record("killSession", id);
        const s = sessions.get(id);
        if (!s) return false;
        s.status = "killed";
        s.updatedAt = Date.now();
        return true;
      },
      deleteSession(id: string) {
        record("deleteSession", id);
        return sessions.delete(id);
      },
      resetRunnerSession(id: string) {
        record("resetRunnerSession", id);
        const s = sessions.get(id);
        if (!s) return undefined;
        s.frames = [];
        s.updatedAt = Date.now();
        return s;
      },
    };
  }

  it("delegates reads and writes to primary; replicates ensureSession and addFrame to replica", () => {
    const primary = createMockStore();
    const replica = createMockStore();
    const composite = createCompositeSessionStore([primary, replica]);

    composite.ensureSession("composite-1");
    expect(primary.calls).toContainEqual({ method: "ensureSession", args: ["composite-1"] });
    expect(replica.calls).toContainEqual({ method: "ensureSession", args: ["composite-1"] });

    primary.calls.length = 0;
    replica.calls.length = 0;

    composite.addFrame("composite-1", "event", {});
    expect(primary.calls.some((c) => c.method === "addFrame")).toBe(true);
    expect(replica.calls.some((c) => c.method === "addFrame")).toBe(true);
  });

  it("getSession and listSessions read from primary only", () => {
    const primary = createInMemorySessionStore();
    const replica = createMockStore();
    primary.ensureSession("read-only");
    const composite = createCompositeSessionStore([primary, replica]);

    expect(composite.getSession("read-only")).toBeDefined();
    expect(composite.listSessions()).toHaveLength(1);
    expect(replica.calls.filter((c) => c.method === "getSession" || c.method === "listSessions")).toHaveLength(0);
  });
});
