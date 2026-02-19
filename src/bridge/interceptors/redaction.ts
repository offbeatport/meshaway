import { redactSecrets } from "../../shared/logging.js";

export function redactPayload<T>(payload: T): T {
  try {
    const s = JSON.stringify(payload);
    return JSON.parse(redactSecrets(s)) as T;
  } catch {
    return payload;
  }
}
