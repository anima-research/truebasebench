import { describe, expect, it } from "vitest";
import { allFindings } from "../findings";
import { readBundle } from "./helpers";

const b = readBundle("bench_v1.json");
const F = allFindings(b);
const r3 = (x: number | null | undefined) => (x === null || x === undefined ? null : Math.round(x * 1000) / 1000);

describe("findings predicates on bench_v1", () => {
  it("every check holds", () => {
    const failed = Object.entries(F).flatMap(([f, v]) =>
      Object.entries(v.checks)
        .filter(([, c]) => !c.ok)
        .map(([k, c]) => `${f}.${k}: ${c.note}`),
    );
    expect(failed).toEqual([]);
  });

  it("computed ranges (snapshot; review drift when a bundle changes)", () => {
    const snap = {
      f1: {
        band: r3(F.f1.band?.band),
        family: F.f1.family,
        steps: F.f1.steps.map((m) => [m.label, r3(m.fingerprint?.F_calib_gap)]),
      },
      f2: {
        memo: F.f2.memo?.map((m) => m.id),
        priorRange: F.f2.priorRange?.map(r3),
      },
      f3: { student: F.f3.student?.id, otherBaseMin: F.f3.otherBaseMin?.model.id, postMax: F.f3.postMax?.model.id },
      f4: { specimen: F.f4.specimen?.id, postRepMedian: r3(F.f4.postRepMedian) },
      f5: { cleanRange: F.f5.cleanRange?.map(r3), B: F.f5.B?.id, sharpen: F.f5.sharpenPairs.length },
      f6: {
        pairs: F.f6.pairs.length,
        rateRange: F.f6.rateRange?.map(r3),
        rateExceptions: F.f6.rateExceptions.map((p) => p.post.id),
        gapRange: F.f6.gapRange?.map(r3),
        gapExceptions: F.f6.gapExceptions.map((p) => p.post.id),
        baseHiMedian: r3(F.f6.baseHiMedian),
        baseHiExceptions: F.f6.baseHiExceptions.map((x) => x.model.id),
      },
    };
    expect(snap).toMatchSnapshot();
  });

  it("names the exceptions DESIGN §7.4 calls out", () => {
    expect(F.f6.gapExceptions.map((p) => p.post.id)).toContain("Llama-3.1-70B-Instruct-new");
    expect(F.f6.gapExceptions.map((p) => p.post.id)).toContain("Trinity-Large-Preview");
  });
});
