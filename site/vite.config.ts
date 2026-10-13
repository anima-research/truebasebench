import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream, existsSync, mkdirSync, readdirSync, copyFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
/** The repo copy of the data bundles (../data). Served at /data/ in dev and copied to dist/data/ on build. */
const DATA_DIR = resolve(here, "..", "data");

function repoData(): Plugin {
  return {
    name: "tbb-repo-data",
    configureServer(server) {
      server.middlewares.use("/data", (req, res, next) => {
        const name = decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\/+/, "");
        if (!/^[\w.-]+\.json$/.test(name)) return next();
        const file = join(DATA_DIR, name);
        if (!existsSync(file) || !statSync(file).isFile()) return next();
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.setHeader("Cache-Control", "no-cache");
        createReadStream(file).pipe(res);
      });
    },
    writeBundle(options) {
      const outDir = options.dir ?? resolve(here, "dist");
      const target = join(outDir, "data");
      mkdirSync(target, { recursive: true });
      for (const f of readdirSync(DATA_DIR)) {
        if (f.endsWith(".json")) copyFileSync(join(DATA_DIR, f), join(target, f));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), repoData()],
  server: { port: 5173 },
  build: { target: "es2020", sourcemap: false },
});
