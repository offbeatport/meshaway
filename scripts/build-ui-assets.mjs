import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const root = process.cwd();
const outDir = path.join(root, "dist", "ui");

await mkdir(outDir, { recursive: true });

const dashboardResult = await build({
  entryPoints: [path.join(root, "src", "ui", "Dashboard.tsx")],
  bundle: true,
  write: false,
  platform: "browser",
  format: "esm",
  target: ["es2022"],
  jsx: "automatic",
  legalComments: "none",
});

const dashboardJs = dashboardResult.outputFiles[0]?.text ?? "";
const cssText = await readFile(path.join(root, "src", "ui", "index.css"), "utf8");

await writeFile(path.join(outDir, "dashboard.js"), dashboardJs, "utf8");
await writeFile(path.join(outDir, "index.css"), cssText, "utf8");
