import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/meshaway.cjs",
  banner: {
    js: "#!/usr/bin/env node\nif (typeof __filename !== 'undefined') globalThis.__meshImportMetaUrl = require('node:url').pathToFileURL(__filename).href;",
  },
  sourcemap: true,
  legalComments: "none",
});
