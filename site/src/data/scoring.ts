/**
 * Recompute sub-scores and the overall score from a fingerprint, exactly as docs/vh_truebase.py does.
 * sub = clip((x - bad) / (good - bad), 0, 1); calib uses min(gap, 0). Overall = mean of available sub-scores.
 */
import { RAMPS, SOURCES } from "./method";
import { SUB_KEYS, type SubKey } from "./types";

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
  subscores: Record<SubKey, { score: number | null; value: number | null; source: string | null }>;
  overall: number | null;
  nAvail: number;
}

export function subScore(key: SubKey, value: number | null, ramps: Ramps = RAMPS): number | null {
  if (value === null) return null;
  const [good, bad] = ramps[key];
  return ramp(key === "calib" ? Math.min(value, 0) : value, good, bad);
}

export function recompute(fingerprint: Record<string, unknown> | null | undefined, ramps: Ramps = RAMPS): Recomputed {
  const subscores = {} as Recomputed["subscores"];
  for (const k of SUB_KEYS) {
    const { value, source } = pick(fingerprint, SOURCES[k]);
    subscores[k] = { score: subScore(k, value, ramps), value, source };
  }
  const avail = SUB_KEYS.map((k) => subscores[k].score).filter(isNum);
  let sum = 0;
  for (const a of avail) sum += a;
  return { subscores, overall: avail.length ? sum / avail.length : null, nAvail: avail.length };
}

/** Mean of the sub-scores as stored in the bundle (what the arithmetic line shows). */
export function meanOfStored(subs: Record<SubKey, { score: number | null } | null>): { mean: number | null; parts: (number | null)[]; n: number } {
  const parts = SUB_KEYS.map((k) => (subs[k] && isNum(subs[k]!.score) ? (subs[k]!.score as number) : null));
  const avail = parts.filter(isNum);
  let sum = 0;
  for (const a of avail) sum += a;
  return { mean: avail.length ? sum / avail.length : null, parts, n: avail.length };
}
