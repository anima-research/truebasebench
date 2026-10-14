/**
 * F7's stage dot strip. The StageDotStrip idiom (stage rows, beeswarm, median ticks, label lanes above each row)
 * plus what the F7 plates need and the shared chart does not have: a labelled reference line at any value (1 for
 * a ratio, 0 for a gap), a band whose width is a <Num>, a count per row, hollow ids, and caller-built tooltip lines.
 * Off-axis values are pinned to the axis end and annotated, as KLDumbbells does.
 */
import {
  CiWhisker,
  MedianTick,
  RangeBand,
  tipTitle,
} from "../../../charts/findings/common";
import { XAxis, xTitleExtra } from "../../../components/Axis";
import { ChartFrame, Mark, TipBody } from "../../../components/Chart";
import { GlyphShape } from "../../../components/Glyph";
import { Num } from "../../../components/Num";
import { median, STAGE_CODE, stageOrder } from "../../../data/derive";
import type { Model } from "../../../data/types";
import { fmt, fmtNum, fmtTick, type Fmt } from "../../../lib/numfmt";
import { beeswarm, linear, niceTicks, textWidth } from "../../../lib/scale";

export interface BandSpec {
  lo: number;
  hi: number;
  label: string;
  /** the band's half-width as a live <Num> definition, printed on the band */
  num?: { path: string; value: number | null; fmt: Fmt; derived?: string };
}

export function DotStrip({
  models,
  value,
  valuePath,
  fmtKind,
  axisTitle,
  domain,
  ticks,
  reference,
  band,
  median: showMedian = false,
  labelIds = [],
  tags = {},
  hollowIds = [],
  labelOf,
  tipLines,
  ci,
  ariaLabel,
}: {
  /** the checkpoints to draw (the caller has filtered to those with a value) */
  models: Model[];
  value: (m: Model) => number | null;
  valuePath: (m: Model) => string;
  fmtKind: Fmt;
  axisTitle: string;
  domain: [number, number];
  ticks?: number[];
  /** 1.5px --zero line with its label printed under the rows */
  reference?: { value: number; label: string };
  band?: BandSpec;
  median?: boolean;
  labelIds?: string[];
  /** tag text printed after a labelled model's label ('distilled', 'base outlier') */
  tags?: Record<string, string>;
  hollowIds?: string[];
  labelOf: (m: Model) => string;
  /** tooltip lines after the title (stage line first) */
  tipLines: (m: Model) => string[];
  ci?: (m: Model) => [number, number] | null;
  ariaLabel: string;
}) {
  const ms = models.filter((m) => value(m) !== null);
  const clampV = (v: number) => Math.max(domain[0], Math.min(domain[1], v));
  const offAxis = (v: number) => v < domain[0] || v > domain[1];
  const stages = stageOrder.filter((s) => ms.some((m) => m.stage === s));
  const vFmt: Fmt = fmtKind === "gap" ? "signed" : fmtKind;
  return (
    <ChartFrame ariaLabel={ariaLabel}>
      {(w) => {
        const L = 56;
        const R = w - 14;
        const x = linear(domain, [L, R]);
        const TOP = band ? 24 : 6; // room for the band label chip (22px at y = 1: the Num's dotted underline sits 4px under the text) above the rows
        // the chip sits beside the band, right of it when there is room, else left, so it never rides the first row's beeswarm
        const chipText = band ? `${band.label}${band.num ? fmt(band.num.value, band.num.fmt) : ""}` : ""; // fmt: the Num prints its unit
        const chipW = textWidth(chipText, 11) + 14;
        const BOT = reference ? 16 : 4;
        const rh = showMedian ? 44 : 34;
        const LANE = 14;
        const labelled = ms.filter((m) => labelIds.includes(m.id));
        const labels = new Map<
          string,
          { text: string; tag?: string; x0: number; lane: number }
        >();
        const lanesOf = stages.map((s) => {
          const taken: { x0: number; x1: number; lane: number }[] = [];
          let n = 0;
          for (const m of labelled
            .filter((q) => q.stage === s)
            .sort((a, b) => value(a)! - value(b)!)) {
            const v = value(m)!;
            const text = `${labelOf(m)} ${fmtNum(v, vFmt)}${offAxis(v) ? ", off axis" : ""}`;
            const tag = tags[m.id];
            const tw = textWidth(text + (tag ? ` ${tag}` : ""));
            const x0 = Math.max(2, Math.min(x(clampV(v)) - 4, w - 2 - tw));
            const x1 = x0 + tw;
            let lane = 0;
            while (
              taken.some(
                (t) => t.lane === lane && x0 < t.x1 + 6 && t.x0 < x1 + 6,
              )
            )
              lane++;
            taken.push({ x0, x1, lane });
            labels.set(m.id, { text, tag, x0, lane });
            n = Math.max(n, lane + 1);
          }
          return n;
        });
        const rowTop: number[] = [];
        stages.forEach((_, i) =>
          rowTop.push(i ? rowTop[i - 1] + rh + lanesOf[i - 1] * LANE : TOP),
        );
        const rowY = (i: number) =>
          rowTop[i] + lanesOf[i] * LANE + (showMedian ? 17 : rh / 2);
        const rowsEnd = stages.length
          ? rowTop[stages.length - 1] + rh + lanesOf[stages.length - 1] * LANE
          : TOP;
        const axisY = rowsEnd + BOT;
        const H = axisY + 44 + xTitleExtra(axisTitle, R - L);
        const pos = new Map<string, { x: number; y: number }>();
        stages.forEach((s, i) => {
          const row = ms.filter((m) => m.stage === s);
          const xs = row.map((m) => x(clampV(value(m)!)));
          const slots = beeswarm(xs, 8, 3);
          row.forEach((m, j) =>
            pos.set(m.id, { x: xs[j], y: rowY(i) + slots[j] * 6 }),
          );
        });
        return (
          <svg width={w} height={H}>
            {band && (
              <g>
                <RangeBand
                  x={x(clampV(band.lo))}
                  y={3}
                  width={x(clampV(band.hi)) - x(clampV(band.lo))}
                  height={rowsEnd - 3}
                />
              </g>
            )}
            {stages.map((s, i) => {
              const n = ms.filter((m) => m.stage === s).length;
              return (
                <g key={s}>
                  <line
                    x1={L}
                    x2={R}
                    y1={rowY(i)}
                    y2={rowY(i)}
                    stroke="var(--rule)"
                  />
                  <GlyphShape stage={s} x={8} y={rowY(i) - 6} size={9} />
                  <text
                    x={17}
                    y={rowY(i) - 6}
                    dy="0.32em"
                    style={{ fill: "var(--ink)", fontWeight: 600 }}
                  >
                    {STAGE_CODE[s]}
                  </text>
                  <text
                    x={17}
                    y={rowY(i) + 8}
                    dy="0.32em"
                    style={{ fill: "var(--ink-3)", fontSize: 11 }}
                  >
                    n = {n}
                  </text>
                </g>
              );
            })}
            {reference && !offAxis(reference.value) && (
              <g>
                <line
                  x1={x(reference.value)}
                  x2={x(reference.value)}
                  y1={0}
                  y2={rowsEnd + BOT - 2}
                  stroke="var(--zero)"
                  strokeWidth={1.5}
                />
                <text
                  x={x(reference.value) + 4}
                  y={rowsEnd + 11}
                  className="halo"
                  style={{ fontSize: 11, fill: "var(--ink-2)" }}
                >
                  {reference.label}
                </text>
              </g>
            )}
            {showMedian &&
              stages.map((s, i) => {
                const med = median(
                  ms.filter((m) => m.stage === s).map((m) => value(m)!),
                );
                return med === null ? null : (
                  <MedianTick
                    key={"med" + s}
                    x={x(clampV(med))}
                    y={rowY(i)}
                    value={med}
                    fmt={vFmt}
                  />
                );
              })}
            {ci &&
              ms.map((m) => {
                const b = ci(m);
                const p = pos.get(m.id)!;
                return b ? (
                  <CiWhisker
                    key={"ci" + m.id}
                    x1={x(clampV(b[0]))}
                    x2={x(clampV(b[1]))}
                    y1={p.y}
                  />
                ) : null;
              })}
            {ms.map((m) => {
              const p = pos.get(m.id)!;
              return (
                <Mark
                  key={m.id}
                  x={p.x}
                  y={p.y}
                  href={`/model/${encodeURIComponent(m.id)}`}
                  label={`${m.label} (${m.family}), ${m.stage}: ${fmt(value(m), fmtKind)}`}
                  tip={
                    <TipBody
                      title={tipTitle(m)}
                      lines={tipLines(m)}
                      path={valuePath(m)}
                    />
                  }
                >
                  <GlyphShape
                    stage={m.stage}
                    x={p.x}
                    y={p.y}
                    size={7}
                    hollow={hollowIds.includes(m.id)}
                  />
                </Mark>
              );
            })}
            {ms.map((m) => {
              const v = value(m)!;
              if (!offAxis(v) || labels.has(m.id)) return null;
              const p = pos.get(m.id)!;
              const left = v < domain[0];
              return (
                <text
                  key={"off" + m.id}
                  x={p.x + (left ? 7 : -7)}
                  y={p.y - 6}
                  textAnchor={left ? "start" : "end"}
                  className="halo"
                  style={{ fontSize: 11 }}
                >
                  {left ? "←" : "→"} {fmtNum(v, vFmt)} off axis
                </text>
              );
            })}
            {labelled.map((m) => {
              const p = pos.get(m.id)!;
              const lb = labels.get(m.id)!;
              const i = stages.indexOf(m.stage);
              const base = rowTop[i] + lanesOf[i] * LANE + 2 - lb.lane * LANE;
              return (
                <g key={"lab" + m.id}>
                  <line
                    x1={p.x}
                    x2={p.x}
                    y1={p.y - 5}
                    y2={base + 2}
                    stroke="var(--ink-3)"
                    strokeWidth={1}
                  />
                  <text
                    x={lb.x0}
                    y={base}
                    className="halo"
                    style={{ fill: "var(--ink)" }}
                  >
                    {lb.text}
                    {lb.tag && <tspan className="tag"> {lb.tag}</tspan>}
                  </text>
                </g>
              );
            })}
            {/* the band's half-width as a live <Num>: an HTML label on a --bg-plate chip, drawn after the reference line (the shared .band-label halo is a text-stroke, which erodes HTML text) */}
            {band && (
              <foreignObject
                x={x(clampV(band.hi)) + 4 + chipW <= R ? x(clampV(band.hi)) + 4 : x(clampV(band.lo)) - 4 - chipW >= L ? x(clampV(band.lo)) - 4 - chipW : x(clampV(band.lo)) + 2}
                y={1}
                width={chipW + 4}
                height={22}
              >
                <span
                  style={{
                    display: "inline-block",
                    fontFamily: "var(--f-sans)",
                    fontSize: 11,
                    lineHeight: "14px",
                    color: "var(--ink-3)",
                    whiteSpace: "nowrap",
                    background: "var(--bg-plate)",
                    padding: "0 3px 0 2px",
                  }}
                >
                  {band.label}
                  {band.num ? (
                    <Num
                      path={band.num.path}
                      value={band.num.value}
                      fmt={band.num.fmt}
                      derived={band.num.derived}
                      def
                    />
                  ) : null}
                </span>
              </foreignObject>
            )}
            <XAxis
              scale={x}
              y={axisY}
              ticks={ticks ?? niceTicks(domain[0], domain[1], w < 480 ? 4 : 7)}
              format={(v) =>
                fmtTick(v, {
                  pct: fmtKind === "pct",
                  signed: fmtKind === "gap",
                })
              }
              title={axisTitle}
            />
          </svg>
        );
      }}
    </ChartFrame>
  );
}
