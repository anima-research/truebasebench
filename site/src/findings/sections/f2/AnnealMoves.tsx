/**
 * Plate F2 · 'Two anneals, two axes': a 2 × 2 grid of paired-arrow cells. Rows are the two anneal families, columns the
 * two raw features (Wikipedia verbatim share, instruction-marker rate). Each cell is one linear axis shared down its
 * column, with the feature's ramp anchors drawn as ticks and the clipped zones shaded --track (the explainer D / F idiom).
 * In a cell: the claim's pre-anneal rung as a filled circle, every annealed rung as an arrow from that value with the
 * value printed at the tip, and the next post-trained rung as a hollow glyph on a dashed line (comparison, not claim).
 * Every glyph carries its 95% interval as a whisker and the house tooltip (family · label / CODE stage / value [lo, hi] / path).
 */
import { ChartFrame, Mark, TipBody } from "../../../components/Chart";
import { GlyphShape } from "../../../components/Glyph";
import { XAxis, xTitleExtra } from "../../../components/Axis";
import { rungShortLabels } from "../../../charts/FindingCharts";
import { CiWhisker, tipLines, tipTitle } from "../../../charts/findings/common";
import { ciBounds } from "../../../data/ci";
import { STAGE_CODE } from "../../../data/derive";
import type { Model } from "../../../data/types";
import { fmt, fmtNum, fmtTick, isNum, type Fmt } from "../../../lib/numfmt";
import { linear, niceTicks, textWidth, wrapText } from "../../../lib/scale";

/** One raw feature column of the grid. */
export interface MoveFeature {
  key: string;
  /** panel-label noun ('Wikipedia verbatim share') */
  name: string;
  /** tooltip / aria metric name ('marker rate') */
  short: string;
  value: (m: Model) => number | null;
  pathOf: (m: Model) => string;
  ciKey: string;
  fmtKind: Fmt;
  /** [value that scores 1, value that scores 0] */
  ramp: [number, number];
  /** axis title, printed under the bottom cell of the column only */
  axis: string;
}

/** One family row of the grid. `origin` is the rung the claim measures from (its value starts every arrow). */
export interface MoveFamily {
  family: string;
  rows: Model[];
  origin: Model;
}

const href = (m: Model) => `/model/${encodeURIComponent(m.id)}`;
const isAnnealed = (m: Model) => m.stage === "anneal" || m.stage === "base";

/** Column domain: 0 … the largest value or interval end in either family, never below the 0-anchor, plus 8%. */
function columnMax(feature: MoveFeature, fams: MoveFamily[]): number {
  let hi = feature.ramp[1];
  for (const f of fams)
    for (const m of f.rows) {
      const v = feature.value(m);
      if (isNum(v)) hi = Math.max(hi, v);
      const b = ciBounds(m, feature.ciKey);
      if (b) hi = Math.max(hi, b[1]);
    }
  return hi * 1.08;
}

function MoveCell({
  fam,
  feature,
  domMax,
  tag,
  axisTitle,
}: {
  fam: MoveFamily;
  feature: MoveFeature;
  domMax: number;
  tag?: string;
  axisTitle?: string;
}) {
  const rows = fam.rows;
  const short = rungShortLabels(rows, 14);
  const vOrigin = feature.value(fam.origin);
  const aria =
    `${fam.family}, ${feature.name}: ` +
    rows.map((m) => `${m.label} (${STAGE_CODE[m.stage]}) ${fmt(feature.value(m), feature.fmtKind)}`).join("; ") +
    (tag ? `; ${tag}` : "");
  const panel = `${fam.family} · ${feature.name}`;
  return (
    <ChartFrame ariaLabel={aria}>
      {(w) => {
        const labelW = Math.max(...rows.map((m) => textWidth(short.get(m.id) ?? "")), textWidth("rung"));
        const L = Math.min(100, Math.max(44, Math.ceil(labelW) + 12));
        const R = 46;
        const x = linear([0, domMax], [L, w - R]);
        // uppercase + 0.08em tracking: ~7px per character at 11px
        const panelLines = wrapText(panel, w - 8, 14);
        let y = 11;
        const panelY = y;
        y += panelLines.length * 14;
        // ramp anchor labels: one line each, start-anchored at the tick, flipped when they would leave the cell
        const anchorText = [`score 1 at or below ${fmtTick(feature.ramp[0], { pct: true })}`, `score 0 at or above ${fmtTick(feature.ramp[1], { pct: true })}`];
        const anchorY = [y + 2, y + 16];
        y += 30;
        const rowsY = y;
        const rh = 20;
        const axisY = rowsY + rows.length * rh + 4;
        const H = axisY + 20 + (axisTitle ? 14 + xTitleExtra(axisTitle, w - R - L) : 0);
        const place = (ax: number, text: string): { x: number; anchor: "start" | "end" } =>
          ax + 3 + textWidth(text) <= w - 2 ? { x: ax + 3, anchor: "start" } : { x: ax - 3, anchor: "end" };
        const oneX = x(Math.min(feature.ramp[0], domMax));
        const zeroX = x(Math.min(feature.ramp[1], domMax));
        return (
          <svg width={w} height={H}>
            <text x={4} y={panelY} className="panel-label">
              {panelLines.map((l, i) => (
                <tspan key={i} x={4} dy={i ? 14 : 0}>
                  {l}
                  {tag && i === panelLines.length - 1 && (
                    <tspan className="tag" style={{ textTransform: "none", letterSpacing: "0.02em" }}>
                      {" "}
                      · {tag}
                    </tspan>
                  )}
                </tspan>
              ))}
            </text>
            {/* clipped zones of the ramp: at or below the 1-anchor, at or above the 0-anchor */}
            {oneX - x(0) > 0.5 && <rect x={x(0)} y={rowsY - 4} width={oneX - x(0)} height={axisY - rowsY + 4} fill="var(--track)" />}
            {x(domMax) - zeroX > 0.5 && <rect x={zeroX} y={rowsY - 4} width={x(domMax) - zeroX} height={axisY - rowsY + 4} fill="var(--track)" />}
            {[oneX, zeroX].map((ax, i) => (
              <g key={i} aria-hidden="true">
                <line x1={ax} x2={ax} y1={anchorY[i] + 4} y2={axisY} stroke="var(--ink-3)" strokeDasharray="3 2" />
                <text {...(() => { const p = place(ax, anchorText[i]); return { x: p.x, textAnchor: p.anchor }; })()} y={anchorY[i]} className="halo" style={{ fill: "var(--ink-3)" }}>
                  {anchorText[i]}
                </text>
              </g>
            ))}
            {/* the claim's pre-anneal value: a 1px reference line every arrow starts from */}
            {isNum(vOrigin) && rows.length > 1 && (
              <line x1={x(vOrigin)} x2={x(vOrigin)} y1={rowsY + rh / 2} y2={rowsY + (rows.length - 0.5) * rh} stroke="var(--ink-3)" strokeWidth={1} />
            )}
            {rows.map((m, i) => {
              const cy = rowsY + i * rh + rh / 2;
              const v = feature.value(m);
              const b = ciBounds(m, feature.ciKey);
              const post = m.stage === "post-trained";
              const moved = isAnnealed(m) && isNum(vOrigin) && isNum(v);
              const label = (
                <text key={"l" + m.id} x={L - 8} y={cy} dy="0.32em" textAnchor="end" style={{ fill: "var(--ink-2)" }}>
                  {short.get(m.id)}
                </text>
              );
              if (!isNum(v))
                return (
                  <g key={m.id}>
                    {label}
                    <text x={x(0) + 6} y={cy} dy="0.32em">
                      <title>not measured for this checkpoint</title>—
                    </text>
                  </g>
                );
              const x1 = isNum(vOrigin) ? x(vOrigin) : x(v);
              const x2 = x(v);
              const sign = Math.sign(x2 - x1) || 1;
              const end = x2 - sign * 6;
              const head = Math.abs(end - x1) > 8;
              // the value sits beside its glyph; the whisker is drawn in two pieces so it never runs under the label
              const valX = x2 + 8;
              const valText = fmtNum(v, feature.fmtKind);
              const valEnd = valX + textWidth(valText) + 4;
              return (
                <g key={m.id}>
                  {label}
                  {moved && (
                    <line x1={x1 + sign * 2} x2={head ? end : x2} y1={cy} y2={cy} stroke={tag ? "var(--ink-3)" : "var(--ink)"} strokeWidth={1} markerEnd={head ? "url(#arrow)" : undefined} />
                  )}
                  {post && isNum(vOrigin) && <line x1={x1} x2={x2} y1={cy} y2={cy} stroke="var(--ink-3)" strokeDasharray="3 2" />}
                  {b && <CiWhisker x1={x(Math.max(0, b[0]))} y1={cy} x2={Math.min(x(Math.min(b[1], domMax)), x2)} />}
                  {b && x(Math.min(b[1], domMax)) > valEnd && <CiWhisker x1={valEnd} y1={cy} x2={x(Math.min(b[1], domMax))} />}
                  <Mark
                    x={x2}
                    y={cy}
                    href={href(m)}
                    label={`${m.family} ${m.label}, ${STAGE_CODE[m.stage]}: ${feature.short} ${fmt(v, feature.fmtKind)}${post ? " (next post-trained rung, for scale)" : ""}`}
                    tip={<TipBody title={tipTitle(m)} lines={tipLines(m, feature.short, v, feature.fmtKind, feature.ciKey)} path={feature.pathOf(m)} />}
                  >
                    <GlyphShape stage={m.stage} x={x2} y={cy} size={8} hollow={post} />
                  </Mark>
                  <text x={valX} y={cy} dy="0.32em" className="halo" style={{ fill: post ? "var(--ink-2)" : "var(--ink)" }}>
                    {valText}
                  </text>
                </g>
              );
            })}
            <XAxis scale={x} y={axisY} ticks={niceTicks(0, domMax, w < 360 ? 3 : 4)} format={(v) => fmtTick(v, { pct: true })} title={axisTitle} titleOffset={30} />
          </svg>
        );
      }}
    </ChartFrame>
  );
}

/**
 * The grid. `tags` marks a cell as an exception ('<familyIndex>:<featureKey>' → tag text) when a check fails; a tagged
 * cell draws its arrows in --ink-3 and prints the tag after its panel label.
 */
export function AnnealMoves({ families, features, tags = {} }: { families: MoveFamily[]; features: MoveFeature[]; tags?: Record<string, string> }) {
  const maxes = features.map((f) => columnMax(f, families));
  return (
    <div className="f2-moves">
      {families.map((fam, fi) =>
        features.map((f, ci) => (
          <div key={`${fi}:${f.key}`} className="cell-plate f2-cell">
            <MoveCell fam={fam} feature={f} domMax={maxes[ci]} tag={tags[`${fi}:${f.key}`]} axisTitle={fi === families.length - 1 ? f.axis : undefined} />
          </div>
        )),
      )}
    </div>
  );
}
