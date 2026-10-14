import { ladderColumns } from "../data/derive";
import type { Model } from "../data/types";
import { ChartFrame, Mark, TipBody } from "../components/Chart";
import { GlyphShape } from "../components/Glyph";
import { XAxis, xTitleExtra, YAxis } from "../components/Axis";
import { fmt, fmtNum, fmtTick, isNum, type Fmt } from "../lib/numfmt";
import { linear, niceTicks, textWidth, type Scale } from "../lib/scale";
import { CiWhisker, middleEllipsis, RangeBand, rowLabel, TagText, tipLines, tipTitle } from "./findings/common";

const href = (m: Model) => `/model/${encodeURIComponent(m.id)}`;

export interface Metric {
  key: string;
  name: string;
  value: (m: Model) => number | null;
  pathOf: (m: Model) => string;
  fmtKind: Fmt;
  axis: string;
  zero?: boolean;
  band?: number;
  /** reference line (e.g. none) */
  ref?: { value: number; label: string };
  /** format of a base → post Δ label (PairedArrows): 'pctSigned' for a relative change, 'signed' for a difference */
  deltaFmt?: Fmt;
  /** `ci.<key>` entry carrying this metric's interval, for whiskers and tooltips */
  ciKey?: string;
}

function shortLabel(s: string, n = 14): string {
  return middleEllipsis(s.replace(/\s*\(.*?\)\s*/g, " ").trim(), n);
}

/**
 * Short rung labels that stay distinguishable: a "prefix · suffix" label whose prefix another rung shares
 * ("stage 2 · +5B", "stage 2 · +17B") is shown by its suffix ("+5B", "+17B"); the stage glyph carries the rest.
 * Truncation happens only after that.
 */
export function rungShortLabels(rungs: Model[], n: number): Map<string, string> {
  const pre = (l: string) => (l.includes(" · ") ? l.slice(0, l.lastIndexOf(" · ")) : null);
  const count = new Map<string, number>();
  for (const r of rungs) {
    const p = pre(r.label);
    if (p !== null) count.set(p, (count.get(p) ?? 0) + 1);
  }
  return new Map(
    rungs.map((r) => {
      const p = pre(r.label);
      const l = p !== null && (count.get(p) ?? 0) > 1 ? r.label.slice(p.length + 3) : r.label;
      return [r.id, shortLabel(l, n)];
    }),
  );
}

/**
 * One family ladder: x = rung in order (parallel rungs share a column, not joined), y = metric (linear).
 * Optional lens panel for a sub-range, drawn on its own linear axis and joined by connector lines.
 */
export function LadderChart({
  rungs,
  metric,
  domain,
  height = 200,
  lens,
  compact = false,
  hideTitle = false,
  labelEnds = false,
  ci,
}: {
  rungs: Model[];
  metric: Metric;
  domain: [number, number];
  height?: number;
  lens?: [number, number];
  compact?: boolean;
  /** the caller prints the axis title once (small multiples) */
  hideTitle?: boolean;
  /** print the first and last non-null rung values */
  labelEnds?: boolean;
  /** interval per rung, drawn as a vertical whisker behind the glyph */
  ci?: (m: Model) => [number, number] | null;
}) {
  const cols = ladderColumns(rungs);
  const short = rungShortLabels(rungs, compact ? 12 : 16);
  const aria = `${metric.name} along the ${rungs[0]?.family} ladder: ` + rungs.map((r) => `${r.label} ${fmt(metric.value(r), metric.fmtKind)}`).join(" → ");
  return (
    <ChartFrame ariaLabel={aria}>
      {(w) => {
        const side = !!lens && w >= 560;
        const L = 48;
        // right margin leaves room for the last rotated rung label
        const R = compact ? 24 : 44;
        const panelW = lens ? (side ? (w - L * 2 - 40 - R) / 2 : w - L - R) : w - L - R;
        const T = 16;
        const tight = panelW / Math.max(1, cols.length) < 40;
        // rotated rung labels: a 12-character compact label at 35° needs ≈ 38px of height plus the 14px baseline offset
        const labelSpace = compact ? (tight ? 80 : 54) : tight ? 90 : 70;
        const ph = height;
        const x = linear([-0.5, cols.length - 0.5], [L, L + panelW]);
        const colStep = panelW / Math.max(1, cols.length);
        const y = linear(domain, [T + ph, T]);
        const totalH1 = T + ph + labelSpace;
        const lensOX = side ? L + panelW + 40 + L : L;
        const lensOY = side ? 0 : totalH1 + 10;
        const lx = lens ? linear([-0.5, cols.length - 0.5], [lensOX, lensOX + panelW]) : null;
        const ly = lens ? linear(lens, [lensOY + T + ph, lensOY + T]) : null;
        const totalH = side || !lens ? totalH1 : lensOY + totalH1;
        const panel = (xs: Scale, ys: Scale, oy: number, isLens: boolean) => {
          const pts = cols.map((col, ci) => col.map((m, si) => ({ m, si, x: xs(ci) + (col.length > 1 ? (si - (col.length - 1) / 2) * 12 : 0), v: metric.value(m) })));
          const dom = ys.domain;
          const clip = (v: number) => Math.max(Math.min(dom[0], dom[1]), Math.min(Math.max(dom[0], dom[1]), v));
          const path2 = pts
            .map((col) => col[col.length - 1])
            .filter((p) => isNum(p.v))
            .map((p) => `${p.x},${ys(clip(p.v!))}`)
            .join(" ");
          const ticks = niceTicks(dom[0], dom[1], compact ? 4 : 6);
          return (
            <g>
              {metric.band !== undefined && (
                <rect x={xs.range[0]} width={xs.range[1] - xs.range[0]} y={ys(Math.min(metric.band, dom[1]))} height={ys(Math.max(-metric.band, dom[0])) - ys(Math.min(metric.band, dom[1]))} fill="var(--band)" />
              )}
              <YAxis scale={ys} x={xs.range[0]} ticks={ticks} format={(v) => (metric.fmtKind === "eff" ? fmtNum(v, "count") : fmtTick(v, { pct: metric.fmtKind === "pct", signed: metric.fmtKind === "gap" }))} gridRight={xs.range[1]} />
              {metric.zero && dom[0] <= 0 && dom[1] >= 0 && <line x1={xs.range[0]} x2={xs.range[1]} y1={ys(0)} y2={ys(0)} stroke="var(--zero)" strokeWidth={1.5} />}
              {metric.ref && <line x1={xs.range[0]} x2={xs.range[1]} y1={ys(metric.ref.value)} y2={ys(metric.ref.value)} stroke="var(--ink)" strokeDasharray="4 3" />}
              {metric.ref && (
                <text x={xs.range[1]} y={ys(metric.ref.value) - 4} textAnchor="end">
                  {metric.ref.label}
                </text>
              )}
              <polyline points={path2} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
              {ci &&
                pts.flat().map((p) => {
                  const b = isNum(p.v) ? ci(p.m) : null;
                  return b ? <CiWhisker key={"ci" + p.m.id + (isLens ? "L" : "")} x1={p.x} y1={ys(clip(b[0]))} x2={p.x} y2={ys(clip(b[1]))} /> : null;
                })}
              {pts.flat().map((p) =>
                isNum(p.v) ? (
                  <Mark
                    key={p.m.id + (isLens ? "L" : "")}
                    x={p.x}
                    y={ys(clip(p.v))}
                    href={href(p.m)}
                    label={`${p.m.label}, ${p.m.stage}: ${fmt(p.v, metric.fmtKind)}`}
                    tip={<TipBody title={tipTitle(p.m)} lines={tipLines(p.m, metric.name, p.v, metric.fmtKind, metric.ciKey)} path={metric.pathOf(p.m)} />}
                  >
                    <GlyphShape stage={p.m.stage} x={p.x} y={ys(clip(p.v))} size={8} hollow={p.v < Math.min(dom[0], dom[1]) || p.v > Math.max(dom[0], dom[1])} />
                  </Mark>
                ) : (
                  <text key={p.m.id} x={p.x} y={ys(dom[0]) - 4} textAnchor="middle">
                    —
                  </text>
                ),
              )}
              {isLens &&
                pts.flat().map((p) =>
                  isNum(p.v) && (p.v < Math.min(dom[0], dom[1]) || p.v > Math.max(dom[0], dom[1])) ? (
                    <text key={"o" + p.m.id} x={p.x + 7} y={ys(clip(p.v)) + (p.v < dom[0] ? -4 : 12)} textAnchor="start" style={{ fontSize: 11 }}>
                      {p.v < dom[0] ? "↓" : "↑"}
                    </text>
                  ) : null,
                )}
              {!compact &&
                colStep >= 56 &&
                pts.flat().map((p) =>
                  isNum(p.v) && !isLens ? (
                    <text key={"v" + p.m.id} x={p.x + 7} y={ys(clip(p.v)) - 6} style={{ fontSize: 11, fill: "var(--ink-2)" }}>
                      {fmtNum(p.v, metric.fmtKind === "gap" ? "signed" : metric.fmtKind)}
                    </text>
                  ) : null,
                )}
              {labelEnds &&
                !isLens &&
                (() => {
                  const line = cols.map((col) => col[col.length - 1]).map((m) => pts.flat().find((p) => p.m.id === m.id)!).filter((p) => isNum(p.v));
                  const ends = line.length > 1 ? [line[0], line[line.length - 1]] : line;
                  return ends.map((p, i) => {
                    const first = i === 0 && ends.length > 1;
                    const text = fmtNum(p.v, metric.fmtKind === "gap" ? "signed" : metric.fmtKind);
                    // an end-anchored first label that would reach the y-axis tick labels sits centred above its glyph instead
                    const above = first && p.x - 7 - textWidth(text, 11) < xs.range[0] + 2;
                    return (
                      <text
                        key={"e" + p.m.id}
                        x={above ? p.x : p.x + (first ? -7 : 7)}
                        y={ys(clip(p.v!)) - (above ? 8 : 6)}
                        textAnchor={above ? "middle" : first ? "end" : "start"}
                        className="halo cell-val"
                      >
                        {text}
                      </text>
                    );
                  });
                })()}
              {pts.flat().map((p) => {
                // parallel rungs: one rotated baseline per rung, offset by a fixed 13px line step perpendicular to it
                const a = ((tight ? 60 : 35) * Math.PI) / 180;
                const lx0 = xs(cols.findIndex((c) => c.some((m) => m.id === p.m.id)));
                const ox = -Math.sin(a) * 13 * p.si;
                const oyy = Math.cos(a) * 13 * p.si;
                return (
                  <text key={"l" + p.m.id + isLens} transform={`translate(${lx0 + ox},${oy + T + ph + 14 + oyy}) rotate(${tight ? 60 : 35})`} style={{ fontSize: 11 }}>
                    {short.get(p.m.id)}
                  </text>
                );
              })}
            </g>
          );
        };
        return (
          <svg width={w} height={totalH}>
            {!hideTitle && (
              <text x={4} y={10} style={{ fill: "var(--ink-2)" }}>
                {metric.axis}
              </text>
            )}
            {panel(x, y, 0, false)}
            {lens && lx && ly && (
              <g>
                {/* lens bracket on main axis */}
                <rect x={L} y={y(lens[1])} width={panelW} height={y(lens[0]) - y(lens[1])} fill="none" stroke="var(--rule-strong)" />
                {side ? (
                  <>
                    <line x1={L + panelW} y1={y(lens[1])} x2={lensOX} y2={ly(lens[1])} stroke="var(--rule-strong)" />
                    <line x1={L + panelW} y1={y(lens[0])} x2={lensOX} y2={ly(lens[0])} stroke="var(--rule-strong)" />
                  </>
                ) : (
                  <>
                    <line x1={L} y1={y(lens[0])} x2={L} y2={ly(lens[1])} stroke="var(--rule-strong)" />
                    <line x1={L + panelW} y1={y(lens[0])} x2={L + panelW} y2={ly(lens[1])} stroke="var(--rule-strong)" />
                  </>
                )}
                <text x={lensOX} y={lensOY + 10} style={{ fill: "var(--ink-2)" }}>
                  lens: {fmtNum(lens[0], "signed")} to {fmtNum(lens[1], "signed")} nats (linear)
                </text>
                {panel(lx, ly, lensOY, true)}
              </g>
            )}
          </svg>
        );
      }}
    </ChartFrame>
  );
}

/** Default cell order: change from the first to the last rung with a value, most negative first; ties by name. */
export function ladderChange(metric: Metric): (rungs: Model[]) => number {
  return (rungs) => {
    const vs = rungs.map(metric.value).filter(isNum);
    return vs.length > 1 ? vs[vs.length - 1] - vs[0] : Infinity;
  };
}

export interface PairedRow {
  base: Model;
  post: Model;
  vBase: number;
  vPost: number;
  /** the Δ printed at the row's right: a relative change (metric.deltaFmt 'pctSigned') or a difference ('signed') */
  delta: number;
}

/**
 * Paired arrows from each base (hollow) to its post-trained rung (filled) on one linear axis, labelled with the Δ.
 * Rows tagged in `tags` (exceptions) draw their arrow in --ink-3 with the tag after the Δ. F6 uses it twice, F2 per cell.
 */
export function PairedArrows({
  rows,
  metric,
  zero = true,
  band,
  sort,
  tags = {},
}: {
  rows: PairedRow[];
  metric: Metric;
  /** include 0 in the axis (default) */
  zero?: boolean;
  band?: { lo: number; hi: number; label: string };
  /** 'delta' (default, largest first), 'post' (largest post value first) or a comparator */
  sort?: "delta" | "post" | ((a: PairedRow, b: PairedRow) => number);
  tags?: Record<string, string>;
}) {
  const cmp = typeof sort === "function" ? sort : sort === "post" ? (a: PairedRow, b: PairedRow) => b.vPost - a.vPost : (a: PairedRow, b: PairedRow) => b.delta - a.delta;
  const sorted = [...rows].sort(cmp);
  const vals = rows.flatMap((p) => [p.vBase, p.vPost]).concat(band ? [band.lo, band.hi] : []);
  const lo = Math.min(...vals, zero ? 0 : Infinity);
  const hi = Math.max(...vals, zero ? 0 : -Infinity);
  const dom: [number, number] = lo >= 0 ? [0, hi * 1.1] : [lo - (hi - lo) * 0.08, hi + (hi - lo) * 0.08];
  const dFmt = metric.deltaFmt ?? "pctSigned";
  const posts = rows.map((r) => r.post);
  return (
    <ChartFrame ariaLabel={`${metric.axis}, base → post-trained: ` + sorted.map((p) => `${p.post.label} ${fmt(p.vBase, metric.fmtKind)} → ${fmt(p.vPost, metric.fmtKind)}`).join("; ")}>
      {(w) => {
        const L = Math.min(200, w * 0.42);
        const rh = 20;
        const x = linear(dom, [L, w - 52]);
        const xTitle = metric.axis;
        const H = sorted.length * rh + 40 + xTitleExtra(xTitle, w - 52 - L);
        return (
          <svg width={w} height={H}>
            {band && <RangeBand x={x(band.lo)} y={0} width={x(band.hi) - x(band.lo)} height={sorted.length * rh} label={band.label} />}
            {dom[0] < 0 && dom[1] > 0 && <line x1={x(0)} x2={x(0)} y1={0} y2={sorted.length * rh} stroke="var(--zero)" strokeWidth={1.5} />}
            {sorted.map((p, i) => {
              const cy = i * rh + rh / 2;
              const tag = tags[p.post.id];
              return (
                <g key={p.post.id}>
                  <text x={L - 8} y={cy} dy="0.32em" textAnchor="end" style={{ fill: "var(--ink-2)" }}>
                    {rowLabel(p.post, posts, Math.floor(L / 6))}
                  </text>
                  {(() => {
                    // the arrow (and its head) stops 6px short of the post-trained glyph so the glyph stays a clean triangle
                    const x1 = x(p.vBase);
                    const x2 = x(p.vPost);
                    const sign = Math.sign(x2 - x1);
                    const end = x2 - sign * 6;
                    const head = Math.abs(end - x1) > 8;
                    return <line x1={x1 + sign * 4} x2={head ? end : x2} y1={cy} y2={cy} stroke={tag ? "var(--ink-3)" : "var(--ink)"} markerEnd={head ? (tag ? "url(#arrow-3)" : "url(#arrow)") : undefined} />;
                  })()}
                  <Mark x={x(p.vBase)} y={cy} href={href(p.base)} label={`${p.base.label}: ${fmt(p.vBase, metric.fmtKind)}`} tip={<TipBody title={tipTitle(p.base)} lines={tipLines(p.base, metric.name, p.vBase, metric.fmtKind, metric.ciKey)} path={metric.pathOf(p.base)} />}>
                    <GlyphShape stage={p.base.stage} x={x(p.vBase)} y={cy} size={7} hollow />
                  </Mark>
                  <Mark x={x(p.vPost)} y={cy} href={href(p.post)} label={`${p.post.label}: ${fmt(p.vPost, metric.fmtKind)}`} tip={<TipBody title={tipTitle(p.post)} lines={tipLines(p.post, metric.name, p.vPost, metric.fmtKind, metric.ciKey)} path={metric.pathOf(p.post)} />}>
                    <GlyphShape stage={p.post.stage} x={x(p.vPost)} y={cy} size={7} />
                  </Mark>
                  <text x={Math.max(x(p.vPost), x(p.vBase)) + 8} y={cy} dy="0.32em" style={{ fill: tag ? "var(--ink-2)" : "var(--ink)" }}>
                    {fmtNum(p.delta, dFmt)}
                  </text>
                  {tag && <TagText x={Math.max(x(p.vPost), x(p.vBase)) + 8 + textWidth(fmtNum(p.delta, dFmt)) + 6} y={cy}>{tag}</TagText>}
                </g>
              );
            })}
            <XAxis scale={x} y={sorted.length * rh + 2} ticks={niceTicks(dom[0], dom[1], w < 480 ? 3 : 6)} format={(v) => fmtTick(v, { pct: metric.fmtKind === "pct", signed: metric.fmtKind === "gap" })} title={xTitle} />
          </svg>
        );
      }}
    </ChartFrame>
  );
}
