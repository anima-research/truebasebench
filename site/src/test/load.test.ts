import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DATA } from "./helpers";

const LIVE = "https://bucket.example.invalid/tbb";

/** fetch stub: repo copy under /data/ is served from ../data; the live host behaves as `live` says. */
function stubFetch(live: "down" | "hang" | "bad-bundle" | "ok") {
  return vi.fn((url: string, init?: RequestInit) => {
    if (url.startsWith("/data/")) {
      const body = readFileSync(join(DATA, url.slice("/data/".length)), "utf8");
      return Promise.resolve(new Response(body, { status: 200 }));
    }
    if (live === "down") return Promise.reject(new TypeError("Failed to fetch"));
    if (live === "hang")
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
    if (url.endsWith("manifest.json")) return Promise.resolve(new Response(JSON.stringify({ bundles: ["bench_v9.json"] }), { status: 200 }));
    if (live === "bad-bundle") return Promise.resolve(new Response(JSON.stringify({ schema_version: 1 }), { status: 200 }));
    return Promise.resolve(new Response(readFileSync(join(DATA, "bench_v1.json"), "utf8"), { status: 200 }));
  });
}

async function freshLoader() {
  vi.resetModules();
  return import("../data/load");
}

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("bundle loading and fallback (DESIGN §6.1)", () => {
  it("without VITE_DATA_BASE_URL reads only the repo copy, not flagged as fallback", async () => {
    vi.stubEnv("VITE_DATA_BASE_URL", "");
    const f = stubFetch("down");
    vi.stubGlobal("fetch", f);
    const { loadBundle } = await freshLoader();
    const r = await loadBundle(true);
    expect(r.fallback).toBe(false);
    expect(r.file).toBe("bench_v1.json");
    expect(f.mock.calls.every(([u]) => String(u).startsWith("/data/"))).toBe(true);
  });
  it("falls back to the repo copy when the live source is unreachable (offline)", async () => {
    vi.stubEnv("VITE_DATA_BASE_URL", LIVE + "/");
    vi.stubGlobal("fetch", stubFetch("down"));
    const { loadBundle } = await freshLoader();
    const r = await loadBundle(true);
    expect(r.fallback).toBe(true);
    expect(r.url).toBe("/data/bench_v1.json");
    expect(r.bundle.models.length).toBeGreaterThan(0);
  });
  it("falls back when the live bundle fails validation", async () => {
    vi.stubEnv("VITE_DATA_BASE_URL", LIVE);
    vi.stubGlobal("fetch", stubFetch("bad-bundle"));
    const { loadBundle } = await freshLoader();
    expect((await loadBundle(true)).fallback).toBe(true);
  });
  it("falls back when the live source never responds", async () => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_DATA_BASE_URL", LIVE);
    vi.stubGlobal("fetch", stubFetch("hang"));
    const { loadBundle, LIVE_TIMEOUT_MS } = await freshLoader();
    const p = loadBundle(true);
    await vi.advanceTimersByTimeAsync(LIVE_TIMEOUT_MS + 10);
    const r = await p;
    expect(r.fallback).toBe(true);
  });
  it("uses the live source when it works", async () => {
    vi.stubEnv("VITE_DATA_BASE_URL", LIVE);
    vi.stubGlobal("fetch", stubFetch("ok"));
    const { loadBundle } = await freshLoader();
    const r = await loadBundle(true);
    expect(r.fallback).toBe(false);
    expect(r.url).toBe(`${LIVE}/bench_v9.json`);
  });
});
