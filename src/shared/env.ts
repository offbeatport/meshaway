/** Environment variable names per init02 spec. */
export const MESH_ENV = {
  BACKEND: "MESH_BACKEND",
  LISTEN: "MESH_LISTEN",
  HUB: "MESH_HUB",
  HUB_LISTEN: "MESH_HUB_LISTEN",
} as const;

export function getEnv(key: keyof typeof MESH_ENV): string | undefined {
  return process.env[MESH_ENV[key]];
}
