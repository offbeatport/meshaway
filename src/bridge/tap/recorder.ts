import { RingBuffer } from "./ringbuffer.js";
import { emitTapEvent } from "./emitter.js";

interface RecordedFrame {
  id: string;
  sessionId: string;
  timestamp: number;
  type: string;
  payload: unknown;
}

const buffers = new Map<string, RingBuffer<RecordedFrame>>();
const CAPACITY = 500;

export function recordFrame(
  sessionId: string,
  type: string,
  payload: unknown
): void {
  let buf = buffers.get(sessionId);
  if (!buf) {
    buf = new RingBuffer<RecordedFrame>(CAPACITY);
    buffers.set(sessionId, buf);
  }
  const frame: RecordedFrame = {
    id: `frame-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId,
    timestamp: Date.now(),
    type,
    payload,
  };
  buf.push(frame);
  emitTapEvent({ type: "frame", sessionId, frame });
}

export function getFrames(sessionId: string): RecordedFrame[] {
  return buffers.get(sessionId)?.toArray() ?? [];
}
