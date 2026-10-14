import { describe, expect, it } from "vitest";
import { isScored, recompute, scoredKeys, scoreVersion, subScore } from "../data/scoring";
import { RAMPS, SCORE_V0_KEYS, SCORE_V1_KEYS } from "../data/method";
import { SUB_KEYS } from "../data/types";
import { bundleFiles, readBundle } from "./helpers";

const TOL = 1e-9; // stricter than the 1e-6 the contract allows

for (const file of bundleFiles()) {
  const b = readBundle(file);
  describe(`score recomputation from the fingerprint: ${file}`, () => {
    const scored = scoredKeys(b);
    it("scored keys follow reference.scored_subscores (v0: all four) and every row's flags agree", () => {
      expect(scored).toEqual(scoreVersion(b) >= 1 ? SCORE_V1_KEYS : SCORE_V0_KEYS);
      for (const m of b.models)
        for (const k of SUB_KEYS) {
          const s = m.subscores[k];
          if (s && s.scored !== undefined) expect(s.scored, `${m.id}.${k}.scored`).toBe(isScored(b, k));
        }
    });
    for (const m of b.models) {
      it(`${m.id}`, () => {
        const r = recompute(m.fingerprint, RAMPS, scored);
        if (m.score === null) expect(r.overall).toBeNull();
        else {
          expect(r.overall).not.toBeNull();
          expect(Math.abs(r.overall! - m.score)).toBeLessThanOrEqual(TOL);
        }
        for (const k of SUB_KEYS) {
          const stored = m.subscores[k];
          const got = r.subscores[k];
          if (!stored || stored.score === null) {
            expect(got.score).toBeNull();
            continue;
          }
          expect(got.score).not.toBeNull();
          expect(Math.abs(got.score! - stored.score)).toBeLessThanOrEqual(TOL);
          expect(got.source).toBe(stored.source);
          if (stored.value !== null) expect(Math.abs(got.value! - stored.value)).toBeLessThanOrEqual(TOL);
        }
      });
    }
  });
}

describe("ramp behaviour", () => {
  it("clips calib positive gaps to 1 and saturates at the anchors", () => {
    expect(subScore("calib", 0.05)).toBe(1);
    expect(subScore("calib", -0.05)).toBeCloseTo(0.5, 12);
    expect(subScore("calib", -0.5)).toBe(0);
    expect(subScore("spread", 0.015)).toBe(1);
    expect(subScore("spread", 0.1)).toBe(0);
    expect(subScore("memo", 0.07)).toBeCloseTo(0.5, 12);
    expect(subScore("prior", 0.2)).toBeCloseTo(0.5, 12);
    expect(subScore("prior", null)).toBeNull();
  });
  it("falls back to the Pile features when post-cutoff ones are missing", () => {
    const r = recompute({ calib_gap: -0.02, calib_gap_domain_absmean: 0.05, verbatim_run_frac_wiki: 0.02, roll_instr_marker_rate: 0 });
    expect(r.subscores.calib.source).toBe("calib_gap");
    expect(r.subscores.spread.source).toBe("calib_gap_domain_absmean");
    expect(r.subscores.memo.source).toBe("verbatim_run_frac_wiki");
    expect(r.nAvail).toBe(4);
  });
  it("averages only the available sub-scores", () => {
    const r = recompute({ F_calib_gap: 0, F_gap_domain_absmean: 0.015, X_runfrac_wiki: 0.12 });
    expect(r.nAvail).toBe(3);
    expect(r.overall).toBeCloseTo(2 / 3, 12);
  });
  it("score v1 leaves memo out of the mean but still computes it", () => {
    const r = recompute({ F_calib_gap: 0, F_gap_domain_absmean: 0.015, X_runfrac_wiki: 0.12, roll_instr_marker_rate: 0.4 }, RAMPS, SCORE_V1_KEYS);
    expect(r.subscores.memo.score).toBe(0);
    expect(r.subscores.memo.scored).toBe(false);
    expect(r.subscores.calib.scored).toBe(true);
    expect(r.nAvail).toBe(3);
    expect(r.overall).toBeCloseTo(2 / 3, 12);
    expect(scoredKeys({ reference: {} })).toEqual(SCORE_V0_KEYS);
    expect(scoredKeys({ reference: { scored_subscores: ["prior", "calib"] } })).toEqual(["calib", "prior"]);
  });
});
