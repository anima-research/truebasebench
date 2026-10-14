/**
 * F6 · Plate F6a. Paired arrows of tail.tf_fresh.gap_hiH from each base pair (hollow) to its post-trained rung (filled)
 * on one linear axis, with the bases' zero band (±BASE_HIH_ZERO, printed as a Num), a 1.5px --zero line, the Δ at the
 * tip, tagged exception rows (--ink-3 arrow) and the base outliers appended as single-glyph rows.
 * Same idiom as charts/FindingCharts PairedArrows; local to F6 because of the extra rows and the band Num.
 */
import { XAxis, xTitleExtra } from "../../../components/Axis";
import { ChartFrame, Mark, TipBody } from "../../../components/Chart";
import { GlyphShape } from "../../../components/Glyph";
import { RangeBand, rowLabel, TagText, tipTitle } from "../../../charts/findings/common";
import { Num } from "../../../components/Num";
import { path } from "../../../data/bundle";
import { STAGE_CODE, STAGE_NAME } from "../../../data/derive";
import type { Model } from "../../../data/types";
import { fmt, fmtNum, fmtTick } from "../../../lib/numfmt";
import { linear, niceTicks, textWidth } from "../../../lib/scale";

export const HIH_KEY = "tail.tf_fresh.gap_hiH";
export const HIH_NAME = "gap at H > 4";
export const HIH_AXIS = "gap at H > 4 on post-cutoff text, mean(H − s), nats";

export interface HiHRow {
  base: Model;
  post: Model;
  vBase: number;
  vPost: number;
  /** post − base, nats */
  delta: number;
  tag?: string;
}

export interface HiHOutlier {
  model: Model;
  value: number;
  tag: string;
}

const href = (m: Model) => `/model/${encodeURIComponent(m.id)}`;
const stageLine = (m: Model) => `${STAGE_CODE[m.stage]} ${STAGE_NAME[m.stage]}`;

export function HiHArrows({
  rows,
  outliers,
  band,
}: {
  /** already sorted (largest fall first) */
  rows: HiHRow[];
  outliers: HiHOutlier[];
  /** the ± half-width of the bases' zero band, as a provenance-bearing number */
  band: { half: number; path: string; label: string; derived: string };
}) {
  const vals = [...rows.flatMap((r) => [r.vBase, r.vPost]), ...outliers.map((o) => o.value), -band.half, band.half, 0];
  const dom: [number, number] = [Math.min(...vals) - 0.05, Math.max(...vals) + 0.05];
  const among = [...rows.map((r) => r.post), ...outliers.map((o) => o.model)];
  const n = rows.length + outliers.length;
  const aria =
    `${HIH_AXIS}, base → post-trained: ` +
    rows.map((r) => `${r.post.family} ${r.post.label} ${fmt(r.vBase, "gap")} → ${fmt(r.vPost, "gap")}${r.tag ? ` (${r.tag})` : ""}`).join("; ") +
    (outliers.length ? "; " + outliers.map((o) => `${o.model.family} ${o.model.label} ${fmt(o.value, "gap")} (${o.tag})`).join("; ") : "");
  return (
    <ChartFrame ariaLabel={aria}>
      {(w) => {
        const L = Math.min(200, w * 0.42);
        const R = 52;
        const rh = 20;
        const T = 24; // strip above the rows for the band label (the Num's dotted underline needs 22px)
        const x = linear(dom, [L, w - R]);
        const rowsEnd = T + n * rh;
        const H = rowsEnd + 40 + xTitleExtra(HIH_AXIS, w - R - L);
        const labelMax = Math.floor(L / 6);
        /** the Δ (and tag) go right of the rightmost glyph; when that would run off the plot they go left of the leftmost one */
        const place = (lo: number, hi: number, delta: string, tag?: string) => {
          const dw = textWidth(delta);
          const tw = tag ? textWidth(tag) + 6 : 0;
          const fitsRight = hi + 8 + dw + tw <= w - 2;
          const fitsLeft = lo - 8 - dw - tw >= L;
          if (fitsRight || !fitsLeft) return { anchor: "start" as const, dx: hi + 8, tx: hi + 8 + dw + 6 };
          return { anchor: "end" as const, dx: lo - 8 - tw, tx: lo - 8 };
        };
        return (
          <svg width={w} height={H}>
            <RangeBand x={x(-band.half)} y={T} width={x(band.half) - x(-band.half)} height={rowsEnd - T} />
            {/* the band's half-width, printed as a live Num in the strip above the rows */}
            {(() => {
              // the label sits beside the band, clear of the zero line: right of the band when it fits inside the frame, else
              // right-aligned to the band's left edge, else (very narrow frames) inside the band from its left edge
              const lw = textWidth(`${band.label} ${fmtNum(band.half, "num2")}`, 11) + 16;
              const right = x(band.half) + 4;
              const left = x(-band.half) - 4 - lw;
              const fitsRight = right + lw <= w;
              const fitsLeft = left >= 0;
              const lx = fitsRight ? right : fitsLeft ? left : x(-band.half) + 2;
              return (
                <foreignObject x={lx} y={0} width={lw} height={T - 2}>
                  <span className="band-label" style={{ display: "block", textAlign: !fitsRight && fitsLeft ? "right" : "left" }}>
                    {band.label} <Num path={band.path} value={band.half} fmt="num2" derived={band.derived} />
                  </span>
                </foreignObject>
              );
            })()}
            {dom[0] < 0 && dom[1] > 0 && <line x1={x(0)} x2={x(0)} y1={0} y2={rowsEnd} stroke="var(--zero)" strokeWidth={1.5} />}
            {rows.map((r, i) => {
              const cy = T + i * rh + rh / 2;
              const x1 = x(r.vBase);
              const x2 = x(r.vPost);
              const sign = Math.sign(x2 - x1) || 1;
              const end = x2 - sign * 6;
              const head = Math.abs(end - x1) > 8;
              const d = fmtNum(r.delta, "signed");
              const p = place(Math.min(x1, x2), Math.max(x1, x2), d, r.tag);
              return (
                <g key={r.post.id}>
                  <text x={L - 8} y={cy} dy="0.32em" textAnchor="end" style={{ fill: "var(--ink-2)" }}>
                    {rowLabel(r.post, among, labelMax)}
                  </text>
                  <line
                    x1={x1 + sign * 4}
                    x2={head ? end : x2}
                    y1={cy}
                    y2={cy}
                    stroke={r.tag ? "var(--ink-3)" : "var(--ink)"}
                    markerEnd={head ? (r.tag ? "url(#arrow-3)" : "url(#arrow)") : undefined}
                  />
                  <Mark
                    x={x1}
                    y={cy}
                    href={href(r.base)}
                    label={`${r.base.label}, ${r.base.stage}: ${fmt(r.vBase, "gap")}`}
                    tip={<TipBody title={tipTitle(r.base)} lines={[stageLine(r.base), `${HIH_NAME} ${fmt(r.vBase, "gap")}`]} path={path(r.base, HIH_KEY)} />}
                  >
                    <GlyphShape stage={r.base.stage} x={x1} y={cy} size={7} hollow />
                  </Mark>
                  <Mark
                    x={x2}
                    y={cy}
                    href={href(r.post)}
                    label={`${r.post.label}, ${r.post.stage}: ${fmt(r.vPost, "gap")}, ${d} vs ${r.base.label}${r.tag ? `, ${r.tag}` : ""}`}
                    tip={
                      <TipBody
                        title={tipTitle(r.post)}
                        lines={[stageLine(r.post), `${HIH_NAME} ${fmt(r.vPost, "gap")}, base ${r.base.label} ${fmtNum(r.vBase, "signed")}, Δ ${d}`]}
                        path={path(r.post, HIH_KEY)}
                      />
                    }
                  >
                    <GlyphShape stage={r.post.stage} x={x2} y={cy} size={7} />
                  </Mark>
                  <text x={p.dx} y={cy} dy="0.32em" textAnchor={p.anchor} className="halo" style={{ fill: r.tag ? "var(--ink-2)" : "var(--ink)" }}>
                    {d}
                  </text>
                  {r.tag && (
                    <TagText x={p.tx} y={cy} anchor={p.anchor}>
                      {r.tag}
                    </TagText>
                  )}
                </g>
              );
            })}
            {outliers.map((o, j) => {
              const cy = T + (rows.length + j) * rh + rh / 2;
              const cx = x(o.value);
              const v = fmtNum(o.value, "signed");
              const p = place(cx, cx, v, o.tag);
              return (
                <g key={o.model.id}>
                  <text x={L - 8} y={cy} dy="0.32em" textAnchor="end" style={{ fill: "var(--ink-2)" }}>
                    {rowLabel(o.model, among, labelMax)}
                  </text>
                  <Mark
                    x={cx}
                    y={cy}
                    href={href(o.model)}
                    label={`${o.model.label}, ${o.model.stage}: ${fmt(o.value, "gap")}, ${o.tag}`}
                    tip={<TipBody title={tipTitle(o.model)} lines={[stageLine(o.model), `${HIH_NAME} ${fmt(o.value, "gap")}`]} path={path(o.model, HIH_KEY)} />}
                  >
                    <GlyphShape stage={o.model.stage} x={cx} y={cy} size={7} hollow />
                  </Mark>
                  <text x={p.dx} y={cy} dy="0.32em" textAnchor={p.anchor} className="halo" style={{ fill: "var(--ink-2)" }}>
                    {v}
                  </text>
                  <TagText x={p.tx} y={cy} anchor={p.anchor}>
                    {o.tag}
                  </TagText>
                </g>
              );
            })}
            <XAxis scale={x} y={rowsEnd + 2} ticks={niceTicks(dom[0], dom[1], w < 480 ? 3 : 6)} format={(v) => fmtTick(v, { signed: true })} title={HIH_AXIS} />
          </svg>
        );
      }}
    </ChartFrame>
  );
}
