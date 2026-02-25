/**
 * Create a GitHub release and upload the native binary archives from release/.
 * Run after pnpm run build:native. Requires gh CLI and release/ archives to exist.
 *
 * Usage:
 *   pnpm run release:github           # use version from package.json
 *   pnpm exec tsx scripts/github-release.ts 1.2.3
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = join(__dirname, "..");
const releaseDir = join(root, "release");

const ARCHIVE_SUFFIXES = [
  "darwin-arm64.tar.gz",
  "darwin-x64.tar.gz",
  "linux-arm64.tar.gz",
  "linux-x64.tar.gz",
  "win32-arm64.zip",
  "win32-x64.zip",
];

function getVersion(): string {
  const version = process.argv[2];
  if (version) return version;
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return (pkg.version as string) || "0.0.0";
}

function main(): void {
  const version = getVersion();
  const tag = `v${version}`;
  const archives = ARCHIVE_SUFFIXES.map((s) =>
    join(releaseDir, `meshaway-${version}-${s}`)
  );
  const missing = archives.filter((p) => !existsSync(p));
  if (missing.length > 0) {
    console.error("Missing archives (run pnpm run build:native first):");
    missing.forEach((p) => console.error("  ", p));
    process.exit(1);
  }

  const args = [
    "release",
    "create",
    tag,
    "--notes",
    `Release ${tag}`,
    ...archives,
  ];
  console.log("Creating GitHub release", tag, "with", archives.length, "archives...\n");
  const r = spawnSync("gh", args, { stdio: "inherit", cwd: root });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log("\nDone. Run pnpm run release:homebrew to generate the formula.");
}

main();
