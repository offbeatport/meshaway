/**
 * Build Node CLI -> dist/node, UI -> dist/ui, embed UI for native binary.
 * Usage: pnpm exec tsx scripts/build.ts
 */

import { build } from "esbuild";
import { execSync } from "node:child_process";
import { mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

async function buildUi() {
  execSync(`pnpm exec vite build --config ${join(root, "src", "hub", "ui", "vite.config.ts")}`, {
    cwd: root,
    stdio: "inherit",
  });
}

async function embedUi() {
  execSync(`pnpm exec tsx ${join(root, "scripts", "embed-ui.ts")}`, {
    cwd: root,
    stdio: "inherit",
  });
}

async function buildNode() {
  const outDir = join(root, "dist", "node");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  await build({
    entryPoints: [join(root, "src", "cli", "index.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "esm",
    outfile: join(outDir, "meshaway.mjs"),
    banner: { js: "#!/usr/bin/env node" },
    sourcemap: true,
    legalComments: "none",
    packages: "external",
  });
}

async function main() {
  await buildUi();
  await embedUi();
  await buildNode();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
