/**
 * Plate F1's figure: the LadderChart idiom (charts/FindingCharts.tsx) specialised for the calibration gap.
 *   - a leading column at index −1, 'every PRE', holds the pre-anneal checkpoints of other families as hollow circles,
 *     so every pre-anneal glyph in the bundle is on the figure inside the band;
 *   - the stage steps of the claim (`steps`) wear a 2px --ink ring and are value-labelled in the main panel; every
 *     rung is value-labelled in the lens; labels are placed by a small collision-avoiding placer;
 *   - the lens carries the 95% CI whiskers (sub-pixel in the main panel), the band's live <Num> label and a panel label;
 *   - rungs in `tags` get an in-figure 'exception' tag after their value.
 * Encodings: x = rung order (parallel rungs share a column), y = F_calib_gap linear (main and lens), stage glyph +
 * stage code row under the axis, --band, 1.5px --zero line, hollow = other family (or off the lens, marked ↓).
 */
import type { ReactNode } from "react";
import { rungShortLabels, type Metric } from "../../../charts/FindingCharts";
import { CiWhisker, TagText, tipLines, tipTitle } from "../../../charts/findings/common";
import { YAxis } from "../../../components/Axis";
import { ChartFrame, Mark, TipBody } from "../../../components/Chart";
import { GlyphShape } from "../../../components/Glyph";
import { Num } from "../../../components/Num";
import { ciBounds } from "../../../data/ci";
import { ladderColumns, STAGE_CODE } from "../../../data/derive";
import type { Model } from "../../../data/types";
import { fmt, fmtNum, fmtTick, isNum } from "../../../lib/numfmt";
import { clampLabel, linear, niceTicks, textWidth, type Scale } from "../../../lib/scale";

const href = (m: Model) => `/model/${encodeURIComponent(m.id)}`;

export interface BandLabel {
  /** the live band value */
  num: { path: string; value: number; derived: string };
  /** what follows the value: ', the widest pre-anneal gap (stage 1 · 2.9T)' or ' (outside ±0.02)' */
  after: ReactNode;
  /** character count of the whole label, for the width estimate */
  chars: number;
  /** a shorter `after` for panels too narrow for the full label */
  short?: { after: ReactNode; chars: number };
}

interface Pt {
  m: Model;
  col: number;
  x: number;
  v: number | null;
  other: boolean;
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const hits = (a: Box, b: Box) => a.x0 < b.x1 + 1 && b.x0 < a.x1 + 1 && a.y0 < b.y1 + 1 && b.y0 < a.y1 + 1;

/**
 * Greedy value-label placer: a label goes 8px above its glyph when v ≥ 0 and 12px below when v < 0 (off-lens glyphs,
 * `above`, always start above), and is moved to the other side, then outward in 10px steps, until it clears every
 * other glyph, every label placed before it and every `extra` box, staying between yMin and yMax (baselines).
 */
function placeLabels(
  items: { id: string; x: number; y: number; v: number; text: string; above?: boolean; ringed?: boolean }[],
  glyphs: { id: string; x: number; y: number }[],
  bounds: { xMin: number; xMax: number; yMin: number; yMax: number },
  extra: Box[] = [],
) {
  const taken: (Box & { id?: string })[] = [...glyphs.map((g) => ({ id: g.id, x0: g.x - 5, x1: g.x + 5, y0: g.y - 5, y1: g.y + 5 })), ...extra];
  const out: { id: string; x: number; y: number; textAnchor: "start" | "middle" | "end"; text: string; right: number }[] = [];
  for (const it of [...items].sort((a, b) => a.x - b.x)) {
    const w = textWidth(it.text);
    const up = it.above ?? it.v >= 0;
    // a ringed glyph (r 7.5, 2px stroke) needs 3px more clearance than a bare one
    const above = it.y - 8 - (it.ringed ? 3 : 0);
    const below = it.y + 12 + (it.ringed ? 3 : 0);
    const pref = up ? above : below;
    const alt = up ? below : above;
    const dir = up ? -1 : 1;
    const cands = [pref, alt, pref + dir * 10, alt - dir * 10, pref + dir * 20, alt - dir * 20, pref + dir * 30, alt - dir * 30].filter((y) => y >= bounds.yMin && y <= bounds.yMax);
    const pos = clampLabel(it.x, w / 2, bounds.xMin, bounds.xMax);
    const x0 = pos.textAnchor === "start" ? pos.x : pos.textAnchor === "end" ? pos.x - w : pos.x - w / 2;
    let chosen = cands[cands.length - 1] ?? pref;
    for (const y of cands) {
      const box = { x0, x1: x0 + w, y0: y - 8, y1: y + 2 };
      if (!taken.some((t) => t.id !== it.id && hits(t, box))) {
        chosen = y;
        break;
      }
    }
    taken.push({ x0, x1: x0 + w, y0: chosen - 8, y1: chosen + 2 });
    out.push({ id: it.id, x: pos.x, y: chosen, textAnchor: pos.textAnchor, text: it.text, right: x0 + w });
  }
  return out;
}

export function CalibLadderChart({
  rungs,
  others,
  steps,
  metric,
  domain,
  lens,
  band,
  tags = {},
  height = 220,
}: {
  rungs: Model[];
  /** pre-anneal checkpoints of other families, for the 'every PRE' column */
  others: Model[];
  /** the stage steps of the claim: ringed, and value-labelled in the main panel */
  steps: Model[];
  metric: Metric;
  domain: [number, number];
  lens: [number, number];
  band: BandLabel | null;
  tags?: Record<string, string>;
  height?: number;
}) {
  const cols = ladderColumns(rungs);
  const nCols = cols.length + 1;
  const short = rungShortLabels(rungs, 16);
  const stepIds = new Set(steps.map((m) => m.id));
  const family = rungs[0]?.family ?? "";
  const aria =
    `${metric.name} along the ${family} ladder: ` +
    rungs.map((r) => `${r.label} ${fmt(metric.value(r), metric.fmtKind)}`).join(" → ") +
    (others.length ? `; other pre-anneal checkpoints: ` + others.map((m) => `${m.family} ${m.label} ${fmt(metric.value(m), metric.fmtKind)}`).join(", ") : "");
  // x-axis labels: 'every PRE' for the leading column, then the short rung labels
  const colLabels = ["every PRE", ...cols.map((c) => c.map((m) => short.get(m.id) ?? m.label))];
  const longest = Math.max(...colLabels.flat().map((l) => textWidth(l)));

  return (
    <ChartFrame ariaLabel={aria}>
      {(w) => {
        const L = 48;
        const R = 36;
        const T = 16;
        const ph = height;
        // side-by-side lens only when both panels keep ≥ 40px per column; otherwise the lens stacks under the main panel
        const side = (w - L * 2 - 40 - R) / 2 / nCols >= 40;
        const panelW = side ? (w - L * 2 - 40 - R) / 2 : w - L - R;
        const colStep = panelW / nCols;
        const tight = colStep < 40;
        const angle = tight ? 60 : 35;
        const labelH = Math.ceil(longest * Math.sin((angle * Math.PI) / 180)) + 16;
        // rotated rung labels, then the stage-code row (glyph + code at rowY + 12, with 4px of descent under it)
        const labelSpace = labelH + 26;
        const x = linear([-1.5, cols.length - 0.5], [L, L + panelW]);
        const y = linear(domain, [T + ph, T]);
        const totalH1 = T + ph + labelSpace;
        const lensOX = side ? L + panelW + 40 + L : L;
        const lensOY = side ? 0 : totalH1 + 18;
        const lx = linear([-1.5, cols.length - 0.5], [lensOX, lensOX + panelW]);
        const ly = linear(lens, [lensOY + T + ph, lensOY + T]);
        const totalH = side ? totalH1 : lensOY + totalH1;
        const lensTitle = `Lens · ${fmtTick(lens[0], { signed: true })} to ${fmtTick(lens[1], { signed: true })} nats (linear)`;

        const panel = (xs: Scale, ys: Scale, oy: number, isLens: boolean) => {
          const dom = ys.domain;
          const lo = Math.min(dom[0], dom[1]);
          const hi = Math.max(dom[0], dom[1]);
          const clip = (v: number) => Math.max(lo, Math.min(hi, v));
          const off = (v: number) => v < lo || v > hi;
          const spread = (n: number, i: number) => (n > 1 ? (i - (n - 1) / 2) * 12 : 0);
          const pre: Pt[] = others.map((m, i) => ({ m, col: -1, x: xs(-1) + spread(others.length, i), v: metric.value(m), other: true }));
          const lad: Pt[] = cols.flatMap((col, ci) => col.map((m, si) => ({ m, col: ci, x: xs(ci) + spread(col.length, si), v: metric.value(m), other: false })));
          const pts = [...pre, ...lad];
          const line = cols
            .map((col, ci) => lad.find((p) => p.col === ci && p.m.id === col[col.length - 1].id)!)
            .filter((p) => isNum(p.v))
            .map((p) => `${p.x},${ys(clip(p.v!))}`)
            .join(" ");
          const ticks = niceTicks(lo, hi, 6);
          const bandV = metric.band;
          const key = (p: Pt) => p.m.id + (isLens ? "L" : "");
          const axisY = oy + T + ph;
          // the band label (lens only) is placed first, right-aligned under the band, and is an obstacle for the value labels
          const bandBox = (() => {
            if (!isLens || !band || bandV === undefined) return null;
            const full = band.chars * 5.6 + 8;
            const useShort = !!band.short && full > xs.range[1] - xs.range[0];
            const W = Math.min(xs.range[1] - xs.range[0], (useShort ? band.short!.chars : band.chars) * 5.6 + 8);
            return { x0: xs.range[1] - W, x1: xs.range[1], y0: ys(Math.max(-bandV, lo)) + 3, y1: ys(Math.max(-bandV, lo)) + 17, useShort };
          })();
          // value labels: every stage step in the main panel; every rung and every PRE glyph in the lens
          const labelled = pts.filter((p) => isNum(p.v) && (isLens || stepIds.has(p.m.id)));
          const labels = placeLabels(
            labelled.map((p) => ({
              id: p.m.id,
              x: p.x,
              y: ys(clip(p.v!)),
              v: p.v!,
              text: fmtNum(p.v, "signed") + (isLens && off(p.v!) ? (p.v! < lo ? " ↓" : " ↑") : ""),
              above: isLens && off(p.v!) ? p.v! < lo : undefined,
              ringed: stepIds.has(p.m.id),
            })),
            pts.filter((p) => isNum(p.v)).map((p) => ({ id: p.m.id, x: p.x, y: ys(clip(p.v!)) })),
            { xMin: xs.range[0] + 2, xMax: xs.range[1] + R - 2, yMin: oy + 10, yMax: axisY - 2 },
            // the panel's title line is an obstacle too (axis title in the main panel, 'LENS · …' in the lens)
            [{ x0: isLens ? xs.range[0] : 4, x1: (isLens ? xs.range[0] : 4) + textWidth(isLens ? lensTitle : metric.axis), y0: oy + 1, y1: oy + 11 }, ...(bandBox ? [bandBox] : [])],
          );
          const tagged = labels.filter((l) => tags[l.id]);
          // stage code row: one bracket per run of same-stage ladder columns, with its glyph and code
          const runs: { stage: Model["stage"]; c0: number; c1: number }[] = [];
          cols.forEach((col, ci) => {
            const last = runs[runs.length - 1];
            if (last && last.stage === col[0].stage) last.c1 = ci;
            else runs.push({ stage: col[0].stage, c0: ci, c1: ci });
          });
          const rowY = axisY + labelH + 10;
          return (
            <g>
              {bandV !== undefined && lo < bandV && hi > -bandV && (
                <rect x={xs.range[0]} width={xs.range[1] - xs.range[0]} y={ys(Math.min(bandV, hi))} height={ys(Math.max(-bandV, lo)) - ys(Math.min(bandV, hi))} fill="var(--band)" />
              )}
              <YAxis scale={ys} x={xs.range[0]} ticks={ticks} format={(v) => fmtTick(v, { signed: true })} gridRight={xs.range[1]} />
              {lo <= 0 && hi >= 0 && <line x1={xs.range[0]} x2={xs.range[1]} y1={ys(0)} y2={ys(0)} stroke="var(--zero)" strokeWidth={1.5} />}
              {/* a hairline separates the 'every PRE' column from the ladder */}
              <line x1={xs(-0.5)} x2={xs(-0.5)} y1={oy + T} y2={axisY} stroke="var(--rule-strong)" strokeDasharray="2 3" />
              <polyline points={line} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
              {isLens &&
                pts.map((p) => {
                  const b = isNum(p.v) && metric.ciKey ? ciBounds(p.m, metric.ciKey) : null;
                  return b && !off(p.v!) ? <CiWhisker key={"ci" + key(p)} x1={p.x} y1={ys(clip(b[0]))} x2={p.x} y2={ys(clip(b[1]))} /> : null;
                })}
              {pts.map((p) =>
                isNum(p.v) ? (
                  <Mark
                    key={key(p)}
                    x={p.x}
                    y={ys(clip(p.v))}
                    href={href(p.m)}
                    label={`${p.other ? p.m.family + " " : ""}${p.m.label}, ${p.m.stage}: ${fmt(p.v, metric.fmtKind)}${tags[p.m.id] ? ` (${tags[p.m.id]})` : ""}`}
                    tip={<TipBody title={tipTitle(p.m)} lines={tipLines(p.m, "F_calib_gap", p.v, metric.fmtKind, metric.ciKey)} path={metric.pathOf(p.m)} />}
                  >
                    {stepIds.has(p.m.id) && <circle cx={p.x} cy={ys(clip(p.v))} r={7.5} fill="none" stroke="var(--ink)" strokeWidth={2} />}
                    <GlyphShape stage={p.m.stage} x={p.x} y={ys(clip(p.v))} size={8} hollow={p.other || off(p.v)} />
                  </Mark>
                ) : (
                  <text key={key(p)} x={p.x} y={ys(lo) - 4} textAnchor="middle">
                    —
                  </text>
                ),
              )}
              {labels.map((l, i) => (
                <text key={"v" + i} x={l.x} y={l.y} textAnchor={l.textAnchor} className="halo" style={{ fontSize: 11, fill: "var(--ink-2)" }}>
                  {l.text}
                </text>
              ))}
              {tagged.map((l) => (
                <TagText key={"t" + l.id + (isLens ? "L" : "")} x={l.right + 4} y={l.y - 4}>
                  {tags[l.id]}
                </TagText>
              ))}
              {/* rung labels, rotated; parallel rungs get one baseline each, 13px apart perpendicular to the text */}
              {colLabels.map((ls, ci) => {
                const a = (angle * Math.PI) / 180;
                const cx = xs(ci - 1);
                const list = Array.isArray(ls) ? ls : [ls];
                return list.map((l, si) => (
                  <text
                    key={"l" + ci + "-" + si}
                    transform={`translate(${cx - Math.sin(a) * 13 * si},${axisY + 14 + Math.cos(a) * 13 * si}) rotate(${angle})`}
                    style={{ fontSize: 11, fill: ci === 0 ? "var(--ink-2)" : undefined }}
                  >
                    {l}
                  </text>
                ));
              })}
              {runs.map((r) => {
                const x0 = xs(r.c0) - colStep * 0.42;
                const x1 = xs(r.c1) + colStep * 0.42;
                const cx = (x0 + x1) / 2;
                const code = STAGE_CODE[r.stage];
                const tw = textWidth(code);
                return (
                  <g key={r.stage + r.c0} aria-hidden="true">
                    <line x1={x0} x2={x1} y1={rowY} y2={rowY} stroke="var(--rule-strong)" />
                    <GlyphShape stage={r.stage} x={cx - tw / 2 - 6} y={rowY + 9} size={7} />
                    <text x={cx + 1} y={rowY + 12} textAnchor="middle" style={{ fontSize: 11, fill: "var(--ink-2)", fontWeight: 600 }}>
                      {code}
                    </text>
                  </g>
                );
              })}
              {bandBox && band && (
                // the band's width is a provenance-bearing number: a live <Num> in a foreignObject, right-aligned under the band
                <foreignObject x={bandBox.x0} y={bandBox.y0} width={bandBox.x1 - bandBox.x0} height={16}>
                  <div className="band-label" style={{ textAlign: "right" }}>
                    ±<Num path={band.num.path} value={band.num.value} fmt="num3" derived={band.num.derived} />
                    {bandBox.useShort ? band.short!.after : band.after}
                  </div>
                </foreignObject>
              )}
            </g>
          );
        };

        return (
          <svg width={w} height={totalH}>
            <text x={4} y={10} style={{ fill: "var(--ink-2)" }}>
              {metric.axis}
            </text>
            {panel(x, y, 0, false)}
            {/* lens bracket on the main axis, joined to the lens panel */}
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
            <text x={lensOX} y={lensOY + 10} className="panel-label">
              {lensTitle}
            </text>
            {panel(lx, ly, lensOY, true)}
          </svg>
        );
      }}
    </ChartFrame>
  );
}
