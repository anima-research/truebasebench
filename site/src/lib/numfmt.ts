/** The only number formatter (DESIGN §3.1). U+2212 minus, thin-space thousands. */

export type Fmt =
  | "score" // 3 decimals
  | "gap" // signed, 3 decimals, nats
  | "signed" // signed, 3 decimals, no unit
  | "nats" // unsigned, 3 decimals, nats
  | "nats1" // unsigned, 1 decimal, nats (rounded reference constants)
  | "kl" // 2 decimals
  | "pct" // percent, 1 decimal; 2 below 1%
  | "pctSigned" // signed percent change
  | "ratio" // ×1.9
  | "count" // thin-space thousands
  | "eff" // ≈ integer
  | "num3" // plain 3 decimals
  | "num2"
  | "raw"; // 5 significant figures

export const MINUS = "−";
export const THIN = " ";
export const DASH = "—";
export const NULL_TITLE = "not measured for this checkpoint";

const fix = (x: number, d: number) => {
  const s = x.toFixed(d);
  // avoid "-0.000"
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
};
const minus = (s: string) => s.replace(/^-/, MINUS);

export function isNum(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

/** Compact axis tick label: shortest decimal form, U+2212, optional leading "+". */
export function fmtTick(x: number, opts: { signed?: boolean; pct?: boolean } = {}): string {
  let v = opts.pct ? x * 100 : x;
  v = +v.toPrecision(10);
  let s = String(parseFloat(v.toFixed(6)));
  if (opts.pct) s += "%";
  if (v < 0) return MINUS + s.replace(/^-/, "");
  return opts.signed && v > 0 ? "+" + s : s;
}

export function fmtCount(x: number): string {
  const s = Math.round(Math.abs(x)).toString();
  const g = s.replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
  return (x < 0 ? MINUS : "") + g;
}

/** Format without unit. */
export function fmtNum(x: number | null | undefined, kind: Fmt): string {
  if (!isNum(x)) return DASH;
  switch (kind) {
    case "score":
    case "nats":
    case "num3":
      return minus(fix(x, 3));
    case "num2":
    case "kl":
      return minus(fix(x, 2));
    case "nats1":
      return minus(fix(x, 1));
    case "gap":
    case "signed": {
      const s = fix(x, 3);
      if (/^0\.0+$/.test(s)) return s;
      return x < 0 ? MINUS + s.replace(/^-/, "") : "+" + s;
    }
    case "pct": {
      const p = x * 100;
      const d = Math.abs(p) < 1 && p !== 0 ? 2 : 1;
      return minus(fix(p, d)) + "%";
    }
    case "pctSigned": {
      const p = x * 100;
      const s = fix(Math.abs(p), Math.abs(p) < 1 ? 1 : 0);
      return (p < 0 ? MINUS : "+") + s + "%";
    }
    case "ratio":
      return "×" + minus(x >= 10 ? fix(x, 0) : fix(x, 1));
    case "count":
      return fmtCount(x);
    case "eff":
      return "≈" + THIN + fmtCount(x);
    case "raw":
      return minus(sig5(x));
  }
}

export function unitOf(kind: Fmt): string {
  return kind === "gap" || kind === "nats" || kind === "nats1" ? "nats" : "";
}

/** Full text with unit (for titles, aria-labels). */
export function fmt(x: number | null | undefined, kind: Fmt): string {
  const s = fmtNum(x, kind);
  const u = unitOf(kind);
  return isNum(x) && u ? `${s} ${u}` : s;
}

export function sig5(x: number): string {
  if (x === 0) return "0";
  const a = Math.abs(x);
  if (a >= 1e6 || a < 1e-4) return x.toExponential(4);
  return String(parseFloat(x.toPrecision(5)));
}

/** Raw value as shown in provenance pop-outs: 5 significant figures, U+2212. */
export function fmtRaw(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "number") return Number.isFinite(v) ? minus(sig5(v)) : String(v);
  if (typeof v === "string") return JSON.stringify(v);
  return JSON.stringify(v).slice(0, 80);
}

/**
 * Comparator for possibly-missing numbers: missing values sort last in either direction (dir 1 ascending,
 * −1 descending) and two missing values are equal, so the sort never sees NaN.
 */
export function cmpNullsLast(a: number | null | undefined, b: number | null | undefined, dir: 1 | -1 = 1): number {
  const na = !isNum(a);
  const nb = !isNum(b);
  if (na && nb) return 0;
  if (na) return 1;
  if (nb) return -1;
  return dir * ((a as number) - (b as number));
}
