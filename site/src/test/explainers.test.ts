/**
 * Explainers: pure helpers (construction, run rule, tape fill) and a server render of every registered explainer
 * against the shipped bundle, a bundle with a fully-null model added, and a bundle with optional blocks stripped.
 */
import { createElement, Suspense } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { readBundle } from "./helpers";
import type { Bundle, Model } from "../data/types";
import { fp } from "../data/bundle";
import { memoTriple, memoValue } from "../data/derive";
import { RUN_MIN_LEN } from "../data/method";
import { entropy, geometricWithEntropy } from "../explainers/kit/construct";
import { ruleSequence, runsOf, tapeCells } from "../explainers/verbatimRuns";
import { EXPLAINER_IDS } from "../explainers/types";

const b = readBundle();
// useLayoutEffect (chart width measuring) is a no-op on the server; keep the test output readable
const origError = console.error;
console.error = (...args: unknown[]) => {
  if (typeof args[0] === "string" && args[0].includes("useLayoutEffect does nothing on the server")) return;
  origError(...args);
};
let current: Bundle = b;
vi.mock("../data/BundleContext", () => ({
  useBundle: () => current,
  useLoaded: () => ({ bundle: current, file: "bench_v1.json", url: "/data/bench_v1.json", fallback: false }),
  useBundleState: () => ({ state: { status: "ready", loaded: { bundle: current, file: "bench_v1.json", url: "", fallback: false } }, retry: () => {} }),
}));

const modules: Record<string, () => Promise<{ default: (p: { bundle: Bundle; reducedMotion: boolean }) => unknown }>> = {
  position: () => import("../explainers/position"),
  "teacher-forcing": () => import("../explainers/teacherForcing"),
  "calibration-gap": () => import("../explainers/calibrationGap"),
  "verbatim-runs": () => import("../explainers/verbatimRuns"),
  surnames: () => import("../explainers/surnames"),
  score: () => import("../explainers/score"),
};

describe("construction (explainer a/c)", () => {
  it("matches the model's F_H by bisection for every model", () => {
    for (const m of b.models) {
      const H = fp(m, "F_H");
      if (H === null) continue;
      const c = geometricWithEntropy(H, 64);
      expect(c.clipped).toBe(false);
      expect(Math.abs(entropy(c.p) - H)).toBeLessThan(1e-9);
      expect(Math.abs(c.p.reduce((a, x) => a + x, 0) - 1)).toBeLessThan(1e-12);
    }
  });
  it("clips to uniform above ln(n)", () => {
    expect(geometricWithEntropy(10, 64).clipped).toBe(true);
  });
});

describe("run rule (explainer d)", () => {
  it("brackets exactly one run of RUN_MIN_LEN + 1 and leaves the short streak unbracketed", () => {
    const seq = ruleSequence();
    const r = runsOf(seq);
    expect(r.brackets).toEqual([[0, RUN_MIN_LEN]]);
    expect(Math.max(...r.counter.slice(RUN_MIN_LEN + 1))).toBeLessThan(RUN_MIN_LEN);
  });
  it("tapes fill exactly round(share × 1000) cells, deterministic per seed", () => {
    for (const m of b.models) {
      const v = memoValue(m);
      if (v === null) continue;
      const n = Math.round(v * 1000);
      const cells = tapeCells(m.id, n);
      expect(cells.length).toBe(1000);
      expect(cells.filter(Boolean).length).toBe(n);
      expect(tapeCells(m.id, n)).toEqual(cells);
    }
    expect(memoTriple(b)).not.toBeNull();
  });
});

const nullModel: Model = {
  id: "synthetic-null",
  family: "Synthetic",
  stage: "post-trained",
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

function stripped(): Bundle {
  return {
    ...b,
    models: b.models.map((m, i) => (i % 3 === 0 ? { ...m, surnames: null, weird: null, tail: null, selfboot: null } : m)),
  };
}

async function render(id: string, bundle: Bundle, reducedMotion: boolean): Promise<string> {
  current = bundle;
  const C = (await modules[id]()).default as unknown as (p: { bundle: Bundle; reducedMotion: boolean }) => JSX.Element;
  return renderToString(createElement(MemoryRouter, null, createElement(Suspense, { fallback: null }, createElement(C, { bundle, reducedMotion }))));
}

describe("every explainer renders", () => {
  const cases: [string, () => Bundle][] = [
    ["shipped bundle", () => b],
    ["with a fully-null model", () => ({ ...b, n_models: b.models.length + 1, models: [...b.models, nullModel] })],
    ["with optional blocks stripped", stripped],
  ];
  for (const id of EXPLAINER_IDS) {
    for (const [name, mk] of cases) {
      for (const reduced of [false, true]) {
        it(`${id} · ${name} · ${reduced ? "reduced motion" : "motion"}`, async () => {
          const html = await render(id, mk(), reduced);
          expect(html.length).toBeGreaterThan(200);
          expect(html).not.toMatch(/NaN|undefined/);
        });
      }
    }
  }
  it("is registered for every id", async () => {
    const { registry } = await import("../explainers");
    for (const id of EXPLAINER_IDS) expect(registry[id]).toBeTruthy();
  });
});
