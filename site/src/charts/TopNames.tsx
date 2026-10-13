import type { Bundle, Model } from "../data/types";
import { path } from "../data/bundle";
import { SURNAME_FRAMES } from "../data/method";
import { ChartFrame, Mark, TipBody } from "../components/Chart";
import { GlyphShape } from "../components/Glyph";
import { fmt, isNum } from "../lib/numfmt";
import { linear, log10Scale } from "../lib/scale";

export interface TopNamesData {
  rows: { name: string; census: number | null; few: number | null; desc: number | null; other: number | null }[];
  hasCensus: boolean;
  stage: Model["stage"];
  caption: string;
  sources: string[];
}

function meanP(maps: Record<string, number>[], name: string): number | null {
  const ps = maps.map((m) => m[name]).filter(isNum).map((lp) => Math.exp(lp));
  return ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : null;
}

/**
 * Normalise per-name data from either surnames.top_names [{name, p_census, p_desc, p_few}] or
 * surnames.logp_top50 (flat {name: logp} or keyed by frame). Census probabilities come from top_names,
 * or from reference.census_top ([[name, count]...] or {name: p}) when present.
 */
export function topNamesOf(model: Model, bundle: Bundle): TopNamesData | null {
  const s = model.surnames;
  if (!s) return null;
  if (Array.isArray(s.top_names) && s.top_names.length) {
    const rows = s.top_names.slice(0, 30).map((t) => ({ name: t.name, census: t.p_census ?? null, few: t.p_few ?? null, desc: t.p_desc ?? null, other: null }));
    return {
      rows,
      hasCensus: rows.some((r) => isNum(r.census)),
      stage: model.stage,
      caption: "Probability of each of the top Census surnames as the next list item. Census is the line; few-shot filled, described hollow.",
      sources: [path(model, "surnames.top_names")],
    };
  }
  const lp = s.logp_top50;
  if (!lp || typeof lp !== "object") return null;
  const vals = Object.values(lp);
  const keyed = vals.length > 0 && typeof vals[0] === "object";
  let census: Record<string, number> = {};
  const ref = (bundle.reference as Record<string, unknown>).census_top;
  if (Array.isArray(ref)) {
    const total = (ref as [string, number][]).reduce((a, [, c]) => a + c, 0);
    census = Object.fromEntries((ref as [string, number][]).map(([n, c]) => [n, c / total]));
  } else if (ref && typeof ref === "object") census = ref as Record<string, number>;
  const hasCensus = Object.keys(census).length > 0;
  let rows: TopNamesData["rows"];
  if (keyed) {
    const by = lp as Record<string, Record<string, number>>;
    const few = SURNAME_FRAMES.few.filter((f) => by[f]).map((f) => by[f]);
    const desc = SURNAME_FRAMES.desc.filter((f) => by[f]).map((f) => by[f]);
    const names = Array.from(new Set(Object.values(by).flatMap((m) => Object.keys(m))));
    rows = names.map((n) => ({ name: n, census: census[n] ?? null, few: meanP(few, n), desc: meanP(desc, n), other: null }));
  } else {
    const flat = lp as Record<string, number>;
    rows = Object.keys(flat).map((n) => ({ name: n, census: census[n] ?? null, few: null, desc: null, other: isNum(flat[n]) ? Math.exp(flat[n]) : null }));
  }
  const key = (r: TopNamesData["rows"][number]) => (hasCensus ? r.census : r.few ?? r.other ?? r.desc) ?? -1;
  rows.sort((a, b) => key(b) - key(a));
  rows = rows.slice(0, 30);
  return {
    rows,
    hasCensus,
    stage: model.stage,
    caption: hasCensus
      ? "Probability of each top surname under the model (mean over frames) against its Census share. Census is the line; few-shot filled, described hollow."
      : "Probability of the model’s 30 most likely surnames (mean over frames). Census per-name shares are not in this bundle, so no Census line is drawn.",
    sources: [path(model, "surnames.logp_top50")].concat(hasCensus ? ["reference.census_top"] : []),
  };
}

export function TopNamesChart({ data }: { data: TopNamesData }) {
  const all = data.rows.flatMap((r) => [r.census, r.few, r.desc, r.other]).filter((v): v is number => isNum(v) && v > 0);
  const lo = 10 ** Math.floor(Math.log10(Math.min(...all)));
  const hi = 10 ** Math.ceil(Math.log10(Math.max(...all)));
  return (
    <ChartFrame ariaLabel={`Top surnames: ` + data.rows.map((r) => `${r.name} ${fmt(r.few ?? r.other, "pct")}`).join(", ")}>
      {(w) => {
        const L = 46;
        const B = 70;
        const H = 240;
        const x = linear([0, Math.max(1, data.rows.length - 1)], [L + 6, w - 10]);
        const y = log10Scale([lo, hi], [H, 10]);
        const line = data.rows.filter((r) => isNum(r.census)).map((r) => `${x(data.rows.indexOf(r))},${y(r.census!)}`);
        return (
          <svg width={w} height={H + B}>
            {y.ticks().map((t) => (
              <g key={t}>
                <line x1={L} x2={w - 10} y1={y(t)} y2={y(t)} stroke="var(--rule)" />
                <text x={L - 6} y={y(t)} dy="0.32em" textAnchor="end">
                  {t >= 0.01 ? `${+(t * 100).toPrecision(2)}%` : `10${sup(Math.round(Math.log10(t)))}`}
                </text>
              </g>
            ))}
            <text x={L - 40} y={4} style={{ fill: "var(--ink-2)" }}>
              probability (log scale)
            </text>
            {line.length > 1 && <polyline points={line.join(" ")} fill="none" stroke="var(--ink)" strokeWidth={1} />}
            {data.rows.map((r, i) => (
              <g key={r.name}>
                <text transform={`translate(${x(i)},${H + 8}) rotate(60)`} style={{ fontFamily: "var(--f-mono)", fontSize: 11 }}>
                  {r.name}
                </text>
                {(["few", "desc", "other"] as const).map((k) =>
                  isNum(r[k]) ? (
                    <Mark key={k} x={x(i)} y={y(r[k]!)} label={`${r.name}, ${k}: ${fmt(r[k], "pct")}`} tip={<TipBody title={r.name} lines={[`${k === "other" ? "model" : k}: ${fmt(r[k], "pct")}`, `Census: ${fmt(r.census, "pct")}`]} />}>
                      <GlyphShape stage={data.stage} x={x(i)} y={y(r[k]!)} size={7} hollow={k === "desc"} />
                    </Mark>
                  ) : null,
                )}
              </g>
            ))}
            <text x={w - 10} y={H + B - 2} textAnchor="end" style={{ fill: "var(--ink-2)" }}>
              {data.hasCensus ? "surname, by Census rank" : "surname, by model probability"}
            </text>
          </svg>
        );
      }}
    </ChartFrame>
  );
}

function sup(n: number): string {
  const m: Record<string, string> = { "-": "⁻", "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹" };
  return String(n)
    .split("")
    .map((c) => m[c] ?? c)
    .join("");
}
