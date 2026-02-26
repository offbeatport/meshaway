import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootPkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../../package.json"), "utf-8")
) as { version?: string };
const version = rootPkg.version ?? "0.0.0";

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(version),
  },
  root: __dirname,
  build: {
    outDir: path.resolve(__dirname, "../../../dist/ui"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@hub": path.resolve(__dirname, ".."),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": process.env.MESH_HUB_URL ?? "http://127.0.0.1:7337",
      "/health": process.env.MESH_HUB_URL ?? "http://127.0.0.1:7337",
    },
  },
});
