import { getEnv } from "../../shared/env.js";

export async function runDoctor(
  _opts: { dataDir?: string }
): Promise<void> {
  process.stderr.write("Meshaway doctor\n");
  process.stderr.write("───────────────────────────────────────────────────────────────\n\n");

  const backend = getEnv("BACKEND");
  if (backend) {
    process.stderr.write(`Backend (MESH_BACKEND): ${backend}\n`);
  } else {
    process.stderr.write("Backend: not set (MESH_BACKEND)\n");
  }

  process.stderr.write("\n");
  process.stderr.write("Fix:\n");
  process.stderr.write("  - ACP backend:  meshaway bridge --agent acp:gemini-cli\n");
  process.stderr.write("  - Or set:      MESH_BACKEND=...\n");
  process.stderr.write("───────────────────────────────────────────────────────────────\n");
}
