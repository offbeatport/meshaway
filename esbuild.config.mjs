import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/meshaway.js",
  banner: {
    js: "#!/usr/bin/env node",
  },
  sourcemap: true,
  legalComments: "none",
});
