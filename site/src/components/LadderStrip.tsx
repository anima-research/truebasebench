import { useMemo } from "react";
import type { Bundle, Model, Stage } from "../data/types";
import { ladder, ladderColumns, median, STAGE_CODE, stageOrder } from "../data/derive";
import { fmt, fmtNum } from "../lib/numfmt";
import { beeswarm, linear } from "../lib/scale";
import { ChartFrame, Mark, TipBody } from "./Chart";
import { GlyphShape } from "./Glyph";
import { XAxis, xTitleExtra } from "./Axis";

const ROW = 36;
/** Vertical step between stacked glyphs: glyph size (8) + 1px, so neighbours never touch. */
const STACK = 9;
const GUTTER = 14;

/** Plate 0: overall score by stage, one row per stage, beeswarm glyphs, family highlight on hover. */
export function LadderStrip({
  bundle,
  models,
  highlightFamily,
  onFamily,
}: {
  bundle: Bundle;
  models: Model[];
  highlightFamily: string | null;
  onFamily: (f: string | null) => void;
}) {
  const scored = models.filter((m) => m.score !== null);
  const byStage = useMemo(() => {
    const out = new Map<Stage, Model[]>();
    for (const s of stageOrder) out.set(s, scored.filter((m) => m.stage === s));
    return out;
  }, [scored]);
  const label = `Overall score by stage for ${scored.length} checkpoints. ` +
    stageOrder
      .map((s) => {
        const xs = byStage.get(s)!.map((m) => m.score!);
        return xs.length ? `${s}: n = ${xs.length}, median ${fmt(median(xs), "score")}` : `${s}: none`;
      })
      .join("; ");
  return (
    <ChartFrame ariaLabel={label}>
      {(w) => {
        const phone = w < 560;
        const left = phone ? 74 : 112;
        const right = 14;
        const x = linear([0, 1], [left, w - right]);
        const top = 4;
        const rowY = (i: number) => top + i * (ROW + GUTTER) + ROW / 2;
        const title = phone ? "overall score (1 = pre-anneal-like; not 'better')" : "overall score (1 = indistinguishable from a pre-anneal checkpoint; not 'better')";
        const height = top + stageOrder.length * (ROW + GUTTER) + 44 + xTitleExtra(title, w - right - left);
        const axisY = top + stageOrder.length * (ROW + GUTTER) + 6;
        // Label anchored so it stays inside [left, w]: end-anchored near the right edge, start-anchored near the left.
        const edgeAnchor = (px: number, halfWidth: number) =>
          px > w - right - halfWidth ? { x: Math.min(px + 4, w - 2), anchor: "end" as const } : px < left + halfWidth ? { x: Math.max(px - 4, left), anchor: "start" as const } : { x: px, anchor: "middle" as const };
        // positions
        const pos = new Map<string, { x: number; y: number }>();
        stageOrder.forEach((s, i) => {
          const ms = byStage.get(s)!;
          const xs = ms.map((m) => x(m.score!));
          const slots = beeswarm(xs, STACK, 3); // 0, +1, −1 fit the row; ±2 only for a fourth or fifth collision
          ms.forEach((m, j) => pos.set(m.id, { x: xs[j], y: rowY(i) + slots[j] * STACK }));
        });
        const fam = highlightFamily ? ladderColumns(ladder(bundle, highlightFamily).filter((m) => pos.has(m.id))) : [];
        return (
          <svg width={w} height={height}>
            {stageOrder.map((s, i) => {
              const ms = byStage.get(s)!;
              const med = median(ms.map((m) => m.score!));
              const y0 = rowY(i) - ROW / 2;
              return (
                <g key={s}>
                  <rect x={left} y={y0} width={w - left - right} height={ROW} fill="var(--bg)" opacity={0.55} />
                  <GlyphShape stage={s} x={8} y={rowY(i)} size={10} />
                  <text x={18} y={rowY(i)} dy="0.32em" style={{ fill: "var(--ink)", fontWeight: 600 }}>
                    {STAGE_CODE[s]}
                  </text>
                  <text x={phone ? 18 : 54} y={rowY(i)} dy={phone ? "1.5em" : "0.32em"}>
                    n = {ms.length}
                  </text>
                  {med !== null && (
                    <g>
                      <line x1={x(med)} x2={x(med)} y1={y0 - 2} y2={y0 + ROW + 4} stroke="var(--ink)" strokeWidth={1} />
                      {(() => {
                        const a = edgeAnchor(x(med), 36);
                        return (
                          <text x={a.x} y={y0 + ROW + 12} textAnchor={a.anchor} style={{ fontSize: 11 }}>
                            median {fmtNum(med, "score")}
                          </text>
                        );
                      })()}
                    </g>
                  )}
                </g>
              );
            })}
            {fam.length > 1 && (
              <polyline
                points={fam
                  .map((col) => {
                    const p = pos.get(col[col.length - 1].id)!;
                    return `${p.x},${p.y}`;
                  })
                  .join(" ")}
                fill="none"
                stroke="var(--ink-2)"
                strokeWidth={1}
              />
            )}
            {stageOrder.flatMap((s) =>
              byStage.get(s)!.map((m) => {
                const p = pos.get(m.id)!;
                const dim = highlightFamily !== null && m.family !== highlightFamily;
                return (
                  <Mark
                    key={m.id}
                    x={p.x}
                    y={p.y}
                    href={`/model/${encodeURIComponent(m.id)}`}
                    label={`${m.family} ${m.label}, ${m.stage}, overall ${fmt(m.score, "score")}`}
                    tip={<TipBody title={`${m.family} · ${m.label}`} lines={[`overall ${fmtNum(m.score, "score")} · ${m.stage}`]} path={`models[${m.id}].score`} />}
                    onHover={(on) => onFamily(on ? m.family : null)}
                  >
                    <g opacity={dim ? 0.3 : 1}>
                      <GlyphShape stage={m.stage} x={p.x} y={p.y} size={highlightFamily === m.family ? 9 : 7} />
                    </g>
                  </Mark>
                );
              }),
            )}
            <XAxis
              scale={x}
              y={axisY}
              ticks={phone ? [0, 0.5, 1] : [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1]}
              format={(v) => (v === 0 || v === 1 ? String(v) : v.toFixed(1).replace(/^0/, ""))}
              title={title}
              titleOffset={32}
            />
          </svg>
        );
      }}
    </ChartFrame>
  );
}
