import { getLogger } from "./logging.js";

/** CLI exit codes. */
export const EXIT = {
  SUCCESS: 0,
  GENERIC_ERROR: 1,
  INVALID_ARGS: 2,
  SERVER_FAILURE: 3,
  AGENT_FAILURE: 4,
} as const;

export function exit(code: number, message?: string): never {
  if (message) {
    if (code === EXIT.SUCCESS) getLogger().info(message);
    else getLogger().error(message);
  }
  process.exit(code);
}

/** Thrown when the agent process (e.g. gemini-cli) fails to start or respond. Used to exit bridge with a specific error. */
export class AgentStartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentStartError";
  }
}
