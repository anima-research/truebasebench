/**
 * Bootstrap intervals (bundle v6 `ci` block). The bounds helper is shared by the model page, the findings charts
 * and their tooltips; `ciKind` prints how the interval was made so a tooltip can say "[lo, hi] 95% CI, 900 docs".
 */
import { fmtNum, isNum } from "../lib/numfmt";
import type { Model } from "./types";

/** [lo, hi] of the 95% interval (or frame range) for a ci entry, null when absent or incomplete. */
export function ciBounds(m: Model | null | undefined, key: string): [number, number] | null {
  const e = m?.ci?.[key];
  const iv = e?.ci95 ?? e?.range;
  if (!iv || typeof iv[0] !== "number" || typeof iv[1] !== "number" || !Number.isFinite(iv[0]) || !Number.isFinite(iv[1])) return null;
  return [iv[0], iv[1]];
}

/** "95% CI, 900 docs" / "range over 3 frames" (a frame range is not an interval) for a ci entry that has bounds; null otherwise. */
export function ciKind(m: Model | null | undefined, key: string): string | null {
  const e = m?.ci?.[key];
  if (!e || !ciBounds(m, key)) return null;
  const n = e.n_docs ?? e.n ?? e.n_frames;
  const unit = e.n_docs !== undefined ? "docs" : e.n_frames !== undefined ? "frames" : "samples";
  if (e.ci95) return `95% CI${isNum(n) ? `, ${fmtNum(n, "count")} ${unit}` : ""}`;
  return `range${isNum(n) ? ` over ${fmtNum(n, "count")} ${unit}` : ""}`;
}
