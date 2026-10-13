import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { parseBundleJson } from "../data/parse";
import { latestFromManifest } from "../data/load";
import type { Bundle, Manifest } from "../data/types";

const here = dirname(fileURLToPath(import.meta.url));
export const REPO = resolve(here, "..", "..", "..");
export const DATA = join(REPO, "data");
export const DOCS = join(REPO, "docs");

export function readManifest(): Manifest {
  return parseBundleJson<Manifest>(readFileSync(join(DATA, "manifest.json"), "utf8"));
}

/** Every bench_v<N>.json in data/ (the contract applies to all shipped bundles). */
export function bundleFiles(): string[] {
  return readdirSync(DATA).filter((f) => /^bench_v\d+\.json$/.test(f));
}

export function readBundle(file?: string): Bundle {
  const f = file ?? latestFromManifest(readManifest());
  return parseBundleJson<Bundle>(readFileSync(join(DATA, f), "utf8"));
}

export function readRaw(file: string): string {
  return readFileSync(join(DATA, file), "utf8");
}

export function readDoc(name: string): string {
  return readFileSync(join(DOCS, name), "utf8");
}
