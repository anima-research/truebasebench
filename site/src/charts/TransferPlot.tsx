import { RAMPS, SUB_META } from "../data/method";
import { subScore } from "../data/scoring";
import type { Model, SubKey } from "../data/types";
import { GlyphShape } from "../components/Glyph";
import { fmt, fmtNum, isNum } from "../lib/numfmt";
import { clampLabel, linear, niceTicks, textWidth } from "../lib/scale";

function fmtFeature(k: SubKey, v: number | null): string {
  if (SUB_META[k].unit === "share") return fmt(v, "pct");
  return k === "calib" ? fmt(v, "gap") : fmt(v, "nats");
}
function tickFmt(k: SubKey, v: number): string {
  if (SUB_META[k].unit === "share") return `${+(v * 100).toFixed(1)}%`;
  return fmtNum(v, k === "calib" ? "signed" : "num3").replace(/^\+0\.000$/, "0").replace(/0+$/, "").replace(/\.$/, "");
}

/**
 * Transfer-function plot for one sub-score (DESIGN §7.2 M2 / §8 f): x = raw feature in its unit, y = sub-score.
 * The ramp is a 1.5px --ink polyline, clipped zones are --track, anchors labelled. The model's value drops onto
 * the ramp and reads off to a bar on the right. Compare models are hollow glyphs on x.
 * Values far outside the anchor range are drawn at the edge with an "off axis" label rather than squashing the ramp.
 */
export function TransferPlot({
  k,
  model,
  compare = [],
  width = 260,
  height = 72,
}: {
  k: SubKey;
  model: Model;
  compare?: Model[];
  width?: number;
  height?: number;
}) {
  const [good, bad] = RAMPS[k];
  const sub = model.subscores?.[k] ?? null;
  const value = sub?.value ?? null;
  const score = sub?.score ?? null;
  const lo0 = Math.min(good, bad);
  const hi0 = Math.max(good, bad);
  const span = hi0 - lo0;
  let lo = lo0 - span * 0.35;
  let hi = hi0 + span * 0.35;
  if (k === "memo" || k === "prior" || k === "spread") lo = Math.max(0, lo);
  const vals = [value, ...compare.map((c) => c.subscores?.[k]?.value ?? null)].filter(isNum);
  // extend to include values if the ramp still gets >= 30% of the axis; otherwise clip with off-axis markers
  for (const v of vals) {
    if (v < lo && (hi0 - lo0) / (hi - v) >= 0.3) lo = v - span * 0.05;
    if (v > hi && (hi0 - lo0) / (v - lo) >= 0.3) hi = v + span * 0.05;
  }
  const L = 34;
  const R = 54;
  const anyOff = [value, ...compare.map((c) => c.subscores?.[k]?.value ?? null)].some((v) => isNum(v) && (v < lo || v > hi));
  // an "off axis" note gets its own row above the plot rather than sitting on the ramp
  const T = anyOff ? 30 : 16;
  const B = 34;
  const pw = width - L - R;
  const ph = height;
  const x = linear([lo, hi], [L, L + pw]);
  const y = linear([0, 1], [T + ph, T]);
  const f = (v: number) => subScore(k, v) ?? 0;
  const xs = [lo, lo0, hi0, hi].sort((a, b) => a - b);
  const ramp = xs.map((v) => `${x(v)},${y(f(v))}`).join(" ");
  const clampX = (v: number) => Math.max(L, Math.min(L + pw, x(v)));
  const off = (v: number) => v < lo || v > hi;
  const ticks = niceTicks(lo, hi, 4);
  const totalH = T + ph + B;
  const barX = L + pw + 22;
  const label = `${SUB_META[k].name}: ${SUB_META[k].feature} = ${fmtFeature(k, value)} maps to sub-score ${fmtNum(score, "score")} (1 at ${tickFmt(
    k,
    good,
  )}, 0 at ${tickFmt(k, bad)}${k === "calib" ? ", positive gaps clipped to 1" : ""})`;
  // "0 at" sits above the flat-at-0 segment (left of the knee for calib, right of it otherwise), never on the slope
  const zeroText = `0 at ${tickFmt(k, bad)}`;
  const flatLeft = k === "calib";
  const room = flatLeft ? x(bad) - 4 - (L + 3) : L + pw - 3 - (x(bad) + 4);
  const zeroFits = room >= textWidth(zeroText);
  const zeroX = flatLeft ? (zeroFits ? x(bad) - 4 : L + 3) : zeroFits ? x(bad) + 4 : L + pw - 3;
  const zeroAnchor = flatLeft === zeroFits ? "end" : "start";
  const zeroSpan: [number, number] = zeroAnchor === "start" ? [zeroX, zeroX + textWidth(zeroText)] : [zeroX - textWidth(zeroText), zeroX];
  // a "clipped" note at score 0 shares the 0-anchor label's row: lift it a row when the two would overlap
  const clippedHitsZero = (cx: number) => cx + textWidth("clipped") / 2 + 4 > zeroSpan[0] && cx - textWidth("clipped") / 2 - 4 < zeroSpan[1];
  return (
    <svg width={width} height={totalH} role="img" aria-label={label}>
      {/* clipped zones */}
      <rect x={x(lo)} y={T} width={x(lo0) - x(lo)} height={ph} fill="var(--track)" />
      <rect x={x(hi0)} y={T} width={x(hi) - x(hi0)} height={ph} fill="var(--track)" />
      {/* axes */}
      <line x1={L} x2={L + pw} y1={T + ph} y2={T + ph} stroke="var(--rule-strong)" />
      <line x1={L} x2={L} y1={T} y2={T + ph} stroke="var(--rule-strong)" />
      {[0, 1].map((t) => (
        <text key={t} x={L - 5} y={y(t)} dy="0.32em" textAnchor="end">
          {t}
        </text>
      ))}
      {ticks.map((t) => (
        <g key={t} transform={`translate(${x(t)},${T + ph})`}>
          <line y2={3} stroke="var(--rule-strong)" />
          <text y={14} textAnchor="middle">
            {tickFmt(k, t)}
          </text>
        </g>
      ))}
      <text x={L} y={T + ph + 28} style={{ fill: "var(--ink-2)" }}>
        {SUB_META[k].feature}
        {SUB_META[k].unit === "nats" ? ", nats" : ", %"}
      </text>
      {/* ramp */}
      <polyline points={ramp} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
      {/* compare ghosts on x */}
      {compare.map((c) => {
        const v = c.subscores?.[k]?.value ?? null;
        if (!isNum(v)) return null;
        return (
          <g key={c.id}>
            <title>{`${c.label} (${c.family}): ${fmtFeature(k, v)}`}</title>
            <GlyphShape stage={c.stage} x={clampX(v)} y={T + ph} size={7} hollow />
          </g>
        );
      })}
      {/* drop + read-off */}
      {isNum(value) && isNum(score) && (
        <g>
          <line x1={clampX(value)} x2={clampX(value)} y1={T + ph} y2={y(score)} stroke="var(--ink-2)" strokeDasharray="2 2" />
          <line x1={clampX(value)} x2={barX} y1={y(score)} y2={y(score)} stroke="var(--ink-2)" strokeDasharray="2 2" />
          <circle cx={clampX(value)} cy={y(score)} r={2.5} fill="var(--ink)" />
          <GlyphShape stage={model.stage} x={clampX(value)} y={T + ph} size={8} />
          {off(value) && (
            <text x={value < lo ? L : L + pw} y={T - 18} textAnchor={value < lo ? "start" : "end"} style={{ fill: "var(--ink)" }}>
              {value < lo ? "← " : ""}
              {fmtFeature(k, value)} (off axis){value > hi ? " →" : ""}
            </text>
          )}
          {(subScore(k, value) === 0 || subScore(k, value) === 1) && !off(value) && (
            <text {...clampLabel(clampX(value), textWidth("clipped") / 2, L + 4, L + pw)} y={y(score) + (score > 0.5 ? 12 : clippedHitsZero(clampX(value)) ? -19 : -5)} className="halo" style={{ fontStyle: "italic" }}>
              clipped
            </text>
          )}
        </g>
      )}
      {/* sub-score bar */}
      <rect x={barX} y={T} width={8} height={ph} fill={isNum(score) ? "var(--track)" : "url(#hatch)"} />
      {isNum(score) && <rect x={barX} y={y(score)} width={8} height={T + ph - y(score)} fill="var(--bar)" />}
      <text x={barX + 12} y={isNum(score) ? y(score) : T + ph / 2} dy="0.32em" style={{ fill: "var(--ink)" }}>
        {fmtNum(score, "score")}
      </text>
      {/* anchor labels */}
      <text x={x(good)} y={T - 4} textAnchor={k === "calib" ? "end" : "start"} className="halo" style={{ fontSize: 11 }}>
        1 at {tickFmt(k, good)}
      </text>
      <text x={zeroX} y={T + ph - (zeroFits ? 5 : 17)} textAnchor={zeroAnchor} className="halo" style={{ fontSize: 11 }}>
        {zeroText}
      </text>
    </svg>
  );
}
