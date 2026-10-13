/** Derived helpers (DESIGN §6.3, §6.4). Everything is computed from the bundle; no ids are hardcoded. */
import { fp, get } from "./bundle";
import { RAMPS } from "./method";
import { STAGES, SUB_KEYS, type Bundle, type Model, type Stage, type SubKey } from "./types";

export const stageOrder: Stage[] = STAGES;
export const STAGE_CODE: Record<Stage, string> = { "pre-anneal": "PRE", anneal: "MID", base: "BASE", "post-trained": "POST" };
/** Human-readable stage names for legends and titles. */
export const STAGE_NAME: Record<Stage, string> = { "pre-anneal": "pre-anneal checkpoint", anneal: "mid-anneal checkpoint", base: "released base", "post-trained": "post-trained" };
export const stageIndex = (s: Stage) => stageOrder.indexOf(s);

/** Rungs of a family sorted by order. */
export function ladder(bundle: Bundle, family: string): Model[] {
  return bundle.models.filter((m) => m.family === family).sort((a, b) => a.order - b.order);
}

/** Group a ladder into columns: consecutive rungs with the same stage are parallel releases (DESIGN §6.3). */
export function ladderColumns(rungs: Model[]): Model[][] {
  const cols: Model[][] = [];
  for (const r of rungs) {
    const last = cols[cols.length - 1];
    if (last && last[0].stage === r.stage && r.stage !== "anneal" && r.stage !== "pre-anneal" && r.stage !== "post-trained") last.push(r);
    else cols.push([r]);
  }
  return cols;
}

export function familiesOf(bundle: Bundle): string[] {
  return Array.from(new Set(bundle.models.map((m) => m.family))).sort((a, b) => a.localeCompare(b));
}

export interface Params {
  total_b: number | null;
  active_b: number | null;
}

/** Parameter count from models[].params, else the family string, else a B-only match on the label. */
export function params(m: Pick<Model, "family" | "label" | "params">): Params {
  if (m.params && typeof m.params.total_b === "number")
    return { total_b: m.params.total_b, active_b: typeof m.params.active_b === "number" ? m.params.active_b : null };
  const re = /(\d+(?:\.\d+)?)([BT])(?:-A(\d+(?:\.\d+)?)B)?/;
  const f = re.exec(m.family);
  if (f) {
    const total = parseFloat(f[1]) * (f[2] === "T" ? 1000 : 1);
    return { total_b: total, active_b: f[3] ? parseFloat(f[3]) : null };
  }
  const l = re.exec(m.label);
  if (l && l[2] === "B") return { total_b: parseFloat(l[1]), active_b: l[3] ? parseFloat(l[3]) : null };
  return { total_b: null, active_b: null };
}

export function fmtParams(p: Params): string {
  if (p.total_b === null) return "—";
  const t = (x: number) => (x >= 1000 ? `${+(x / 1000).toFixed(2)}T` : `${+x.toFixed(1)}B`);
  return p.active_b !== null ? `${t(p.total_b)}·A${t(p.active_b)}` : t(p.total_b);
}

export type SizeBucket = "lt15" | "15to100" | "gt100" | "unknown";
export const SIZE_LABEL: Record<SizeBucket, string> = { lt15: "<15B", "15to100": "15–100B", gt100: ">100B", unknown: "unknown" };
export function sizeBucket(m: Model): SizeBucket {
  const t = params(m).total_b;
  if (t === null) return "unknown";
  return t < 15 ? "lt15" : t <= 100 ? "15to100" : "gt100";
}

const DOMAIN_NAMES: Record<string, string> = {
  ao3_englis: "AO3 (English)",
  ao3_noneng: "AO3 (non-English)",
  arxiv_cs: "arXiv (CS)",
  arxiv_math: "arXiv (math)",
  arxiv_othe: "arXiv (other)",
  arxiv_phys: "arXiv (physics)",
  bbc_news: "BBC News",
  biorxiv_al: "bioRxiv",
  github_cpp: "GitHub (C++)",
  github_jav: "GitHub (Java)",
  github_mar: "GitHub (Markdown)",
  github_oth: "GitHub (other)",
  github_pyt: "GitHub (Python)",
  wikipedia_: "Wikipedia",
};
/** Display name for a truncated domain key (F_CE_ao3_englis -> "AO3 (English)"); null if unknown. */
export function domainName(key: string): string | null {
  const k = key.replace(/^F_(CE|gap)_/, "");
  return DOMAIN_NAMES[k] ?? null;
}
export function domainKeys(m: Model, prefix = "F_CE_"): string[] {
  return Object.keys(m.fingerprint ?? {}).filter((k) => k.startsWith(prefix) && k !== prefix.replace(/_$/, ""));
}

/** Nearest preceding rung in the same family whose stage is not post-trained. */
export function basePairFor(bundle: Bundle, post: Model): Model | null {
  const rungs = ladder(bundle, post.family).filter((r) => r.order < post.order && r.stage !== "post-trained");
  return rungs.length ? rungs[rungs.length - 1] : null;
}

/** Default compare sibling (DESIGN §7.2): nearest preceding pre/base rung for post-trained, else next rung. */
export function defaultCompare(bundle: Bundle, m: Model): Model | null {
  const rungs = ladder(bundle, m.family);
  if (m.stage === "post-trained") {
    const prev = rungs.filter((r) => r.order < m.order && (r.stage === "pre-anneal" || r.stage === "base"));
    if (prev.length) return prev[prev.length - 1];
    return basePairFor(bundle, m);
  }
  const next = rungs.find((r) => r.order > m.order);
  if (next) return next;
  const prev = rungs.filter((r) => r.order < m.order);
  return prev.length ? prev[prev.length - 1] : null;
}

/** Ranked list by overall desc, ties by family then order. Rank ties judged on the displayed 3-dp value. */
export function ranked(bundle: Bundle): { model: Model; rank: number; tie: boolean }[] {
  const ms = [...bundle.models].sort(compareOverall);
  const disp = (m: Model) => (m.score === null ? null : m.score.toFixed(3));
  const out: { model: Model; rank: number; tie: boolean }[] = [];
  ms.forEach((m, i) => {
    const prev = out[i - 1];
    if (prev && disp(prev.model) === disp(m) && disp(m) !== null) {
      out.push({ model: m, rank: prev.rank, tie: true });
      prev.tie = true;
    } else out.push({ model: m, rank: i + 1, tie: false });
  });
  return out;
}

export function compareOverall(a: Model, b: Model): number {
  const sa = a.score ?? -Infinity;
  const sb = b.score ?? -Infinity;
  if (sb !== sa) return sb - sa;
  if (a.family !== b.family) return a.family.localeCompare(b.family);
  return a.order - b.order;
}

export function nAvailable(m: Model): number {
  return SUB_KEYS.filter((k) => typeof m.subscores?.[k]?.score === "number").length;
}

export function subScoreOf(m: Model, k: SubKey): number | null {
  return get(m, ["subscores", k, "score"]);
}

// ---------- computed specimens (§6.4) ----------

/** The family with the most rungs that has both a pre-anneal and a post-trained rung. */
export function specimenFamily(bundle: Bundle): string | null {
  const fams = familiesOf(bundle)
    .map((f) => ({ f, rungs: ladder(bundle, f) }))
    .filter(({ rungs }) => rungs.some((r) => r.stage === "pre-anneal") && rungs.some((r) => r.stage === "post-trained"))
    .sort((a, b) => b.rungs.length - a.rungs.length || a.f.localeCompare(b.f));
  return fams.length ? fams[0].f : null;
}

/** A = lowest-order pre-anneal rung of the family; B = its highest-order post-trained rung. */
export function specimenPair(bundle: Bundle, family = specimenFamily(bundle)): { A: Model; B: Model } | null {
  if (!family) return null;
  const rungs = ladder(bundle, family);
  const A = rungs.find((r) => r.stage === "pre-anneal");
  const posts = rungs.filter((r) => r.stage === "post-trained");
  if (!A || !posts.length) return null;
  return { A, B: posts[posts.length - 1] };
}

/** ± max |F_calib_gap| over pre-anneal models, with the model that sets it. */
export function preAnnealBand(bundle: Bundle): { band: number; model: Model } | null {
  let best: { band: number; model: Model } | null = null;
  for (const m of bundle.models) {
    if (m.stage !== "pre-anneal") continue;
    const g = fp(m, "F_calib_gap");
    if (g === null) continue;
    if (!best || Math.abs(g) > best.band) best = { band: Math.abs(g), model: m };
  }
  return best;
}

/** The pre-anneal model with the highest roll_frac_H<0.1. */
export function collapseSpecimen(bundle: Bundle): Model | null {
  const c = bundle.models.filter((m) => m.stage === "pre-anneal" && fp(m, "roll_frac_H<0.1") !== null);
  c.sort((a, b) => fp(b, "roll_frac_H<0.1")! - fp(a, "roll_frac_H<0.1")!);
  return c[0] ?? null;
}

export function memoValue(m: Model): number | null {
  return fp(m, "X_runfrac_wiki") ?? fp(m, "verbatim_run_frac_wiki");
}

/**
 * Among families with a pre-anneal rung: the (last pre-anneal rung -> first following non-post rung) pair with
 * the largest rise in X_runfrac_wiki, plus the next post-trained rung.
 */
export function memoTriple(bundle: Bundle): Model[] | null {
  let best: { rise: number; trio: Model[] } | null = null;
  for (const f of familiesOf(bundle)) {
    const rungs = ladder(bundle, f);
    const pres = rungs.filter((r) => r.stage === "pre-anneal");
    if (!pres.length) continue;
    const lastPre = pres[pres.length - 1];
    const next = rungs.find((r) => r.order > lastPre.order && r.stage !== "post-trained" && r.stage !== "pre-anneal");
    if (!next) continue;
    const a = memoValue(lastPre);
    const b = memoValue(next);
    if (a === null || b === null) continue;
    const post = rungs.find((r) => r.order > next.order && r.stage === "post-trained");
    const trio = post ? [lastPre, next, post] : [lastPre, next];
    if (!best || b - a > best.rise) best = { rise: b - a, trio };
  }
  return best?.trio ?? null;
}

/** The model with the most sub-scores strictly inside (0, 1); ties go to the overall closest to 0.5. */
export function rampSpecimen(bundle: Bundle): Model | null {
  const inside = (m: Model) => SUB_KEYS.filter((k) => {
    const s = subScoreOf(m, k);
    return s !== null && s > 0 && s < 1;
  }).length;
  const ms = bundle.models.filter((m) => m.score !== null);
  ms.sort((a, b) => inside(b) - inside(a) || Math.abs(a.score! - 0.5) - Math.abs(b.score! - 0.5) || a.id.localeCompare(b.id));
  return ms[0] ?? null;
}

/** Among pairs with |Δoverall| < 0.005, the pair with the largest L1 distance between sub-score vectors. */
export function sameScorePair(bundle: Bundle): { a: Model; b: Model; l1: number } | null {
  const ms = bundle.models.filter((m) => m.score !== null && nAvailable(m) === 4);
  let best: { a: Model; b: Model; l1: number } | null = null;
  for (let i = 0; i < ms.length; i++)
    for (let j = i + 1; j < ms.length; j++) {
      const a = ms[i];
      const b = ms[j];
      if (Math.abs(a.score! - b.score!) >= 0.005) continue;
      const l1 = SUB_KEYS.reduce((s, k) => s + Math.abs(subScoreOf(a, k)! - subScoreOf(b, k)!), 0);
      if (!best || l1 > best.l1) best = { a, b, l1 };
    }
  if (best && compareOverall(best.a, best.b) > 0) best = { a: best.b, b: best.a, l1: best.l1 };
  return best;
}

/** Fallback when no same-score pair: A, the base with lowest memo score, the base with lowest prior score. */
export function recipeTrio(bundle: Bundle): Model[] | null {
  const sp = specimenPair(bundle);
  const bases = bundle.models.filter((m) => m.stage === "base");
  // ties on the clipped score (several bases sit at 0) go to the raw value furthest past the 0-anchor
  const unclipped = (m: Model, k: SubKey) => {
    const v = get(m, ["subscores", k, "value"]);
    const [good, bad] = RAMPS[k];
    return v === null ? Infinity : (v - bad) / (good - bad);
  };
  const lowest = (k: SubKey) =>
    bases
      .filter((m) => subScoreOf(m, k) !== null)
      .sort((a, b) => subScoreOf(a, k)! - subScoreOf(b, k)! || unclipped(a, k) - unclipped(b, k))[0];
  const lm = lowest("memo");
  const lp = lowest("prior");
  if (!sp || !lm || !lp) return null;
  return [sp.A, lm, lp];
}

export function rangeOf(xs: (number | null)[]): [number, number] | null {
  const v = xs.filter((x): x is number => x !== null && Number.isFinite(x));
  if (!v.length) return null;
  return [Math.min(...v), Math.max(...v)];
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
