import Ajv from "ajv";
import { describe, expect, it } from "vitest";
import schema from "../data/bench.schema.json";
import manifestSchema from "../data/manifest.schema.json";
import { parseBundleJson, sanitizeJsonText } from "../data/parse";
import { validateBundle } from "../data/validate";
import { latestFromManifest } from "../data/load";
import { recompute } from "../data/scoring";
import type { Bundle, Model } from "../data/types";
import { bundleFiles, readBundle, readManifest, readRaw } from "./helpers";

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
const validateManifest = ajv.compile(manifestSchema);

describe("manifest", () => {
  it("validates and lists every shipped bundle", () => {
    const man = readManifest();
    expect(validateManifest(man), JSON.stringify(validateManifest.errors)).toBe(true);
    const listed = man.bundles.map((b) => (typeof b === "string" ? b : b.file)).sort();
    expect(listed).toEqual(bundleFiles().sort());
  });
  it("picks the highest bench_v<N>", () => {
    expect(latestFromManifest({ bundles: ["bench_v1.json", { file: "bench_v12.json" }, "bench_v3.json"] })).toBe("bench_v12.json");
    expect(latestFromManifest(readManifest())).toBe(bundleFiles().sort((a, b) => parseInt(b.slice(7)) - parseInt(a.slice(7)))[0]);
  });
});

describe("NaN-tolerant parsing", () => {
  it("maps bare NaN / Infinity to null outside strings only", () => {
    const out = parseBundleJson<Record<string, unknown>>('{"a": NaN, "b": [Infinity, -Infinity, 1], "c": "NaN and Infinity", "d\\"NaN": 2}');
    expect(out).toEqual({ a: null, b: [null, null, 1], c: "NaN and Infinity", 'd"NaN': 2 });
    expect(sanitizeJsonText('{"x": 1}')).toBe('{"x": 1}');
  });
});

for (const file of bundleFiles()) {
  describe(`data contract: ${file}`, () => {
    const raw = readRaw(file);
    const b = parseBundleJson<Bundle>(raw);

    it("parses (NaN read as null)", () => {
      expect(() => JSON.parse(sanitizeJsonText(raw))).not.toThrow();
    });
    it("validates against bench.schema.json", () => {
      const ok = validate(b);
      expect(ok, JSON.stringify(validate.errors?.slice(0, 5), null, 1)).toBe(true);
    });
    it("passes the runtime structural check", () => {
      expect(validateBundle(b)).toEqual([]);
    });
    it("has n_models equal to models.length and unique ids", () => {
      expect(b.n_models).toBe(b.models.length);
      expect(new Set(b.models.map((m) => m.id)).size).toBe(b.models.length);
    });
    it("has unique (family, order) rungs", () => {
      const keys = b.models.map((m) => `${m.family}#${m.order}`);
      expect(new Set(keys).size).toBe(keys.length);
    });
  });
}

describe("degrades gracefully", () => {
  const b = readBundle();
  const synthetic: Model = {
    id: "synthetic-null",
    family: "Synthetic",
    stage: "base",
    label: "every optional block null",
    order: 0,
    score: null,
    subscores: { calib: null, spread: null, memo: null, prior: null },
    fingerprint: null,
    surnames: null,
    weird: null,
    selfboot: null,
    tail: null,
  };
  it("a model with every optional block null validates", () => {
    const bb = { ...b, n_models: b.models.length + 1, models: [...b.models, synthetic] };
    expect(validate(bb), JSON.stringify(validate.errors?.slice(0, 3))).toBe(true);
    expect(validateBundle(bb)).toEqual([]);
  });
  it("recompute on a null fingerprint gives null overall", () => {
    const r = recompute(null);
    expect(r.overall).toBeNull();
    expect(r.nAvail).toBe(0);
  });
  it("rejects a bundle with a bad stage or missing keys", () => {
    const bad = { ...b, models: [{ ...b.models[0], stage: "chat" }] };
    expect(validate(bad)).toBe(false);
    expect(validateBundle(bad).length).toBeGreaterThan(0);
    expect(validateBundle({ models: [] }).length).toBeGreaterThan(0);
  });
});
