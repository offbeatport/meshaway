/** Environment variable defaults for mesh CLI (meshaway-cli-v1). */
export const MESHAWAY_ENV = {
  GATEWAY: "MESHAWAY_GATEWAY",
  TOKEN: "MESHAWAY_TOKEN",
  MODE: "MESHAWAY_MODE",
  AGENT: "MESHAWAY_AGENT",
  LOG_LEVEL: "MESHAWAY_LOG_LEVEL",
} as const;

export function getEnv(key: keyof typeof MESHAWAY_ENV): string | undefined {
  return process.env[MESHAWAY_ENV[key]];
}
