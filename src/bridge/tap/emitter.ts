import { EventEmitter } from "node:events";

export type TapEvent =
  | { type: "frame"; sessionId: string; frame: unknown }
  | { type: "session_start"; sessionId: string }
  | { type: "session_end"; sessionId: string };

export const tapEmitter = new EventEmitter();
tapEmitter.setMaxListeners(100);

export function emitTapEvent(event: TapEvent): void {
  tapEmitter.emit("tap", event);
}
