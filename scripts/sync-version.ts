/**
 * Syncs src/shared/constants.ts VERSION with package.json.
 * Run after `pnpm changeset version` so the runtime constant stays in sync.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(import.meta.url), "..", "..");
const pkgPath = join(root, "package.json");
const constantsPath = join(root, "src", "shared", "constants.ts");

const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
const version = pkg?.version ?? "0.0.0";

let content = readFileSync(constantsPath, "utf8");
content = content.replace(
  /^export const VERSION = "[^"]+";/m,
  `export const VERSION = "${version}";`
);
writeFileSync(constantsPath, content);
console.log("Synced VERSION to", version);
