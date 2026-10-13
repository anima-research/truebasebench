/**
 * RampPlot: one sub-score transfer function (DESIGN §8 f, §8 d D3, §8 c step 8) with animatable layers and an
 * optional draggable, keyboard-operable value glyph. x = raw feature in its unit, y = sub-score 0–1.
 */
import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { RAMPS, SUB_META } from "../../data/method";
import { subScore } from "../../data/scoring";
import type { Stage, SubKey } from "../../data/types";
import { GlyphShape } from "../../components/Glyph";
import { fmt, fmtNum, fmtTick, isNum } from "../../lib/numfmt";
import { clampLabel, linear, niceTicks, textWidth } from "../../lib/scale";
import { easeInOut, easeSettle, lerp } from "./anim";

export interface RampItem {
  id: string;
  stage: Stage;
  value: number | null;
  /** score to draw; defaults to the ramp of value */
  score?: number | null;
  hollow?: boolean;
  label?: string;
  /** makes the glyph a slider */
  onDrag?: (v: number) => void;
  name?: string;
}

export interface RampProg {
  glyph: number;
  ramp: number;
  drop: number;
  readoff: number;
}

export const FULL: RampProg = { glyph: 1, ramp: 1, drop: 1, readoff: 1 };

export function fmtFeature(k: SubKey, v: number | null): string {
  if (SUB_META[k].unit === "share") return fmt(v, "pct");
  return k === "calib" ? fmt(v, "gap") : fmt(v, "nats");
}

/** Axis domain: anchors ± 35%, extended toward values as long as the ramp keeps ≥ 30% of the axis. */
export function rampDomain(k: SubKey, values: (number | null)[]): [number, number] {
  const [good, bad] = RAMPS[k];
  const lo0 = Math.min(good, bad);
  const hi0 = Math.max(good, bad);
  const span = hi0 - lo0;
  let lo = lo0 - span * 0.35;
  let hi = hi0 + span * 0.35;
  if (k !== "calib") lo = Math.max(0, lo);
  for (const v of values.filter(isNum)) {
    if (v < lo && span / (hi - v) >= 0.3) lo = v - span * 0.05;
    if (v > hi && span / (v - lo) >= 0.3) hi = v + span * 0.05;
  }
  return [lo, hi];
}

const tickFmt = (k: SubKey, v: number) => (SUB_META[k].unit === "share" ? fmtTick(v, { pct: true }) : fmtTick(v, { signed: k === "calib" }));

export function RampPlot({
  k,
  width,
  items,
  prog = FULL,
  domain,
  plotH = 72,
  bar = true,
  title,
  barLabel,
}: {
  k: SubKey;
  width: number;
  items: RampItem[];
  prog?: RampProg;
  domain?: [number, number];
  plotH?: number;
  bar?: boolean;
  title?: string;
  barLabel?: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [good, bad] = RAMPS[k];
  const [lo, hi] = domain ?? rampDomain(k, items.map((i) => i.value));
  const L = 30;
  const R = bar ? 64 : 10;
  // A value outside the domain gets an "off axis" note in its own row above the plot, never over the ramp.
  const anyOff = items.some((i) => isNum(i.value) && (i.value < lo || i.value > hi));
  const T = (title ? 14 : 0) + (anyOff ? 32 : 18);
  const pw = Math.max(80, width - L - R);
  const x = linear([lo, hi], [L, L + pw]);
  const y = linear([0, 1], [T + plotH, T]);
  const f = (v: number) => subScore(k, v) ?? 0;
  const lo0 = Math.min(good, bad);
  const hi0 = Math.max(good, bad);
  const pts = [lo, Math.max(lo, lo0), Math.min(hi, hi0), hi].map((v) => `${x(v)},${y(f(v))}`).join(" ");
  const clampX = (v: number) => Math.max(L, Math.min(L + pw, x(v)));
  const baseY = T + plotH;
  const barX = L + pw + 18;
  const totalH = T + plotH + 36;
  const step = (hi - lo) / 100;
  const anchors = anchorLabels(k, x, L, pw, baseY);
  const zw = textWidth(anchors.zero.text);
  const zeroSpan: [number, number] = anchors.zero.anchor === "start" ? [anchors.zero.x, anchors.zero.x + zw] : [anchors.zero.x - zw, anchors.zero.x];
  const clippedHitsZero = (cx: number) => cx + textWidth("clipped") / 2 + 4 > zeroSpan[0] && cx - textWidth("clipped") / 2 - 4 < zeroSpan[1];

  function fromClient(clientX: number): number {
    const svg = svgRef.current;
    if (!svg) return lo;
    const r = svg.getBoundingClientRect();
    const sx = ((clientX - r.left) / Math.max(1, r.width)) * width;
    return Math.max(lo, Math.min(hi, x.invert(sx)));
  }

  const primary = items.find((i) => !i.hollow);
  const ordered = [...items].sort((a, b) => Number(!a.hollow) - Number(!b.hollow));
  return (
    <svg ref={svgRef} width={width} height={totalH} viewBox={`0 0 ${width} ${totalH}`} style={{ touchAction: items.some((i) => i.onDrag) ? "pan-y" : undefined }}>
      {title && (
        <text x={0} y={11} className="ink b">
          {title}
        </text>
      )}
      <rect x={x(lo)} y={T} width={Math.max(0, x(Math.max(lo, lo0)) - x(lo))} height={plotH} fill="var(--track)" opacity={prog.ramp} />
      <rect x={x(Math.min(hi, hi0))} y={T} width={Math.max(0, x(hi) - x(Math.min(hi, hi0)))} height={plotH} fill="var(--track)" opacity={prog.ramp} />
      <line x1={L} x2={L + pw} y1={baseY} y2={baseY} stroke="var(--rule-strong)" />
      <line x1={L} x2={L} y1={T} y2={baseY} stroke="var(--rule-strong)" />
      {[0, 1].map((t) => (
        <text key={t} x={L - 5} y={y(t)} dy="0.32em" textAnchor="end">
          {t}
        </text>
      ))}
      {niceTicks(lo, hi, pw < 200 ? 3 : 4).map((t) => (
        <g key={t} transform={`translate(${x(t)},${baseY})`}>
          <line y2={3} stroke="var(--rule-strong)" />
          <text y={14} textAnchor="middle">
            {tickFmt(k, t)}
          </text>
        </g>
      ))}
      <text x={L} y={baseY + 28} className="ink2">
        {SUB_META[k].feature}
        {SUB_META[k].unit === "nats" ? ", nats" : ", %"} (linear)
      </text>
      {prog.ramp > 0 && (
        <>
          <polyline points={pts} fill="none" stroke="var(--ink)" strokeWidth={1.5} pathLength={1} strokeDasharray={prog.ramp < 1 ? `${easeInOut(prog.ramp)} 1` : undefined} />
          <g opacity={prog.ramp} className="halo">
            <text x={x(good) + (k === "calib" ? -4 : 4)} y={T - 5} textAnchor={k === "calib" ? "end" : "start"}>
              1 at {tickFmt(k, good)}
            </text>
            <text x={anchors.zero.x} y={anchors.zero.y} textAnchor={anchors.zero.anchor}>
              {anchors.zero.text}
            </text>
          </g>
        </>
      )}
      {bar && (
        <g>
          <rect x={barX} y={T} width={8} height={plotH} fill={primary && isNum(primary.value) ? "var(--track)" : "url(#hatch)"} />
          {barLabel && (
            <text x={barX + 4} y={T - 5} textAnchor="middle">
              {barLabel}
            </text>
          )}
        </g>
      )}
      {ordered.map((it) => {
        if (!isNum(it.value)) return null;
        const sc = isNum(it.score) ? it.score : f(it.value);
        const vx = clampX(it.value);
        const off = it.value < lo || it.value > hi;
        const gp = easeSettle(prog.glyph);
        const dropY = lerp(baseY, y(sc), easeSettle(prog.drop));
        const ro = easeInOut(prog.readoff);
        const clipped = (sc === 0 || sc === 1) && !off;
        const slider = !!it.onDrag;
        const pScore = primary && isNum(primary.value) ? (isNum(primary.score) ? primary.score : f(primary.value)) : null;
        const hollowDy = (v: number): number => {
          if (!it.hollow || pScore === null || Math.abs(y(v) - y(pScore)) >= 13) return 4;
          return y(pScore) + 14 - y(v) + 4;
        };
        const valueText = `${SUB_META[k].feature} ${fmtFeature(k, it.value)}, sub-score ${fmtNum(sc, "score")}`;
        const onKey = (e: KeyboardEvent<SVGGElement>) => {
          if (!it.onDrag) return;
          let v = it.value as number;
          if (e.key === "ArrowRight" || e.key === "ArrowUp") v += step;
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") v -= step;
          else if (e.key === "PageUp") v += step * 10;
          else if (e.key === "PageDown") v -= step * 10;
          else if (e.key === "Home") v = lo;
          else if (e.key === "End") v = hi;
          else return;
          e.preventDefault();
          e.stopPropagation();
          it.onDrag(Math.max(lo, Math.min(hi, v)));
        };
        const onDown = (e: PointerEvent<SVGGElement>) => {
          if (!it.onDrag) return;
          e.preventDefault();
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          (e.currentTarget as SVGGElement).focus();
          it.onDrag(fromClient(e.clientX));
        };
        const onMove = (e: PointerEvent<SVGGElement>) => {
          if (!it.onDrag || !(e.currentTarget as Element).hasPointerCapture?.(e.pointerId)) return;
          it.onDrag(fromClient(e.clientX));
        };
        return (
          <g key={it.id}>
            {prog.drop > 0 && (
              <>
                <line x1={vx} x2={vx} y1={baseY} y2={dropY} stroke={it.hollow ? "var(--ink-3)" : "var(--ink-2)"} strokeDasharray="2 2" />
                {prog.drop >= 1 && <circle cx={vx} cy={y(sc)} r={2.5} fill={it.hollow ? "var(--bg-plate)" : "var(--ink)"} stroke="var(--ink)" />}
              </>
            )}
            {bar && ro > 0 && <line x1={vx} x2={lerp(vx, barX, ro)} y1={y(sc)} y2={y(sc)} stroke={it.hollow ? "var(--ink-3)" : "var(--ink-2)"} strokeDasharray="2 2" />}
            {bar && ro > 0 && !it.hollow && <rect x={barX} y={lerp(baseY, y(sc), ro)} width={8} height={baseY - lerp(baseY, y(sc), ro)} fill="var(--bar)" />}
            {bar && ro > 0 && it.hollow && <line x1={barX - 3} x2={barX + 11} y1={y(sc)} y2={y(sc)} stroke="var(--ink-2)" strokeWidth={1.5} />}
            {bar && ro >= 1 && (
              <text x={barX + 14} y={y(sc)} dy={hollowDy(sc)} className={it.hollow ? "ink2" : "ink b"}>
                {fmtNum(sc, "score")}
              </text>
            )}
            {prog.drop >= 1 && clipped && !it.hollow && (
              // kept right of the y-axis tick column and left of the plot's right edge
              <text {...clampLabel(vx, textWidth("clipped") / 2, L + 4, L + pw)} y={y(sc) + (sc > 0.5 ? 13 : clippedHitsZero(vx) ? -19 : -6)} className="it halo">
                clipped
              </text>
            )}
            {gp > 0 && (
              <g
                className={slider ? "xp-slider" : undefined}
                tabIndex={slider ? 0 : undefined}
                role={slider ? "slider" : undefined}
                aria-label={slider ? `${it.name ?? it.label ?? it.id}: drag or use arrow keys to change ${SUB_META[k].feature}` : undefined}
                aria-valuemin={slider ? lo : undefined}
                aria-valuemax={slider ? hi : undefined}
                aria-valuenow={slider ? it.value : undefined}
                aria-valuetext={slider ? valueText : undefined}
                onKeyDown={slider ? onKey : undefined}
                onPointerDown={slider ? onDown : undefined}
                onPointerMove={slider ? onMove : undefined}
                transform={`translate(0,${lerp(-24, 0, gp)})`}
                opacity={gp}
              >
                {!slider && <title>{`${it.name ?? it.label ?? it.id}: ${valueText}`}</title>}
                {slider && <rect x={vx - 12} y={baseY - 14} width={24} height={28} fill="transparent" />}
                <GlyphShape stage={it.stage} x={vx} y={baseY} size={slider ? 10 : 8} hollow={it.hollow} />
                {slider && <circle className="xp-slider-ring" cx={vx} cy={baseY} r={9} />}
                {it.label && (
                  <text x={vx} y={baseY - 10} textAnchor="middle" className={it.hollow ? "ink2" : "ink"} style={{ fontSize: 10 }}>
                    {it.label}
                  </text>
                )}
                {off && (
                  <text x={it.value < lo ? L : L + pw} y={T - 19} textAnchor={it.value < lo ? "start" : "end"} className="ink">
                    {it.value < lo ? "← " : ""}
                    {fmtFeature(k, it.value)} off axis{it.value > hi ? " →" : ""}
                  </text>
                )}
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Where the "0 at <anchor>" label goes: above the flat-at-0 segment (left of the knee for calib, right of it for the
 * others), never on the slope. If the flat segment is too short for the text, the label is lifted a row so it clears
 * the slope next to the knee.
 */
export function anchorLabels(
  k: SubKey,
  x: (v: number) => number,
  L: number,
  pw: number,
  baseY: number,
): { zero: { x: number; y: number; anchor: "start" | "end"; text: string } } {
  const [, bad] = RAMPS[k];
  const text = `0 at ${tickFmt(k, bad)}`;
  const tw = textWidth(text);
  const kx = x(bad);
  const flatLeft = k === "calib"; // calib rises to the right from its 0-anchor; the others fall to the right
  const room = flatLeft ? kx - 4 - (L + 3) : L + pw - 3 - (kx + 4);
  const fits = room >= tw;
  const lx = flatLeft ? (fits ? kx - 4 : L + 3) : fits ? kx + 4 : L + pw - 3;
  return { zero: { x: lx, y: baseY - (fits ? 5 : 17), anchor: flatLeft ? (fits ? "end" : "start") : fits ? "start" : "end", text } };
}
