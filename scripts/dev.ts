/**
 * Run Hub + Bridge (same as default meshaway).
 * For UI dev with HMR, run: pnpm exec vite (from src/hub/ui-app).
 * Usage: pnpm run dev
 */

import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = join(__dirname, "..");

const p = spawn("pnpm", ["exec", "tsx", "src/cli/index.ts"], {
  cwd: root,
  stdio: "inherit",
});

p.on("exit", (code) => process.exit(code ?? 0));
