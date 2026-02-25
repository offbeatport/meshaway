/**
 * Generate or update the Homebrew Formula for meshaway.
 * Uses the npm tarball (so publish to npm first), then run this to get Formula/meshaway.rb.
 *
 * Usage:
 *   pnpm exec tsx scripts/update-homebrew-formula.ts           # use version from package.json
 *   pnpm exec tsx scripts/update-homebrew-formula.ts 1.2.3     # use specific version
 *
 * Output: scripts/homebrew/meshaway.rb (copy to your tap, e.g. homebrew-meshaway/Formula/meshaway.rb)
 */

import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const root = join(__dirname, "..");

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

function formulaContent(version: string, sha256: string): string {
  return `# typed: false
# frozen_string_literal: true

class Meshaway < Formula
  desc "High-performance protocol bridge for agentic tools"
  homepage "https://github.com/offbeatport/meshaway"
  url "https://registry.npmjs.org/meshaway/-/meshaway-${version}.tgz"
  sha256 "${sha256}"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink libexec.glob("bin/*")
  end

  test do
    assert_match "meshaway", shell_output("#{bin}/meshaway --help")
  end
end
`;
}

async function main(): Promise<void> {
  const version = process.argv[2] ?? getVersionFromPackage();
  const url = `https://registry.npmjs.org/meshaway/-/meshaway-${version}.tgz`;
  console.log("Fetching tarball to compute SHA256...");
  const sha256 = await fetchSha256(url);
  const content = formulaContent(version, sha256);
  const outDir = join(root, "scripts", "homebrew");
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, "meshaway.rb");
  writeFileSync(outPath, content, "utf8");
  console.log("Wrote", outPath);
  console.log("\nTo release to Homebrew:");
  console.log("  1. Publish this version to npm (pnpm run release:publish)");
  console.log("  2. Copy scripts/homebrew/meshaway.rb to your tap:");
  console.log("     e.g. homebrew-meshaway/Formula/meshaway.rb");
  console.log("  3. Commit and push. Users: brew tap offbeatport/meshaway && brew install meshaway");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
