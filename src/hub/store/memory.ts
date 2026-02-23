import {
  createInMemorySessionStore,
  type Session,
  type Frame,
} from "../../shared/session/index.js";

const frameListeners = new Map<string, Set<(frame: Frame) => void>>();

function notifyFrameAdded(sessionId: string, frame: Frame): void {
  const set = frameListeners.get(sessionId);
  if (set) for (const cb of set) cb(frame);
}

/** Hub's default session store (in-memory). Notifies on new frames for SSE. */
export const sessionStore = createInMemorySessionStore({ onFrameAdded: notifyFrameAdded });

/** Subscribe to new frames for a runner session (e.g. for SSE). Returns unsubscribe. */
export function subscribeFrames(
  runnerSessionId: string,
  callback: (frame: Frame) => void
): () => void {
  let set = frameListeners.get(runnerSessionId);
  if (!set) {
    set = new Set();
    frameListeners.set(runnerSessionId, set);
  }
  set.add(callback);
  return () => {
    set!.delete(callback);
    if (set!.size === 0) frameListeners.delete(runnerSessionId);
  };
}

export type { Session, Frame };
