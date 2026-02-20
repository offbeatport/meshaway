import { getLogger } from "./logging.js";

/** CLI exit codes. */
export const EXIT = {
  SUCCESS: 0,
  GENERIC_ERROR: 1,
  INVALID_ARGS: 2,
  SERVER_FAILURE: 3,
  BACKEND_FAILURE: 4,
} as const;

export function exit(code: number, message?: string): never {
  if (message) {
    if (code === EXIT.SUCCESS) getLogger().info(message);
    else getLogger().error(message);
  }
  process.exit(code);
}
