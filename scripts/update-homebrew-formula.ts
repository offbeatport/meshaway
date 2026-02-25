/**
 * Generate the Homebrew Formula for meshaway using native binaries from GitHub Releases
 * (same pattern as Copilot CLI and OpenCode: no Node dependency, standalone binary).
 *
 * Prerequisite: Create a GitHub release with tag v<version> and upload the archives from
 * release/ (from pnpm run build:native). Then run this script to generate the formula.
 *
 * Usage:
 *   pnpm run release:homebrew              # use version from package.json
 *   pnpm exec tsx scripts/update-homebrew-formula.ts 1.2.3
 *
 * Env:
 *   GITHUB_REPO   Default: offbeatport/meshaway
 *
 * Output: scripts/homebrew/meshaway.rb (copy to your tap)
 */

import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = join(__dirname, "..");

const GITHUB_REPO = process.env.GITHUB_REPO ?? "offbeatport/meshaway";

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
  desc "High-performance protocol bridge for agentic tools"
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
  const outPath = join(outDir, "meshaway.rb");
  writeFileSync(outPath, content, "utf8");
  console.log("\nWrote", outPath);
  console.log("\nCopy to your tap:");
  console.log("  cp scripts/homebrew/meshaway.rb /path/to/homebrew-meshaway/Formula/meshaway.rb");
  console.log("  cd /path/to/homebrew-meshaway && git add Formula/meshaway.rb && git commit -m \"meshaway %s\" && git push", version);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
