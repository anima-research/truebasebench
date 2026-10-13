import { describe, expect, it } from "vitest";
import {
  basePairFor,
  collapseSpecimen,
  defaultCompare,
  domainName,
  ladderColumns,
  ladder,
  memoTriple,
  params,
  preAnnealBand,
  rampSpecimen,
  ranked,
  recipeTrio,
  sameScorePair,
  sizeBucket,
  specimenFamily,
  specimenPair,
} from "../data/derive";
import { byId } from "../data/bundle";
import { readBundle } from "./helpers";

const b = readBundle("bench_v1.json");
const id = (x: { id: string } | null | undefined) => x?.id ?? null;

describe("computed specimens (DESIGN §6.4) on bench_v1", () => {
  it("specimen family and A/B", () => {
    expect(specimenFamily(b)).toBe("OLMo-2 7B");
    const sp = specimenPair(b)!;
    expect(sp.A.id).toBe("olmo2-7b_stage1-2928B");
    expect(sp.B.id).toBe("olmo2-7b_instruct");
  });
  it("pre-anneal band ≈ ±0.016", () => {
    const band = preAnnealBand(b)!;
    expect(band.band).toBeCloseTo(0.0156, 3);
    expect(band.band).toBeLessThanOrEqual(0.02);
  });
  it("collapse specimen", () => expect(id(collapseSpecimen(b))).toBe("Trinity-Large-TrueBase"));
  it("memo triple", () => expect(memoTriple(b)!.map((m) => m.id)).toEqual(["Trinity-Large-TrueBase", "Trinity-Large-Base", "Trinity-Large-Preview"]));
  it("ramp specimen", () => expect(id(rampSpecimen(b))).toBe("Trinity-Large-Base"));
  it("same-score pair", () => {
    const p = sameScorePair(b)!;
    expect(new Set([p.a.id, p.b.id])).toEqual(new Set(["Trinity-Large-Base", "DeepSeek-V3"]));
    expect(p.l1).toBeCloseTo(1.62, 2);
  });
  it("recipe trio", () => expect(recipeTrio(b)!.map((m) => m.id)).toEqual(["olmo2-7b_stage1-2928B", "Llama-3.1-405B", "Qwen2.5-72B"]));
});

describe("ladders and pairs", () => {
  it("Llama 3.1 base rungs are parallel; OLMo anneal rungs are sequential", () => {
    const cols = ladderColumns(ladder(b, "Llama 3.1"));
    expect(cols.map((c) => c.map((m) => m.id))).toEqual([["Llama-3.1-405B", "Llama-3.1-70B"], ["Llama-3.1-70B-Instruct-new"]]);
    expect(ladderColumns(ladder(b, "OLMo-2 7B")).every((c) => c.length === 1)).toBe(true);
  });
  it("basePairFor", () => {
    expect(id(basePairFor(b, byId(b, "cogito-671b-v2.1")!))).toBe("DeepSeek-V3-Base");
    expect(id(basePairFor(b, byId(b, "DeepSeek-V3")!))).toBe("DeepSeek-V3-Base");
    expect(id(basePairFor(b, byId(b, "Llama-3.1-70B-Instruct-new")!))).toBe("Llama-3.1-70B");
    expect(id(basePairFor(b, byId(b, "olmo2-7b_dpo")!))).toBe("olmo2-7b_main");
  });
  it("default compare sibling", () => {
    expect(id(defaultCompare(b, byId(b, "olmo2-7b_instruct")!))).toBe("olmo2-7b_main");
    expect(id(defaultCompare(b, byId(b, "Trinity-Large-TrueBase")!))).toBe("Trinity-Large-Base");
  });
  it("ranked ties judged on displayed value", () => {
    const r = ranked(b);
    const dpo = r.find((x) => x.model.id === "olmo2-7b_dpo")!;
    const inst = r.find((x) => x.model.id === "olmo2-7b_instruct")!;
    expect(dpo.rank).toBe(inst.rank);
    expect(dpo.tie).toBe(true);
    expect(r[0].rank).toBe(1);
  });
});

describe("params()", () => {
  const P = (family: string, label: string) => params({ family, label, params: undefined });
  it("parses family strings", () => {
    expect(P("Trinity Large 398B-A13B", "TrueBase (10T, pre-anneal)")).toEqual({ total_b: 398, active_b: 13 });
    expect(P("Kimi K2 1T-A32B", "Base")).toEqual({ total_b: 1000, active_b: 32 });
    expect(P("OLMo-2 7B", "stage 1 · 2.9T")).toEqual({ total_b: 7, active_b: null });
    expect(P("Qwen3 30B-A3B", "Base")).toEqual({ total_b: 30, active_b: 3 });
  });
  it("falls back to a B match on the label, never a T match", () => {
    expect(P("Llama 3.1", "405B base")).toEqual({ total_b: 405, active_b: null });
    expect(P("Llama 3.1", "70B Instruct")).toEqual({ total_b: 70, active_b: null });
    expect(P("Something", "stage 1 · 2.9T")).toEqual({ total_b: null, active_b: null });
    expect(P("Something", "Base (17T, annealed)")).toEqual({ total_b: null, active_b: null });
  });
  it("MiMo returns unknown", () => {
    expect(params(byId(b, "MiMo-V2.5-Base")!)).toEqual({ total_b: null, active_b: null });
    expect(sizeBucket(byId(b, "MiMo-V2.5-Base")!)).toBe("unknown");
  });
  it("prefers models[].params", () => {
    expect(params({ family: "X 7B", label: "", params: { total_b: 8.2, active_b: null } })).toEqual({ total_b: 8.2, active_b: null });
  });
});

describe("domainName", () => {
  it("maps truncated keys and leaves unknown keys raw", () => {
    expect(domainName("F_CE_ao3_englis")).toBe("AO3 (English)");
    expect(domainName("F_CE_github_mar")).toBe("GitHub (Markdown)");
    expect(domainName("F_CE_wikipedia_")).toBe("Wikipedia");
    expect(domainName("F_CE_something_new")).toBeNull();
  });
  it("every v1 F_CE_ key has a display name", () => {
    const keys = Object.keys(b.models[0].fingerprint ?? {}).filter((k) => k.startsWith("F_CE_"));
    expect(keys.length).toBe(14);
    for (const k of keys) expect(domainName(k), k).not.toBeNull();
  });
});
