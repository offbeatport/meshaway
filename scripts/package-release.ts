/**
 * Build single binaries for distribution.
 * 1. Run pnpm run build first
 * 2. Copy dist/node/meshaway.mjs to release/
 * 3. Optionally build SEA (Node 20.6+)
 * Usage: pnpm exec tsx scripts/package-release.ts
 */

import { copyFileSync, mkdirSync, existsSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = join(__dirname, "..");
const releaseDir = join(root, "release");
const isWindows = process.platform === "win32";
const outputName = isWindows ? "meshaway.exe" : "meshaway";

if (!existsSync(releaseDir)) {
  mkdirSync(releaseDir, { recursive: true });
}

const builtCli = join(root, "dist", "node", "meshaway.mjs");
if (!existsSync(builtCli)) {
  console.error("Run 'pnpm run build' first.");
  process.exit(1);
}

copyFileSync(builtCli, join(releaseDir, "meshaway.mjs"));
console.log(`Copied CLI to release/meshaway.mjs`);

const SENTINEL_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";
const blobName = "sea-prep.blob";

async function trySeaBuild(): Promise<boolean> {
  const configPath = join(root, ".sea-config.build.json");
  const config = {
    main: "dist/node/meshaway.mjs",
    output: join(releaseDir, outputName),
    disableExperimentalSEAWarning: true,
  };
  const fs = await import("node:fs/promises");
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");

  const result = spawnSync(process.execPath, ["--build-sea", configPath], {
    cwd: root,
    stdio: "inherit",
  });

  return result.status === 0;
}

async function main() {
  const ok = await trySeaBuild();
  if (ok) {
    console.log(`SEA binary written to release/${outputName}`);
    console.log("Run: ./release/meshaway");
  } else {
    // Create shell launcher so ./meshaway works (avoids macOS killing direct .mjs exec)
    if (!isWindows) {
      const launcher = join(releaseDir, "meshaway");
      const launcherScript = `#!/bin/sh
exec node "$(dirname "$0")/meshaway.mjs" "$@"
`;
      writeFileSync(launcher, launcherScript, "utf8");
      chmodSync(launcher, 0o755);
      console.log("Created release/meshaway launcher");
    }
    console.log("Run: ./release/meshaway  or  node release/meshaway.mjs");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
