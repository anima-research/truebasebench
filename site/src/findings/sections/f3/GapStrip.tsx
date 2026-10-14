/**
 * F3's figure: every checkpoint's F_calib_gap in stage rows (the StageDotStrip idiom: PRE/MID/BASE/POST rows,
 * beeswarm collisions, label lanes above a row, one tooltip order), plus what F3 needs that the shared strip does
 * not draw: the pre-anneal band printed as a <Num>, a range band on the POST row only, a dashed student → sibling
 * connector with a label, and a family hover highlight. Nothing animates.
 */
import { useState } from "react";
import { XAxis, xTitleExtra } from "../../../components/Axis";
import { ChartFrame, Mark, TipBody } from "../../../components/Chart";
import { GlyphShape } from "../../../components/Glyph";
import { Num } from "../../../components/Num";
import { CiWhisker, RangeBand, rowLabel, tipLines, tipTitle } from "../../../charts/findings/common";
import { fp, path } from "../../../data/bundle";
import { ciBounds } from "../../../data/ci";
import { STAGE_CODE, stageOrder } from "../../../data/derive";
import type { Bundle, Model } from "../../../data/types";
import { fmt, fmtNum, fmtTick, isNum } from "../../../lib/numfmt";
import { beeswarm, linear, niceTicks, textWidth, wrapText } from "../../../lib/scale";

export const GAP_AXIS = "calibration gap on post-cutoff text, mean(H − s), nats";
const href = (m: Model) => `/model/${encodeURIComponent(m.id)}`;
const gap = (m: Model) => fp(m, "F_calib_gap");

export interface GapStripProps {
  bundle: Bundle;
  /** ± the widest pre-anneal gap and the checkpoint that sets it; printed on the figure as a <Num> */
  band: { band: number; model: Model } | null;
  /** ringed on --hl and drawn at 9px */
  highlight?: Model | null;
  /** checkpoints labelled directly (row label + value), in label lanes above their row */
  labelIds?: string[];
  /** italic tag after a label ('distilled') */
  tags?: Record<string, string>;
  /** 1px --ink-3 dashed connector, no arrowhead, labelled near its start */
  join?: { from: Model; to: Model; label: string } | null;
  /** band on the POST row only */
  postRange?: { lo: number; hi: number; label: string } | null;
}

export function GapStrip({ bundle, band, highlight, labelIds = [], tags = {}, join, postRange }: GapStripProps) {
  const [hoverFamily, setHoverFamily] = useState<string | null>(null);
  const ms = bundle.models.filter((m) => isNum(gap(m)));
  const missing = bundle.models.filter((m) => !isNum(gap(m)));
  const vals = ms.map((m) => gap(m)!);
  // x: linear from min − 0.03 to +0.05 (the brief's lens); anything beyond is clamped and noted
  const dom: [number, number] = [Math.min(...vals, 0) - 0.03, 0.05];
  const clampV = (v: number) => Math.max(dom[0], Math.min(dom[1], v));
  const offAxis = (v: number) => v < dom[0] || v > dom[1];
  const stages = stageOrder.filter((s) => ms.some((m) => m.stage === s));
  const labelled = ms.filter((m) => m.id === highlight?.id || labelIds.includes(m.id));
  const aria =
    `${GAP_AXIS}, by stage: ` +
    stages.map((s) => `${STAGE_CODE[s]}: ${ms.filter((m) => m.stage === s).map((m) => `${m.label} ${fmt(gap(m), "gap")}`).join(", ")}`).join("; ") +
    (highlight ? `. Highlighted: ${highlight.family} ${highlight.label} at ${fmt(gap(highlight), "gap")}.` : "");

  return (
    <ChartFrame ariaLabel={aria}>
      {(w) => {
        const L = 52;
        const R = 14;
        const TOP = 18; // header lane: the band's printed value
        const rh = 34;
        const LANE = 14;
        const RANGE_LBL = 14; // the POST range label sits under its row
        const x = linear(dom, [L, w - R]);
        // Direct labels go into lanes above their stage row, packed 1-D: a label takes the lowest lane where it
        // does not overlap another; a leader joins it to its glyph (same rule as StageDotStrip).
        const labels = new Map<string, { text: string; tag?: string; x0: number; lane: number }>();
        const lanesOf = stages.map((s) => {
          const taken: { x0: number; x1: number; lane: number }[] = [];
          let n = 0;
          for (const m of labelled.filter((q) => q.stage === s).sort((a, b) => gap(a)! - gap(b)!)) {
            const text = `${rowLabel(m, ms)} ${fmtNum(gap(m), "signed")}`;
            const tag = tags[m.id];
            const tw = textWidth(text + (tag ? ` ${tag}` : ""));
            const x0 = Math.max(2, Math.min(x(clampV(gap(m)!)) - 4, w - 2 - tw));
            const x1 = x0 + tw;
            let lane = 0;
            while (taken.some((t) => t.lane === lane && x0 < t.x1 + 6 && t.x0 < x1 + 6)) lane++;
            taken.push({ x0, x1, lane });
            labels.set(m.id, { text, tag, x0, lane });
            n = Math.max(n, lane + 1);
          }
          return n;
        });
        const extraBelow = (i: number) => (postRange && stages[i] === "post-trained" ? RANGE_LBL : 0);
        const rowTop: number[] = [];
        stages.forEach((_, i) => rowTop.push(i ? rowTop[i - 1] + lanesOf[i - 1] * LANE + rh + extraBelow(i - 1) : TOP));
        const rowY = (i: number) => rowTop[i] + lanesOf[i] * LANE + rh / 2;
        const last = stages.length - 1;
        const rowsBottom = stages.length ? rowTop[last] + lanesOf[last] * LANE + rh + extraBelow(last) : TOP;
        const missLines = missing.length ? wrapText(`not measured: ${missing.map((m) => m.label).join(", ")}`, w - 8) : [];
        const H = rowsBottom + 44 + Math.max(0, missLines.length - 1) * 14 + xTitleExtra(GAP_AXIS, w - R - L);

        const pos = new Map<string, { x: number; y: number }>();
        stages.forEach((s, i) => {
          const row = ms.filter((m) => m.stage === s);
          const xs = row.map((m) => x(clampV(gap(m)!)));
          const slots = beeswarm(xs, 8, 3);
          row.forEach((m, j) => pos.set(m.id, { x: xs[j], y: rowY(i) + slots[j] * 6 }));
        });
        const pi = stages.indexOf("post-trained");
        const jf = join ? pos.get(join.from.id) : undefined;
        const jt = join ? pos.get(join.to.id) : undefined;
        // family hover: the hovered family's rungs joined in order across rows (leaderboard strip idiom)
        const famRungs = hoverFamily ? bundle.models.filter((m) => m.family === hoverFamily && pos.has(m.id)).sort((a, b) => a.order - b.order) : [];

        return (
          <svg width={w} height={H}>
            {band && (
              <g>
                <RangeBand x={x(clampV(-band.band))} y={TOP} width={x(clampV(band.band)) - x(clampV(-band.band))} height={rowsBottom - TOP} />
                <foreignObject x={x(clampV(band.band)) - 240} y={1} width={240} height={16}>
                  {/* the div resets the serif prose line box the section would otherwise hand the foreignObject */}
                  <div style={{ textAlign: "right", fontSize: 11, lineHeight: "14px", fontFamily: "var(--f-sans)" }}>
                    <span className="band-label">
                      pre-anneal band ±
                      <Num path={path(band.model, "fingerprint.F_calib_gap")} value={band.band} fmt="nats" derived="max |F_calib_gap| over pre-anneal checkpoints" />
                    </span>
                  </div>
                </foreignObject>
              </g>
            )}
            {postRange && pi >= 0 && (
              <RangeBand
                x={x(clampV(postRange.lo))}
                y={rowTop[pi] + lanesOf[pi] * LANE}
                width={x(clampV(postRange.hi)) - x(clampV(postRange.lo))}
                height={rh + RANGE_LBL}
                label={postRange.label}
                labelAt="bottom"
              />
            )}
            {stages.map((s, i) => (
              <g key={s}>
                <line x1={L} x2={w - R} y1={rowY(i)} y2={rowY(i)} stroke="var(--rule)" />
                <GlyphShape stage={s} x={8} y={rowY(i)} size={9} />
                <text x={17} y={rowY(i)} dy="0.32em" style={{ fill: "var(--ink)", fontWeight: 600 }}>
                  {STAGE_CODE[s]}
                </text>
              </g>
            ))}
            {dom[0] < 0 && dom[1] > 0 && <line x1={x(0)} x2={x(0)} y1={TOP} y2={rowsBottom} stroke="var(--zero)" strokeWidth={1.5} />}
            {famRungs.length > 1 && (
              <polyline points={famRungs.map((m) => `${pos.get(m.id)!.x},${pos.get(m.id)!.y}`).join(" ")} fill="none" stroke="var(--ink-2)" strokeWidth={1} aria-hidden="true" />
            )}
            {join && jf && jt && (
              <g aria-hidden="true">
                <line x1={jf.x} y1={jf.y} x2={jt.x} y2={jt.y} stroke="var(--ink-3)" strokeWidth={1} strokeDasharray="3 3" />
                {(() => {
                  // the label sits a third of the way from the student, on the upper side of the connector,
                  // clear of the label lanes above the POST row
                  const t = 0.35;
                  const lx = jf.x + (jt.x - jf.x) * t;
                  const ly = jf.y + (jt.y - jf.y) * t;
                  const leftward = jt.x < jf.x;
                  return (
                    <text x={lx + (leftward ? -4 : 4)} y={ly - 3} textAnchor={leftward ? "end" : "start"} className="halo tag">
                      {join.label}
                    </text>
                  );
                })()}
              </g>
            )}
            {ms.map((m) => {
              const b = ciBounds(m, "calib_gap");
              const p = pos.get(m.id)!;
              return b ? <CiWhisker key={"ci" + m.id} x1={x(clampV(b[0]))} x2={x(clampV(b[1]))} y1={p.y} /> : null;
            })}
            {ms.map((m) => {
              const p = pos.get(m.id)!;
              const isHl = m.id === highlight?.id;
              const fade = hoverFamily !== null && m.family !== hoverFamily;
              return (
                <Mark
                  key={m.id}
                  x={p.x}
                  y={p.y}
                  href={href(m)}
                  label={`${m.label} (${m.family}), ${STAGE_CODE[m.stage]}: ${fmt(gap(m), "gap")}`}
                  tip={<TipBody title={tipTitle(m)} lines={tipLines(m, "calibration gap", gap(m), "gap", "calib_gap")} path={path(m, "fingerprint.F_calib_gap")} />}
                  onHover={(on) => setHoverFamily(on ? m.family : null)}
                >
                  {isHl && <circle cx={p.x} cy={p.y} r={8} fill="var(--hl)" />}
                  <g opacity={fade ? 0.35 : 1}>
                    <GlyphShape stage={m.stage} x={p.x} y={p.y} size={isHl ? 9 : 7} />
                  </g>
                </Mark>
              );
            })}
            {ms.map((m) => {
              const v = gap(m)!;
              if (!offAxis(v)) return null;
              const p = pos.get(m.id)!;
              return (
                <text key={"off" + m.id} x={p.x + (v < dom[0] ? 7 : -7)} y={p.y - 5} textAnchor={v < dom[0] ? "start" : "end"} className="halo" style={{ fontSize: 11 }}>
                  {v < dom[0] ? "←" : "→"} {fmtNum(v, "signed")} off axis
                </text>
              );
            })}
            {labelled.map((m) => {
              const p = pos.get(m.id)!;
              const lb = labels.get(m.id)!;
              const i = stages.indexOf(m.stage);
              const base = rowTop[i] + lanesOf[i] * LANE + 2 - lb.lane * LANE; // text baseline of this lane
              return (
                <g key={"lab" + m.id} aria-hidden="true">
                  <line x1={p.x} x2={p.x} y1={p.y - 5} y2={base + 2} stroke="var(--ink-3)" strokeWidth={1} />
                  <text x={lb.x0} y={base} className="halo" style={{ fill: "var(--ink)" }}>
                    {lb.text}
                    {lb.tag && <tspan className="tag"> {lb.tag}</tspan>}
                  </text>
                </g>
              );
            })}
            <XAxis scale={x} y={rowsBottom + 2} ticks={niceTicks(dom[0], dom[1], w < 480 ? 4 : 7)} format={(v) => fmtTick(v, { signed: true })} title={GAP_AXIS} />
            {missLines.length > 0 && (
              <text x={4} y={H - 1 - (missLines.length - 1) * 14} style={{ fontSize: 11 }}>
                {missLines.map((l, i) => (
                  <tspan key={i} x={4} dy={i ? 14 : 0}>
                    {l}
                  </tspan>
                ))}
              </text>
            )}
          </svg>
        );
      }}
    </ChartFrame>
  );
}
