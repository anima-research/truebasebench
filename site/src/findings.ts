/**
 * Findings F1–F6 (DESIGN §7.4): every claim is computed from the bundle and has a predicate.
 * If a predicate fails, the page shows a Data note saying what no longer holds. Pure functions: tested in
 * src/test/findings.test.ts (snapshot of computed ranges).
 */
import { fp, get } from "./data/bundle";
import { basePairFor, collapseSpecimen, ladder, median, memoTriple, memoValue, preAnnealBand, specimenFamily, specimenPair } from "./data/derive";
import { SURNAME_FRAMES } from "./data/method";
import type { Bundle, Model } from "./data/types";

/** Definitions used by the checks (not measurements). */
export const FINDING_DEFS = {
  /** SPEC: pre-anneal checkpoints sit within ±0.02 of 0 */
  PRE_BAND_MAX: 0.02,
  /** tolerance for non-monotone steps inside one stage (OLMo-2 anneal rungs) */
  STAGE_TOL: 0.005,
  /** a base counts as "clean" for the surname range when its overall score is at least this */
  CLEAN_BASE_MIN_OVERALL: 0.85,
  /** a post-trained rung supports F6 (gap) when gap_hiH falls by more than this vs its base pair, nats */
  F6_GAP_SUPPORT: 0.25,
  /** a post-trained rung supports F6 (rate) when the s>10 rate rises by at least this fraction */
  F6_RATE_SUPPORT: 0.25,
  /** a base counts as ≈ 0 on gap_hiH within this many nats */
  BASE_HIH_ZERO: 0.15,
};

export interface Check {
  ok: boolean;
  /** what no longer holds, when !ok */
  note: string;
}

const num = (x: number | null | undefined): x is number => typeof x === "number" && Number.isFinite(x);

// ---------- F1 calibration ladder ----------
export interface F1 {
  band: { band: number; model: Model } | null;
  family: string | null;
  /** last rung of each stage, post-trained rungs individually, in order */
  steps: Model[];
  checks: { band: Check; monotone: Check; domains: Check };
  preDomainMin: { model: Model; value: number }[];
}

/** Last rung of each pre/anneal/base stage, plus every post-trained rung (SFT → DPO → RLVR are separate steps). */
export function stageSteps(rungs: Model[]): Model[] {
  const out: Model[] = [];
  rungs.forEach((r, i) => {
    const next = rungs[i + 1];
    if (r.stage === "post-trained" || !next || next.stage !== r.stage) out.push(r);
  });
  return out;
}

export function f1(b: Bundle): F1 {
  const band = preAnnealBand(b);
  const family = specimenFamily(b);
  const rungs = family ? ladder(b, family) : [];
  const steps = stageSteps(rungs);
  const g = (m: Model) => fp(m, "F_calib_gap");
  const bandOk = !!band && band.band <= FINDING_DEFS.PRE_BAND_MAX;
  // monotone across stage steps; inside a stage allow STAGE_TOL rises
  const bad: string[] = [];
  for (let i = 1; i < steps.length; i++) {
    const a = g(steps[i - 1]);
    const c = g(steps[i]);
    if (num(a) && num(c) && c > a) bad.push(`${steps[i - 1].label} → ${steps[i].label}`);
  }
  for (let i = 1; i < rungs.length; i++) {
    if (rungs[i].stage !== rungs[i - 1].stage || rungs[i].stage === "post-trained") continue;
    const a = g(rungs[i - 1]);
    const c = g(rungs[i]);
    if (num(a) && num(c) && c - a > FINDING_DEFS.STAGE_TOL) bad.push(`${rungs[i - 1].label} → ${rungs[i].label} (inside a stage)`);
  }
  const pres = b.models.filter((m) => m.stage === "pre-anneal");
  const preDomainMin = pres.map((m) => ({ model: m, value: fp(m, "F_gap_domain_min") })).filter((x): x is { model: Model; value: number } => num(x.value));
  const domBad = preDomainMin.filter((x) => x.value < -FINDING_DEFS.PRE_BAND_MAX);
  return {
    band,
    family,
    steps,
    preDomainMin,
    checks: {
      band: {
        ok: bandOk,
        note: band
          ? `the widest pre-anneal gap (${band.model.label}) exceeds ±${FINDING_DEFS.PRE_BAND_MAX} nats`
          : "no pre-anneal checkpoint with a post-cutoff gap in this bundle",
      },
      monotone: {
        ok: steps.length > 1 && bad.length === 0,
        note: steps.length > 1 ? `the gap does not fall monotonically along ${family}: ${bad.join("; ")}` : "no ladder with both pre-anneal and post-trained rungs",
      },
      domains: {
        ok: domBad.length === 0,
        note: `a pre-anneal checkpoint has a post-cutoff domain gap below −${FINDING_DEFS.PRE_BAND_MAX}: ${domBad.map((x) => x.model.label).join(", ")}`,
      },
    },
  };
}

// ---------- F2 annealed is not one thing ----------
export interface F2 {
  memo: Model[] | null; // last pre-anneal, first annealed, next post
  priorFamily: string | null;
  priorPre: Model | null;
  priorAnneal: Model[];
  priorRange: [number, number] | null;
  checks: { memo: Check; prior: Check; different: Check };
}

export function f2(b: Bundle): F2 {
  const memo = memoTriple(b);
  const fam = specimenFamily(b);
  const rungs = fam ? ladder(b, fam) : [];
  const pre = rungs.find((r) => r.stage === "pre-anneal") ?? null;
  const ann = rungs.filter((r) => r.stage === "anneal" || r.stage === "base");
  const rates = ann.map((r) => fp(r, "roll_instr_marker_rate")).filter(num);
  const priorRange: [number, number] | null = rates.length ? [Math.min(...rates), Math.max(...rates)] : null;
  const memoRise = memo && memo.length >= 2 ? (memoValue(memo[1]) ?? 0) - (memoValue(memo[0]) ?? 0) : 0;
  const memoPriorShift = memo && memo.length >= 2 ? Math.abs((fp(memo[1], "roll_instr_marker_rate") ?? 0) - (fp(memo[0], "roll_instr_marker_rate") ?? 0)) : 1;
  const preRate = pre ? fp(pre, "roll_instr_marker_rate") : null;
  const priorRise = priorRange && num(preRate) ? priorRange[0] - preRate : 0;
  const memoShiftPriorFam = pre && ann.length ? Math.max(...ann.map((r) => Math.abs((memoValue(r) ?? 0) - (memoValue(pre) ?? 0)))) : 1;
  return {
    memo,
    priorFamily: fam,
    priorPre: pre,
    priorAnneal: ann,
    priorRange,
    checks: {
      memo: { ok: memoRise > 0.05, note: "no family’s anneal raises the Wikipedia verbatim share by more than 5 points" },
      prior: { ok: priorRise > 0.1, note: `the ${fam ?? "specimen"} anneal does not raise the instruction-marker rate by more than 10 points on every annealed rung` },
      different: {
        ok: memoPriorShift < 0.05 && memoShiftPriorFam < 0.02,
        note: "the two anneals no longer move different sub-scores (each moved the other’s feature too)",
      },
    },
  };
}

// ---------- F3 distillation ----------
export interface F3 {
  distilled: Model[];
  student: Model | null;
  studentPost: Model | null;
  otherBaseMin: { model: Model; value: number } | null;
  postMax: { model: Model; value: number } | null;
  checks: { looksPost: Check };
}

export function f3(b: Bundle): F3 {
  const distilled = b.models.filter((m) => m.stage === "base" && /distill/i.test(m.label));
  const student = distilled[0] ?? null;
  const g = (m: Model) => fp(m, "F_calib_gap");
  const others = b.models.filter((m) => (m.stage === "base" || m.stage === "anneal") && !distilled.includes(m) && num(g(m)));
  others.sort((x, y) => g(x)! - g(y)!);
  const posts = b.models.filter((m) => m.stage === "post-trained" && num(g(m))).sort((x, y) => g(y)! - g(x)!);
  const studentPost = student ? ladder(b, student.family).find((r) => r.order > student.order && r.stage === "post-trained") ?? null : null;
  const otherBaseMin = others[0] ? { model: others[0], value: g(others[0])! } : null;
  const postMax = posts[0] ? { model: posts[0], value: g(posts[0])! } : null;
  const sg = student ? g(student) : null;
  const ok = num(sg) && !!otherBaseMin && !!postMax && sg < otherBaseMin.value && sg <= postMax.value;
  return {
    distilled,
    student,
    studentPost,
    otherBaseMin,
    postMax,
    checks: {
      looksPost: {
        ok,
        note: student
          ? `${student.label} (${student.family}) is no longer below every other base and inside the post-trained range on F_calib_gap`
          : "no base checkpoint labelled as distilled in this bundle",
      },
    },
  };
}

// ---------- F4 collapse ----------
export interface F4 {
  specimen: Model | null;
  family: Model[];
  postRepMedian: number | null;
  checks: { notDiagnostic: Check };
}

export function f4(b: Bundle): F4 {
  const sp = collapseSpecimen(b);
  const fam = sp ? ladder(b, sp.family) : [];
  const postRep = b.models.filter((m) => m.stage === "post-trained").map((m) => fp(m, "roll_rep8_q4")).filter(num);
  const postRepMedian = median(postRep);
  const nextAnnealed = sp ? fam.find((r) => r.order > sp.order && r.stage !== "post-trained") : undefined;
  const r = (m?: Model) => (m ? fp(m, "roll_rep8_q4") : null);
  const ok = num(postRepMedian) && num(r(sp ?? undefined)) && r(sp!)! >= postRepMedian && (!nextAnnealed || (num(r(nextAnnealed)) && r(nextAnnealed)! >= postRepMedian));
  return {
    specimen: sp,
    family: fam,
    postRepMedian,
    checks: {
      notDiagnostic: {
        ok,
        note: "the pre-anneal and annealed collapse specimens no longer repeat at least as much as the median post-trained checkpoint",
      },
    },
  };
}

// ---------- F5 surnames ----------
export interface F5 {
  cleanRange: [number, number] | null;
  clean: Model[];
  B: Model | null;
  allDescAboveCensus: boolean;
  nWithSurnames: number;
  sharpenPairs: { base: Model; post: Model }[];
  checks: { genre: Check; clean: Check; thinned: Check };
}

export function f5(b: Bundle): F5 {
  const ms = b.models.filter((m) => m.surnames && num(m.surnames.KL_few));
  const clean = ms.filter((m) => m.stage === "pre-anneal" || (m.stage === "base" && (m.score ?? 0) >= FINDING_DEFS.CLEAN_BASE_MIN_OVERALL));
  const kl = clean.map((m) => m.surnames!.KL_few as number);
  const cleanRange: [number, number] | null = kl.length ? [Math.min(...kl), Math.max(...kl)] : null;
  const B = specimenPair(b)?.B ?? null;
  const descOk = b.models.filter((m) => m.surnames && num(m.surnames.top10_desc) && num(m.surnames.top10_r));
  const allDescAboveCensus = descOk.length > 0 && descOk.every((m) => (m.surnames!.top10_desc as number) > (m.surnames!.top10_r as number));
  const pairs = b.models
    .filter((m) => m.stage === "post-trained" && m.surnames)
    .map((p) => ({ post: p, base: basePairFor(b, p) }))
    .filter((x): x is { base: Model; post: Model } => !!x.base && !!x.base.surnames);
  const sharpen = pairs.filter((x) => num(x.post.surnames!.top10_desc) && num(x.base.surnames!.top10_desc) && x.post.surnames!.top10_desc! > x.base.surnames!.top10_desc!);
  const bKL = B?.surnames?.KL_few;
  return {
    cleanRange,
    clean,
    B,
    allDescAboveCensus,
    nWithSurnames: ms.length,
    sharpenPairs: sharpen,
    checks: {
      genre: { ok: allDescAboveCensus, note: "some checkpoint’s described-frame top-10 mass is not above the Census top-10 share" },
      clean: { ok: !!cleanRange && cleanRange[1] < 0.5, note: "a pre-anneal checkpoint or clean base has few-shot KL above 0.5" },
      thinned: {
        ok: num(bKL) && !!cleanRange && bKL > 2 * cleanRange[1],
        note: "the specimen post-trained checkpoint’s few-shot KL is no longer more than twice the clean range",
      },
    },
  };
}

export const FEW_FRAMES = SURNAME_FRAMES.few;

// ---------- F6 tail ----------
export interface TailPair {
  base: Model;
  post: Model;
  rateBase: number;
  ratePost: number;
  rise: number; // ratePost / rateBase − 1
  hiBase: number | null;
  hiPost: number | null;
  hiDelta: number | null; // post − base
}

export interface F6 {
  pairs: TailPair[];
  rateSupport: TailPair[];
  rateExceptions: TailPair[];
  rateRange: [number, number] | null;
  gapSupport: TailPair[];
  gapExceptions: TailPair[];
  gapRange: [number, number] | null; // magnitudes of the fall, nats
  baseHiMedian: number | null;
  baseHiExceptions: { model: Model; value: number }[];
  checks: { rate: Check; gap: Check; bases: Check };
}

export function f6(b: Bundle): F6 {
  const pairs: TailPair[] = [];
  for (const post of b.models.filter((m) => m.stage === "post-trained")) {
    const base = basePairFor(b, post);
    if (!base) continue;
    const rb = get(base, ["tail", "tf_fresh", "s>10"]);
    const rp = get(post, ["tail", "tf_fresh", "s>10"]);
    if (!num(rb) || !num(rp) || rb <= 0) continue;
    const hb = get(base, "tail.tf_fresh.gap_hiH");
    const hp = get(post, "tail.tf_fresh.gap_hiH");
    pairs.push({ base, post, rateBase: rb, ratePost: rp, rise: rp / rb - 1, hiBase: hb, hiPost: hp, hiDelta: num(hb) && num(hp) ? hp - hb : null });
  }
  const rateSupport = pairs.filter((p) => p.rise >= FINDING_DEFS.F6_RATE_SUPPORT);
  const rateExceptions = pairs.filter((p) => p.rise < FINDING_DEFS.F6_RATE_SUPPORT);
  const rr = rateSupport.map((p) => p.rise);
  const gapSupport = pairs.filter((p) => num(p.hiDelta) && p.hiDelta < -FINDING_DEFS.F6_GAP_SUPPORT);
  const gapExceptions = pairs.filter((p) => !(num(p.hiDelta) && p.hiDelta < -FINDING_DEFS.F6_GAP_SUPPORT));
  const gr = gapSupport.map((p) => -p.hiDelta!);
  const bases = b.models.filter((m) => m.stage === "base" || m.stage === "pre-anneal" || m.stage === "anneal");
  const bh = bases.map((m) => ({ model: m, value: get(m, "tail.tf_fresh.gap_hiH") })).filter((x): x is { model: Model; value: number } => num(x.value));
  const baseHiExceptions = bh.filter((x) => Math.abs(x.value) > FINDING_DEFS.BASE_HIH_ZERO);
  return {
    pairs,
    rateSupport,
    rateExceptions,
    rateRange: rr.length ? [Math.min(...rr), Math.max(...rr)] : null,
    gapSupport,
    gapExceptions,
    gapRange: gr.length ? [Math.min(...gr), Math.max(...gr)] : null,
    baseHiMedian: median(bh.map((x) => x.value)),
    baseHiExceptions,
    checks: {
      rate: { ok: pairs.length > 0 && rateSupport.length >= pairs.length / 2, note: "fewer than half of the base → post-trained pairs raise the s > 10 rate by 25% or more" },
      gap: { ok: pairs.length > 0 && gapSupport.length >= pairs.length / 2, note: "fewer than half of the pairs become over-confident at H > 4 by more than 0.25 nats" },
      bases: {
        ok: bh.length > 0 && baseHiExceptions.length <= Math.max(1, Math.floor(bh.length / 5)),
        note: "more than a fifth of pre-anneal, anneal and base checkpoints sit away from 0 at H > 4",
      },
    },
  };
}

export function allFindings(b: Bundle) {
  return { f1: f1(b), f2: f2(b), f3: f3(b), f4: f4(b), f5: f5(b), f6: f6(b) };
}
