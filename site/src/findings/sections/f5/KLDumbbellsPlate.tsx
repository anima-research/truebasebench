/**
 * Plate F5a figure (owned by F5): a KL(Census‖model) dumbbell per checkpoint on a log axis.
 *   filled end = few-shot KL (with its 3-frame range as a whisker), hollow end = described KL;
 *   --band = the clean range (pre-anneal and clean bases, E4 idiom) with a live Num label;
 *   2px --ink tick in the label gutter = counted in the clean range; the specimen row rides --hl;
 *   hover dims the other families; tags ('exception') print after the dumbbell.
 * Unmeasured checkpoints are not drawn here: the section lists them in a NullPlate line under the figure.
 */
import { useState } from "react";
import { XAxis } from "../../../components/Axis";
import { ChartFrame, Mark, TipBody } from "../../../components/Chart";
import { GlyphShape } from "../../../components/Glyph";
import { Num } from "../../../components/Num";
import { CiWhisker, RangeBand, rowLabel, TagText, tipTitle } from "../../../charts/findings/common";
import { withCI } from "../../../charts/TailPriorCharts";
import { path } from "../../../data/bundle";
import { ciBounds } from "../../../data/ci";
import { STAGE_CODE, STAGE_NAME, stageOrder } from "../../../data/derive";
import type { Model } from "../../../data/types";
import { fmt, fmtNum, isNum } from "../../../lib/numfmt";
import { log10Scale, textWidth } from "../../../lib/scale";

const href = (m: Model) => `/model/${encodeURIComponent(m.id)}`;
const KL_LO = 0.1;
const KL_HI = 10;

/** Rows in plate order: grouped by stage, sorted by few-shot KL inside each stage. */
export function klRows(models: Model[]): Model[] {
  const ms = models.filter((m) => m.surnames && (isNum(m.surnames.KL_few) || isNum(m.surnames.KL_desc)));
  return stageOrder.flatMap((s) => ms.filter((m) => m.stage === s).sort((a, b) => (a.surnames!.KL_few ?? 99) - (b.surnames!.KL_few ?? 99)));
}

export function KLDumbbellsPlate({
  rows: ms,
  range,
  cleanIds,
  specimenId,
  tags = {},
}: {
  rows: Model[];
  /** the clean range [min, max] of few-shot KL; null draws no band */
  range: [number, number] | null;
  cleanIds: Set<string>;
  specimenId?: string;
  /** in-figure tag per model id ('exception') */
  tags?: Record<string, string>;
}) {
  const [hoverFam, setHoverFam] = useState<string | null>(null);
  const rows = ms.map((m, i) => ({ m, gap: i > 0 && ms[i - 1].stage !== m.stage }));
  const aria =
    `KL(Census‖model), few-shot (filled) and described (hollow), log axis, for ${ms.length} checkpoints` +
    (range ? `; the clean range of few-shot KL is ${fmt(range[0], "kl")} to ${fmt(range[1], "kl")}` : "") +
    ": " +
    ms.map((m) => `${m.family} ${m.label} (${STAGE_CODE[m.stage]}${cleanIds.has(m.id) ? ", clean" : ""}) few-shot ${fmt(m.surnames!.KL_few ?? null, "kl")}, described ${fmt(m.surnames!.KL_desc ?? null, "kl")}`).join("; ");
  return (
    <ChartFrame ariaLabel={aria}>
      {(w) => {
        // label gutter: as wide as the longest row label (capped), so the clean ticks sit next to the text
        const Lmax = Math.min(190, Math.floor(w * 0.45));
        const maxChars = Math.floor((Lmax - 10) / 5.5);
        const widest = Math.max(0, ...ms.map((m) => textWidth(rowLabel(m, ms, maxChars))));
        const L = Math.min(Lmax, Math.ceil(widest) + 14);
        const rh = 17;
        const top = range ? 24 : 6; // room for the band label above the first row
        let yy = top;
        const ys = rows.map((r) => {
          yy += r.gap ? 10 : 0;
          const v = yy + rh / 2;
          yy += rh;
          return v;
        });
        const x0 = log10Scale([KL_LO, KL_HI], [L, w - 14]);
        const clampKL = (v: number) => Math.max(KL_LO, Math.min(KL_HI, v));
        const offKL = (v: number) => v < KL_LO || v > KL_HI;
        const x = Object.assign((v: number) => x0(clampKL(v)), x0) as typeof x0;
        const axisY = yy + 2;
        const H = axisY + 30 + 14 + 4;
        const bandX0 = range ? x(range[0]) : 0;
        const bandX1 = range ? x(range[1]) : 0;
        return (
          <svg width={w} height={H}>
            {/* specimen row on --hl, under everything */}
            {rows.map(({ m }, i) =>
              m.id === specimenId ? <rect key={"hl" + m.id} x={0} y={ys[i] - rh / 2} width={w} height={rh} fill="var(--hl)" /> : null,
            )}
            {x.ticks().map((t) => (
              <line key={t} x1={x(t)} x2={x(t)} y1={top - 4} y2={yy} stroke="var(--rule)" />
            ))}
            {range && (
              <g>
                <RangeBand x={bandX0} y={4} width={bandX1 - bandX0} height={yy - 4} />
                <foreignObject x={bandX0 + 2} y={3} width={260} height={20}>
                  <span className="band-label" style={{ display: "block", lineHeight: "20px" }}>
                    clean range <Num path="findings.f5.cleanRange[0]" value={range[0]} fmt="kl" derived="min KL_few over pre-anneal checkpoints and clean bases" />–
                    <Num path="findings.f5.cleanRange[1]" value={range[1]} fmt="kl" derived="max KL_few over pre-anneal checkpoints and clean bases" />
                  </span>
                </foreignObject>
              </g>
            )}
            {rows.map(({ m }, i) => {
              const f = m.surnames!.KL_few;
              const d = m.surnames!.KL_desc;
              const b = ciBounds(m, "KL_few");
              const nFrames = m.ci?.KL_few?.n_frames;
              const isSpec = m.id === specimenId;
              const clean = cleanIds.has(m.id);
              const dim = hoverFam !== null && hoverFam !== m.family;
              const lines = [
                `${STAGE_CODE[m.stage]} ${STAGE_NAME[m.stage]}${clean ? " · counted in the clean range" : ""}`,
                `few-shot KL ${withCI(f ?? null, b, "kl")}`,
                ...(b ? [`range over ${isNum(nFrames) ? nFrames : "the"} frames, not a CI`] : []),
                `described KL ${fmt(d ?? null, "kl")}`,
              ];
              const hover = (on: boolean) => setHoverFam(on ? m.family : null);
              const tag = tags[m.id];
              const right = Math.max(isNum(f) ? x(f) : L, isNum(d) ? x(d) : L);
              const left = Math.min(isNum(f) ? x(f) : w, isNum(d) ? x(d) : w);
              const tagFits = tag ? right + 9 + textWidth(tag) <= w : false;
              return (
                <g key={m.id} opacity={dim ? 0.45 : 1}>
                  {clean && <rect x={0} y={ys[i] - rh / 2 + 2} width={2} height={rh - 4} fill="var(--ink)" />}
                  <text x={L - 8} y={ys[i]} dy="0.32em" textAnchor="end" style={{ fill: isSpec ? "var(--ink)" : "var(--ink-2)", fontWeight: isSpec ? 600 : 400 }}>
                    {rowLabel(m, ms, maxChars)}
                  </text>
                  {isNum(f) && isNum(d) && <line x1={x(f)} x2={x(d)} y1={ys[i]} y2={ys[i]} stroke="var(--ink-3)" />}
                  {b && <CiWhisker x1={x(b[0])} x2={x(b[1])} y1={ys[i]} />}
                  {isNum(d) && (
                    <Mark
                      x={x(d)}
                      y={ys[i]}
                      href={href(m)}
                      label={`${m.family} ${m.label}: described KL ${fmt(d, "kl")}`}
                      tip={<TipBody title={tipTitle(m)} lines={lines} path={path(m, "surnames.KL_desc")} />}
                      onHover={hover}
                    >
                      <GlyphShape stage={m.stage} x={x(d)} y={ys[i]} size={7} hollow />
                    </Mark>
                  )}
                  {isNum(f) && (
                    <Mark
                      x={x(f)}
                      y={ys[i]}
                      href={href(m)}
                      label={`${m.family} ${m.label}: few-shot KL ${fmt(f, "kl")}${b ? `, range ${fmt(b[0], "kl")} to ${fmt(b[1], "kl")} over ${isNum(nFrames) ? nFrames : "the"} frames` : ""}`}
                      tip={<TipBody title={tipTitle(m)} lines={lines} path={path(m, "surnames.KL_few")} />}
                      onHover={hover}
                    >
                      <GlyphShape stage={m.stage} x={x(f)} y={ys[i]} size={isSpec ? 9 : 7} />
                    </Mark>
                  )}
                  {[f, d].map((v, j) =>
                    isNum(v) && offKL(v) ? (
                      <text key={j} x={x(v) + (v < KL_LO ? 7 : -7)} y={ys[i] - 5} textAnchor={v < KL_LO ? "start" : "end"} className="halo" style={{ fontSize: 11 }}>
                        {v < KL_LO ? "←" : "→"} {fmtNum(v, "kl")} off axis
                      </text>
                    ) : null,
                  )}
                  {tag &&
                    (tagFits ? (
                      <TagText x={right + 9} y={ys[i]}>
                        {tag}
                      </TagText>
                    ) : (
                      <TagText x={left - 9} y={ys[i]} anchor="end">
                        {tag}
                      </TagText>
                    ))}
                </g>
              );
            })}
            <XAxis scale={x} y={axisY} ticks={[0.1, 1, 10]} format={(v) => String(v)} title="KL(Census‖model), nats, log scale" />
          </svg>
        );
      }}
    </ChartFrame>
  );
}
