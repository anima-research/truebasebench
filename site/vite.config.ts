import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { createReadStream, existsSync, mkdirSync, readdirSync, copyFileSync, readFileSync, statSync } from "node:fs";
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

/** Site identity (name, canonical URL, description) shared by index.html, src/lib/config.ts and tools/og.mjs. */
const SITE = JSON.parse(readFileSync(resolve(here, "site.config.json"), "utf8")) as { name: string; url: string; description: string };

/** Fills __SITE_URL__ / __SITE_NAME__ / __SITE_DESCRIPTION__ in index.html (the social-sharing meta tags) before Vite
 * parses the HTML (order "pre": Vite decodes href/src attributes, so a %-style placeholder would fail there). */
function siteMeta(): Plugin {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return {
    name: "tbb-site-meta",
    transformIndexHtml: {
      order: "pre",
      handler(html) {
        return html
          .replace(/__SITE_URL__/g, esc(SITE.url.replace(/\/+$/, "")))
          .replace(/__SITE_NAME__/g, esc(SITE.name))
          .replace(/__SITE_DESCRIPTION__/g, esc(SITE.description));
      },
    },
  };
}

export default defineConfig({
  plugins: [react(), repoData(), siteMeta()],
  server: { port: 5173 },
  build: { target: "es2020", sourcemap: false },
});
