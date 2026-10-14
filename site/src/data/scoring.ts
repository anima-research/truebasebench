/**
 * Recompute sub-scores and the overall score from a fingerprint, exactly as docs/vh_truebase.py does.
 * sub = clip((x - bad) / (good - bad), 0, 1); calib uses min(gap, 0). Overall = mean of the available *scored*
 * sub-scores: all four under score v0 (bundles v1–v6), calib/spread/prior under score v1 (reference.scored_subscores).
 */
import { RAMPS, SCORE_V0_KEYS, SOURCES } from "./method";
import { SUB_KEYS, type Bundle, type Model, type SubKey } from "./types";

type RefOnly = Pick<Bundle, "reference"> | null | undefined;

/** The sub-scores that are terms of the overall in this bundle (reference.scored_subscores; v0 = all four). */
export function scoredKeys(bundle: RefOnly): SubKey[] {
  const list = bundle?.reference?.scored_subscores;
  if (Array.isArray(list) && list.length) return SUB_KEYS.filter((k) => list.includes(k));
  return SCORE_V0_KEYS;
}

export function isScored(bundle: RefOnly, k: SubKey): boolean {
  return scoredKeys(bundle).includes(k);
}

export function scoreVersion(bundle: RefOnly): number {
  const v = bundle?.reference?.score_version;
  return typeof v === "number" ? v : 0;
}

/** Per-row flag: subscores.<k>.scored, absent = scored (v0 rows). */
export function isScoredSub(m: Pick<Model, "subscores"> | null | undefined, k: SubKey): boolean {
  return m?.subscores?.[k]?.scored !== false;
}

/** The keys this row's overall is a mean of (its own flags; falls back to all four). */
export function scoredKeysOf(m: Pick<Model, "subscores"> | null | undefined): SubKey[] {
  return SUB_KEYS.filter((k) => isScoredSub(m, k));
}

export type Ramps = Record<SubKey, [number, number]>;

const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

export function ramp(x: number | null | undefined, good: number, bad: number): number | null {
  if (!isNum(x)) return null;
  const t = (x - bad) / (good - bad);
  return Math.max(0, Math.min(1, t));
}

export function pick(f: Record<string, unknown> | null | undefined, keys: string[]): { value: number | null; source: string | null } {
  if (!f) return { value: null, source: null };
  for (const k of keys) {
    const v = f[k];
    if (isNum(v)) return { value: v, source: k };
  }
  return { value: null, source: null };
}

export interface Recomputed {
  subscores: Record<SubKey, { score: number | null; value: number | null; source: string | null; scored: boolean }>;
  overall: number | null;
  /** available scored sub-scores (the denominator of the mean) */
  nAvail: number;
}

export function subScore(key: SubKey, value: number | null, ramps: Ramps = RAMPS): number | null {
  if (value === null) return null;
  const [good, bad] = ramps[key];
  return ramp(key === "calib" ? Math.min(value, 0) : value, good, bad);
}

export function recompute(fingerprint: Record<string, unknown> | null | undefined, ramps: Ramps = RAMPS, scored: SubKey[] = SCORE_V0_KEYS): Recomputed {
  const subscores = {} as Recomputed["subscores"];
  for (const k of SUB_KEYS) {
    const { value, source } = pick(fingerprint, SOURCES[k]);
    subscores[k] = { score: subScore(k, value, ramps), value, source, scored: scored.includes(k) };
  }
  const avail = scored.map((k) => subscores[k].score).filter(isNum);
  let sum = 0;
  for (const a of avail) sum += a;
  return { subscores, overall: avail.length ? sum / avail.length : null, nAvail: avail.length };
}

/** Mean of the scored sub-scores as stored in the bundle (what the arithmetic line shows); parts follow `keys`. */
export function meanOfStored(
  subs: Record<SubKey, { score: number | null; scored?: boolean } | null>,
  keys: SubKey[] = SUB_KEYS.filter((k) => subs[k]?.scored !== false),
): { mean: number | null; parts: (number | null)[]; n: number; keys: SubKey[] } {
  const parts = keys.map((k) => (subs[k] && isNum(subs[k]!.score) ? (subs[k]!.score as number) : null));
  const avail = parts.filter(isNum);
  let sum = 0;
  for (const a of avail) sum += a;
  return { mean: avail.length ? sum / avail.length : null, parts, n: avail.length, keys };
}
