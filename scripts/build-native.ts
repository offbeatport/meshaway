/**
 * Build fat native executables for all major platforms/architectures using @yao-pkg/pkg.
 * - Runs full build, then bundles CLI to a single CJS file (pkg requires require() tracing).
 * - Produces one executable per target in release/, then archives each (tar.gz on Unix, .zip on Windows) for distribution/GitHub Releases.
 *
 * Usage: pnpm run build:native
 *
 * Env:
 *   BUILD_NATIVE_SKIP_BUILD=1   Skip running pnpm build (use existing dist/ and embed-ui).
 */

import { build } from "esbuild";
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const releaseDir = join(root, "release");
const distNode = join(root, "dist", "node");
const pkgEntry = join(distNode, "meshaway-pkg.cjs");

const PKG_TARGETS = [
  "node20-linux-x64",
  "node20-linux-arm64",
  "node20-macos-x64",
  "node20-macos-arm64",
  "node20-win-x64",
  "node20-win-arm64",
];

/** pkg output filename -> (platform-arch for archive name) */
const PKG_OUTPUT_TO_ARCHIVE: [string, string][] = [
  ["meshaway-linux-x64", "linux-x64"],
  ["meshaway-linux-arm64", "linux-arm64"],
  ["meshaway-macos-x64", "darwin-x64"],
  ["meshaway-macos-arm64", "darwin-arm64"],
  ["meshaway-win-x64.exe", "win32-x64"],
  ["meshaway-win-arm64.exe", "win32-arm64"],
];

function getVersion(): string {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return (pkg.version as string) || "0.0.0";
}

async function runBuild(): Promise<void> {
  if (process.env.BUILD_NATIVE_SKIP_BUILD === "1") {
    const meshaway = join(distNode, "meshaway.mjs");
    if (!existsSync(meshaway)) {
      console.error("BUILD_NATIVE_SKIP_BUILD=1 but dist/node/meshaway.mjs not found. Run pnpm run build first.");
      process.exit(1);
    }
    console.log("Skipping build (BUILD_NATIVE_SKIP_BUILD=1)\n");
    return;
  }
  console.log("Running full build...\n");
  const r = spawnSync("pnpm", ["run", "build"], { cwd: root, stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

async function buildCjsForPkg(): Promise<void> {
  if (!existsSync(distNode)) mkdirSync(distNode, { recursive: true });
  const embeddedUi = join(root, "src", "hub", "embedded-ui.generated.ts");
  if (!existsSync(embeddedUi)) {
    console.error("src/hub/embedded-ui.generated.ts not found. Run pnpm run build first.");
    process.exit(1);
  }
  console.log("Bundling CLI to CJS for pkg...\n");
  await build({
    entryPoints: [join(root, "src", "cli.ts")],
    bundle: true,
    platform: "node",
    target: "node20",
    format: "cjs",
    outfile: pkgEntry,
    legalComments: "none",
    sourcemap: false,
    // Bundle everything except optional native addons (pkg can't bundle them cross-platform)
    packages: "bundle",
    external: ["better-sqlite3"],
  });
}

function runPkg(): void {
  if (!existsSync(pkgEntry)) {
    console.error("pkg entry not found:", pkgEntry);
    process.exit(1);
  }
  if (!existsSync(releaseDir)) mkdirSync(releaseDir, { recursive: true });
  const targets = PKG_TARGETS.join(",");
  console.log("Running pkg for targets:", targets, "\n");
  const outputBase = join(releaseDir, "meshaway");
  const r = spawnSync(
    "pnpm",
    [
      "exec",
      "pkg",
      pkgEntry,
      "--targets",
      targets,
      "--output",
      outputBase,
      "--no-bytecode",
      "--public-packages",
      "*",
      "--public",
    ],
    { cwd: root, stdio: "inherit" }
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function archiveBinaries(): void {
  const version = getVersion();
  console.log("\nArchiving binaries...\n");
  for (const [pkgName, platformArch] of PKG_OUTPUT_TO_ARCHIVE) {
    const binaryPath = join(releaseDir, pkgName);
    if (!existsSync(binaryPath)) continue;
    const isWindows = platformArch.startsWith("win32");
    const ext = isWindows ? "zip" : "tar.gz";
    const archiveName = `meshaway-${version}-${platformArch}.${ext}`;
    const archivePath = join(releaseDir, archiveName);
    const isExe = pkgName.endsWith(".exe");
    const innerName = isExe ? "meshaway.exe" : "meshaway";
    const tmp = mkdtempSync(join(tmpdir(), "meshaway-archive-"));
    try {
      copyFileSync(binaryPath, join(tmp, innerName));
      if (isWindows) {
        const zip = spawnSync("zip", ["-j", archivePath, join(tmp, innerName)], {
          stdio: "pipe",
        });
        if (zip.status !== 0) {
          console.error("zip failed for", archiveName, zip.stderr?.toString());
          process.exit(1);
        }
      } else {
        const tar = spawnSync("tar", ["czf", archivePath, "-C", tmp, innerName], {
          stdio: "pipe",
        });
        if (tar.status !== 0) {
          console.error("tar failed for", archiveName, tar.stderr?.toString());
          process.exit(1);
        }
      }
      console.log("  ", archiveName);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }
}

async function main(): Promise<void> {
  console.log("build:native — fat executables for all major platforms\n");
  await runBuild();
  await buildCjsForPkg();
  runPkg();
  archiveBinaries();
  console.log("\nDone. Executables and archives in release/:");
  const { readdirSync } = await import("node:fs");
  if (existsSync(releaseDir)) {
    const files = readdirSync(releaseDir).filter((f) => f.startsWith("meshaway"));
    for (const f of files.sort()) console.log("  ", join(releaseDir, f));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
