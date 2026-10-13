#!/usr/bin/env node
// Validate every data/bench_v<N>.json and data/manifest.json against the site's JSON Schemas
// (site/src/data/*.schema.json), check that the manifest lists only bundles that exist, and that each
// model's overall score is the mean of its available sub-scores. Uses ajv from site/node_modules.
//
//   (cd site && npm ci) && node tools/validate_data.mjs [data-dir]
import { createRequire } from "node:module";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = resolve(process.argv[2] ?? join(repo, "data"));
const require = createRequire(join(repo, "site", "package.json"));
const Ajv = require("ajv");

// Bundles are published for other consumers (notebooks, other sites), so they must be strict JSON:
// plain JSON.parse, and bare NaN/Infinity (which Python's json writes by default) is a failure.
// Write bundles with tools/export_bundle.py, which turns NaN into null.
const parse = (file) => {
  const text = readFileSync(file, "utf8");
  try {
    return JSON.parse(text);
  } catch (e) {
    const bare = text.match(/(?<=[:\[,]\s*)-?(?:NaN|Infinity)(?=\s*[,\]}])/);
    const hint = bare ? ` (bare ${bare[0]} token; regenerate with tools/export_bundle.py)` : "";
    fail(`${file}: not valid JSON: ${e.message}${hint}`);
    return null;
  }
};
const schema = (name) => JSON.parse(readFileSync(join(repo, "site", "src", "data", name), "utf8"));

const ajv = new Ajv({ allErrors: true, strict: false });
const checkBundle = ajv.compile(schema("bench.schema.json"));
const checkManifest = ajv.compile(schema("manifest.schema.json"));
let failed = false;
const fail = (msg) => {
  failed = true;
  console.error(`FAIL ${msg}`);
};

const bundles = readdirSync(dataDir).filter((f) => /^bench_v\d+\.json$/.test(f));
if (!bundles.length) fail(`no bench_v<N>.json in ${dataDir}`);
for (const f of bundles) {
  const b = parse(join(dataDir, f));
  if (b === null) continue;
  if (!checkBundle(b)) {
    fail(`${f}: ${ajv.errorsText(checkBundle.errors, { separator: "\n  " })}`);
    continue;
  }
  if (b.n_models !== b.models.length) fail(`${f}: n_models ${b.n_models} != ${b.models.length}`);
  const ids = new Set();
  for (const m of b.models) {
    if (ids.has(m.id)) fail(`${f}: duplicate id ${m.id}`);
    ids.add(m.id);
    const subs = Object.values(m.subscores ?? {}).map((s) => s?.score).filter((x) => typeof x === "number");
    const mean = subs.length ? subs.reduce((a, c) => a + c, 0) / subs.length : null;
    if ((mean === null) !== (m.score === null) || (mean !== null && Math.abs(mean - m.score) > 1e-9))
      fail(`${f}: ${m.id} score ${m.score} != mean of sub-scores ${mean}`);
  }
  console.log(`ok   ${f} (${b.models.length} models)`);
}

const manPath = join(dataDir, "manifest.json");
if (!existsSync(manPath)) fail("manifest.json missing");
else {
  const man = parse(manPath);
  if (man === null) {
    /* reported */
  } else if (!checkManifest(man)) fail(`manifest.json: ${ajv.errorsText(checkManifest.errors)}`);
  else {
    const listed = man.bundles.map((e) => (typeof e === "string" ? e : e.file));
    for (const f of listed) if (!bundles.includes(f)) fail(`manifest.json lists ${f}, which does not exist`);
    for (const f of bundles) if (!listed.includes(f)) console.warn(`warn ${f} is not listed in manifest.json`);
    if (man.latest && !listed.includes(man.latest)) fail(`manifest.json latest ${man.latest} is not listed`);
    console.log(`ok   manifest.json (${listed.length} bundle(s))`);
  }
}
process.exit(failed ? 1 : 0);
