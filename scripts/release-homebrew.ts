/**
 * Generate the Homebrew formula for meshaway (from GitHub Release assets), then clone the
 * tap repo if needed, copy the formula, and commit + push.
 *
 * Prerequisite: GitHub release for the version exists (run release:github first).
 *
 * Usage:
 *   pnpm run release:homebrew              # version from package.json, generate + push
 *   pnpm exec tsx scripts/update-homebrew-formula.ts 1.2.3
 *
 * Env:
 *   GITHUB_REPO       Default: offbeatport/meshaway
 *   HOMEBREW_TAP_PATH Where the tap repo is or should be cloned (default: ../homebrew-meshaway)
 *   HOMEBREW_TAP_REPO Clone URL (default: https://github.com/offbeatport/homebrew-meshaway.git)
 */

import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync, existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = join(__dirname, "..");

const GITHUB_REPO = process.env.GITHUB_REPO ?? "offbeatport/meshaway";
const TAP_PATH = process.env.HOMEBREW_TAP_PATH ?? join(root, "..", "homebrew-meshaway");
const TAP_REPO = process.env.HOMEBREW_TAP_REPO ?? "https://github.com/offbeatport/homebrew-meshaway.git";
const FORMULA_SRC = join(root, "scripts", "homebrew", "meshaway.rb");
const FORMULA_DEST = join(TAP_PATH, "Formula", "meshaway.rb");

function run(cmd: string, args: string[], opts: { cwd?: string } = {}): boolean {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: opts.cwd ?? root });
  return r.status === 0;
}

const HOMEBREW_TARGETS = [
  { platform: "darwin", arch: "arm64", osBlock: "macos", cpu: "arm?" },
  { platform: "darwin", arch: "x64", osBlock: "macos", cpu: "intel?" },
  { platform: "linux", arch: "arm64", osBlock: "linux", cpu: "arm? and Hardware::CPU.is_64_bit?" },
  { platform: "linux", arch: "x64", osBlock: "linux", cpu: "intel? and Hardware::CPU.is_64_bit?" },
] as const;

function getVersionFromPackage(): string {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  return (pkg.version as string) || "0.0.0";
}

async function fetchSha256(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
  const buf = await res.arrayBuffer();
  return createHash("sha256").update(Buffer.from(buf)).digest("hex");
}

function assetUrl(version: string, platform: string, arch: string): string {
  const ext = platform === "darwin" || platform === "linux" ? "tar.gz" : "zip";
  const name = `meshaway-${version}-${platform}-${arch}.${ext}`;
  return `https://github.com/${GITHUB_REPO}/releases/download/v${version}/${name}`;
}

function formulaContent(version: string, shas: Map<string, string>): string {
  const macosArm = shas.get("darwin-arm64");
  const macosX64 = shas.get("darwin-x64");
  const linuxArm = shas.get("linux-arm64");
  const linuxX64 = shas.get("linux-x64");

  const blocks: string[] = [];

  if (macosArm != null && macosX64 != null) {
    blocks.push(`  on_macos do
    if Hardware::CPU.arm?
      url "https://github.com/${GITHUB_REPO}/releases/download/v${version}/meshaway-${version}-darwin-arm64.tar.gz"
      sha256 "${macosArm}"

      def install
        bin.install "meshaway"
      end
    end
    if Hardware::CPU.intel?
      url "https://github.com/${GITHUB_REPO}/releases/download/v${version}/meshaway-${version}-darwin-x64.tar.gz"
      sha256 "${macosX64}"

      def install
        bin.install "meshaway"
      end
    end
  end`);
  }

  if (linuxArm != null && linuxX64 != null) {
    blocks.push(`  on_linux do
    if Hardware::CPU.arm? && Hardware::CPU.is_64_bit?
      url "https://github.com/${GITHUB_REPO}/releases/download/v${version}/meshaway-${version}-linux-arm64.tar.gz"
      sha256 "${linuxArm}"

      def install
        bin.install "meshaway"
      end
    end
    if Hardware::CPU.intel? && Hardware::CPU.is_64_bit?
      url "https://github.com/${GITHUB_REPO}/releases/download/v${version}/meshaway-${version}-linux-x64.tar.gz"
      sha256 "${linuxX64}"

      def install
        bin.install "meshaway"
      end
    end
  end`);
  }

  return `# typed: false
# frozen_string_literal: true

class Meshaway < Formula
  desc "Protocol bridge for agentic tools"
  homepage "https://github.com/${GITHUB_REPO}"
  version "${version}"

${blocks.join("\n\n")}
  test do
    assert_match "meshaway", shell_output("#{bin}/meshaway --help")
  end
end
`;
}

async function main(): Promise<void> {
  const version = process.argv[2] ?? getVersionFromPackage();
  const shas = new Map<string, string>();

  console.log("Fetching GitHub Release assets to compute SHA256...\n");
  for (const { platform, arch } of HOMEBREW_TARGETS) {
    const key = `${platform}-${arch}`;
    const url = assetUrl(version, platform, arch);
    process.stdout.write(`  ${key}... `);
    try {
      const sha = await fetchSha256(url);
      shas.set(key, sha);
      console.log(sha.slice(0, 16) + "...");
    } catch (err) {
      console.error("\n" + (err instanceof Error ? err.message : String(err)));
      console.error("\nEnsure a GitHub release v%s exists with assets:", version);
      console.error("  meshaway-%s-darwin-arm64.tar.gz, darwin-x64, linux-arm64, linux-x64", version);
      console.error("(Run: pnpm run build:native, then create the release and upload the archives from release/)");
      process.exit(1);
    }
  }

  const content = formulaContent(version, shas);
  const outDir = join(root, "scripts", "homebrew");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  writeFileSync(FORMULA_SRC, content, "utf8");
  console.log("\nWrote", FORMULA_SRC);

  // Clone tap if needed, copy formula, commit and push
  if (!existsSync(join(TAP_PATH, ".git"))) {
    console.log("\nCloning tap to", TAP_PATH, "...");
    mkdirSync(join(TAP_PATH, ".."), { recursive: true });
    if (!run("git", ["clone", TAP_REPO, TAP_PATH])) {
      console.error("Failed to clone tap.");
      process.exit(1);
    }
  }
  mkdirSync(join(TAP_PATH, "Formula"), { recursive: true });
  copyFileSync(FORMULA_SRC, FORMULA_DEST);
  console.log("Copied formula to", FORMULA_DEST);

  if (!run("git", ["add", "Formula/meshaway.rb"], { cwd: TAP_PATH })) process.exit(1);
  const status = spawnSync("git", ["status", "--porcelain", "Formula/meshaway.rb"], {
    encoding: "utf8",
    cwd: TAP_PATH,
  });
  if ((status.stdout?.trim() ?? "") === "") {
    console.log("\nFormula unchanged, nothing to push.");
    return;
  }
  if (!run("git", ["commit", "-m", `meshaway ${version}`], { cwd: TAP_PATH })) process.exit(1);
  if (!run("git", ["push", "origin", "HEAD"], { cwd: TAP_PATH })) {
    console.error("Push failed. Check remote and auth.");
    process.exit(1);
  }
  console.log("\nDone. Users: brew update && brew upgrade meshaway");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
