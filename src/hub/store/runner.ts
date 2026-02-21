import { genId } from "../../shared/ids.js";
import type { Frame } from "../../shared/session/index.js";

export type RunnerStatus = "idle" | "connected" | "streaming" | "error";

export interface RunnerSession {
  runnerSessionId: string;
  status: RunnerStatus;
  /** Bridge session ID when transport is TCP (frames from sessionStore). */
  bridgeSessionId: string | null;
  /** Frames when transport is STDIO (runner pushes to Hub). */
  frames: Frame[];
  createdAt: number;
  updatedAt: number;
  /** Child process or runner handle for STDIO (for kill/reset). */
  runnerPid?: number;
  /** Agent command for STDIO (e.g. "meshaway"). */
  agentCommand?: string;
  /** Agent args for STDIO (e.g. ["bridge", "--agent", "gemini"]). */
  agentArgs?: string[];
}

class RunnerStore {
  private byId = new Map<string, RunnerSession>();

  createOrGet(runnerSessionId: string): RunnerSession {
    const existing = this.byId.get(runnerSessionId);
    if (existing) return existing;
    const now = Date.now();
    const session: RunnerSession = {
      runnerSessionId,
      status: "idle",
      bridgeSessionId: null,
      frames: [],
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(runnerSessionId, session);
    return session;
  }

  get(runnerSessionId: string): RunnerSession | undefined {
    return this.byId.get(runnerSessionId);
  }

  update(
    runnerSessionId: string,
    updates: Partial<Pick<RunnerSession, "status" | "bridgeSessionId" | "runnerPid" | "agentCommand" | "agentArgs">>
  ): RunnerSession | undefined {
    const session = this.byId.get(runnerSessionId);
    if (!session) return undefined;
    Object.assign(session, updates, { updatedAt: Date.now() });
    return session;
  }

  addFrame(runnerSessionId: string, type: string, payload: unknown): Frame | undefined {
    const session = this.byId.get(runnerSessionId);
    if (!session) return undefined;
    const frame: Frame = {
      id: genId("frame"),
      sessionId: runnerSessionId,
      timestamp: Date.now(),
      type,
      payload,
      redacted: false,
    };
    session.frames.push(frame);
    session.updatedAt = Date.now();
    return frame;
  }

  getFrames(runnerSessionId: string): Frame[] {
    return this.byId.get(runnerSessionId)?.frames ?? [];
  }

  reset(runnerSessionId: string): RunnerSession | undefined {
    const session = this.byId.get(runnerSessionId);
    if (!session) return undefined;
    session.status = "idle";
    session.bridgeSessionId = null;
    session.frames = [];
    session.runnerPid = undefined;
    session.updatedAt = Date.now();
    return session;
  }

  list(): RunnerSession[] {
    return Array.from(this.byId.values()).sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
  }
}

export const runnerStore = new RunnerStore();
