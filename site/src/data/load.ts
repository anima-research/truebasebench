/**
 * Data loading (DESIGN §6.1): manifest -> highest bench_v<N>.json -> validate.
 * Live source: VITE_DATA_BASE_URL (OVH Object Storage). Fallback: the repo copy served at /data.
 */
import { parseBundleJson } from "./parse";
import { assertBundle } from "./validate";
import type { LoadedBundle, Manifest } from "./types";

const REPO_BASE = `${(import.meta.env?.BASE_URL ?? "/").replace(/\/$/, "")}/data`;

export function liveBase(): string | null {
  const v = (import.meta.env?.VITE_DATA_BASE_URL as string | undefined)?.trim();
  return v ? v.replace(/\/+$/, "") : null;
}

export function bundleVersion(file: string): number {
  const m = /bench_v(\d+)\.json$/.exec(file);
  return m ? parseInt(m[1], 10) : -1;
}

/** Pick the bundle with the highest N among manifest entries named bench_v<N>.json. */
export function latestFromManifest(man: Manifest): string {
  const files = (man.bundles ?? []).map((b) => (typeof b === "string" ? b : b.file)).filter((f) => bundleVersion(f) >= 0);
  if (!files.length) {
    if (man.latest) return man.latest;
    throw new Error("manifest lists no bench_v<N>.json bundles");
  }
  return files.sort((a, b) => bundleVersion(b) - bundleVersion(a))[0];
}

/** How long the live source may take to start responding, per request, before the repo copy is used instead. */
export const LIVE_TIMEOUT_MS = 8000;

async function fetchText(url: string, timeoutMs?: number): Promise<string> {
  // A blackholed or very slow bucket must not leave the page on its skeleton: abort and fall back.
  const ctl = timeoutMs && typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
  try {
    const r = await fetch(url, { cache: "no-cache", signal: ctl?.signal });
    // the limit is on getting a response at all; a slow but live connection may take longer for the body
    if (timer) clearTimeout(timer);
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return await r.text();
  } catch (e) {
    if (ctl?.signal.aborted) throw new Error(`${url}: no response within ${timeoutMs} ms`);
    throw e;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function loadFrom(base: string, timeoutMs?: number): Promise<Omit<LoadedBundle, "fallback">> {
  const man = parseBundleJson<Manifest>(await fetchText(`${base}/manifest.json`, timeoutMs));
  const file = latestFromManifest(man);
  const url = `${base}/${file}`;
  const bundle = assertBundle(parseBundleJson(await fetchText(url, timeoutMs)));
  return { bundle, file, url };
}

let memo: Promise<LoadedBundle> | null = null;

export function loadBundle(force = false): Promise<LoadedBundle> {
  if (memo && !force) return memo;
  memo = (async () => {
    const live = liveBase();
    if (live && live !== REPO_BASE) {
      try {
        return { ...(await loadFrom(live, LIVE_TIMEOUT_MS)), fallback: false };
      } catch (e) {
        console.warn("[tbb] live data unavailable, using bundled copy:", e);
        return { ...(await loadFrom(REPO_BASE)), fallback: true };
      }
    }
    return { ...(await loadFrom(REPO_BASE)), fallback: false };
  })();
  memo.catch(() => {
    memo = null;
  });
  return memo;
}
