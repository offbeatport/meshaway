import { EventEmitter } from "node:events";
import type { ObserverEvent } from "../types.js";
import { maskSensitiveObject } from "../logging.js";

export class ObserverEventBus {
  private readonly emitter = new EventEmitter();

  publish(event: ObserverEvent): void {
    const masked = maskSensitiveObject(event);
    this.emitter.emit("event", masked);
  }

  subscribe(listener: (event: ObserverEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => this.emitter.off("event", listener);
  }
}
