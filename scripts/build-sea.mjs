#!/usr/bin/env node
/**
 * Build a Node.js Single Executable Application (SEA).
 * Tries Node 25.5+ --build-sea first; falls back to Node 20.6+ (--experimental-sea-config + postject).
 * Run from project root after npm run build.
 */
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";
const outputName = isWindows ? "release/mesh.exe" : "release/mesh";
const blobName = "sea-prep.blob";

const releaseDir = path.join(root, "release");
if (!existsSync(releaseDir)) {
  mkdirSync(releaseDir, { recursive: true });
}

const SENTINEL_FUSE = "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2";

async function tryModernBuild() {
  const fs = await import("node:fs/promises");
  const configPath = path.join(root, ".sea-config.build.json");
  const config = {
    main: "dist/meshaway.cjs",
    output: outputName,
    disableExperimentalSEAWarning: true,
    assets: {
      "ui/dashboard.js": "dist/ui/dashboard.js",
      "ui/index.css": "dist/ui/index.css",
    },
  };
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
  const result = spawnSync(process.execPath, ["--build-sea", configPath], {
    cwd: root,
    stdio: "inherit",
  });
  return result.status === 0;
}

async function legacyBuild() {
  const fs = await import("node:fs/promises");
  const configPath = path.join(root, ".sea-config.build.json");
  const seaConfig = {
    main: "dist/meshaway.cjs",
    output: `release/${blobName}`,
    disableExperimentalSEAWarning: true,
    assets: {
      "ui/dashboard.js": "dist/ui/dashboard.js",
      "ui/index.css": "dist/ui/index.css",
    },
  };
  await fs.writeFile(configPath, JSON.stringify(seaConfig, null, 2), "utf8");

  const r1 = spawnSync(process.execPath, ["--experimental-sea-config", configPath], {
    cwd: root,
    stdio: "inherit",
  });
  if (r1.status !== 0) return false;

  const blobPath = path.join(root, "release", blobName);
  if (!existsSync(blobPath)) {
    console.error("SEA blob was not created");
    return false;
  }

  const nodeCopy = path.join(root, outputName);
  copyFileSync(process.execPath, nodeCopy);

  if (process.platform === "darwin") {
    spawnSync("codesign", ["--remove-signature", nodeCopy], { stdio: "inherit" });
  }

  const postjectArgs = [nodeCopy, "NODE_SEA_BLOB", blobPath, "--sentinel-fuse", SENTINEL_FUSE];
  if (process.platform === "darwin") {
    postjectArgs.push("--macho-segment-name", "NODE_SEA");
  }
  const r2 = spawnSync("npx", ["postject", ...postjectArgs], { cwd: root, stdio: "inherit" });
  if (r2.status !== 0) {
    console.error("postject failed. Install with: npm install -D postject");
    return false;
  }

  if (process.platform === "darwin") {
    spawnSync("codesign", ["--sign", "-", nodeCopy], { stdio: "inherit" });
  }
  return true;
}

const modernOk = await tryModernBuild();
if (modernOk) {
  if (process.platform === "darwin") {
    spawnSync("codesign", ["--sign", "-", path.join(root, outputName)], {
      cwd: root,
      stdio: "inherit",
    });
  }
  console.log(`SEA written to ${outputName}`);
  process.exit(0);
}

console.log("Node --build-sea not available, using legacy SEA workflow (postject)...");
const legacyOk = await legacyBuild();
console.log(legacyOk ? `SEA written to ${outputName}` : "SEA build failed");
process.exit(legacyOk ? 0 : 1);
