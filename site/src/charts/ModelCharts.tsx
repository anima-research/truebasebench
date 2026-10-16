import type { ReactNode } from "react";
import { domainName, ladder, ladderColumns, median, STAGE_CODE, stageOrder } from "../data/derive";
import { CiWhisker, MedianTick, RangeBand, tipLines, tipTitle } from "./findings/common";
import { fp, path } from "../data/bundle";
import type { Bundle, Model, ReliabilityBin, Stage } from "../data/types";
import { ChartFrame, Mark, TipBody } from "../components/Chart";
import { GlyphShape } from "../components/Glyph";
import { XAxis, xTitleExtra, YAxis } from "../components/Axis";
import { cmpNullsLast, fmt, fmtNum, fmtTick, isNum, type Fmt } from "../lib/numfmt";
import { beeswarm, extent, linear, log10Scale, niceTicks, textWidth, wrapText } from "../lib/scale";

const href = (m: Model) => `/model/${encodeURIComponent(m.id)}`;

/** Plate M1: the family's rungs in order, parallel rungs stacked, this model on an --hl band. */
export function SiblingRail({ bundle, model }: { bundle: Bundle; model: Model }) {
  const cols = ladderColumns(ladder(bundle, model.family));
  const maxStack = Math.max(...cols.map((c) => c.length));
  const label = `${model.family} ladder: ` + cols.map((c) => c.map((m) => `${m.label} (${m.stage}) ${fmt(m.score, "score")}`).join(" / ")).join(" → ");
  return (
    <ChartFrame ariaLabel={label}>
      {(w) => {
        const colW = Math.max(84, Math.min(150, (w - 20) / Math.max(1, cols.length)));
        const narrow = colW * cols.length > w;
        const perRow = narrow ? Math.max(1, Math.floor(w / 96)) : cols.length;
        const cw = narrow ? w / perRow : colW;
        const rowH = 22 + maxStack * 46;
        const rows = Math.ceil(cols.length / perRow);
        const pos = (ci: number, si: number) => ({
          x: (ci % perRow) * cw + cw / 2,
          y: Math.floor(ci / perRow) * rowH + 14 + si * 46,
        });
        return (
          <svg width={w} height={rows * rowH}>
            {cols.map((_col, ci) => {
              const p = pos(ci, 0);
              const q = ci + 1 < cols.length ? pos(ci + 1, 0) : null;
              return q && q.y === p.y ? <line key={"l" + ci} x1={p.x} x2={q.x} y1={p.y} y2={q.y} stroke="var(--rule-strong)" /> : null;
            })}
            {cols.flatMap((col, ci) =>
              col.map((m, si) => {
                const p = pos(ci, si);
                const me = m.id === model.id;
                return (
                  <g key={m.id}>
                    {me && <rect x={p.x - cw / 2 + 3} y={p.y - 12} width={cw - 6} height={44} fill="var(--hl)" />}
                    <Mark
                      x={p.x}
                      y={p.y}
                      href={me ? undefined : href(m)}
                      label={`${m.label}, ${m.stage}, overall ${fmt(m.score, "score")}${me ? " (this checkpoint)" : ""}`}
                      tip={<TipBody title={m.label} lines={[`${m.stage} · overall ${fmtNum(m.score, "score")}`]} path={path(m, "score")} />}
                    >
                      <GlyphShape stage={m.stage} x={p.x} y={p.y} size={9} />
                    </Mark>
                    <text x={p.x} y={p.y + 17} textAnchor="middle" style={{ fill: "var(--ink)", fontSize: 11, fontWeight: me ? 600 : 400 }}>
                      {truncate(m.label, Math.floor(cw / 6))}
                    </text>
                    <text x={p.x} y={p.y + 29} textAnchor="middle" style={me ? { fill: "var(--ink)" } : undefined}>
                      {fmtNum(m.score, "score")}
                    </text>
                  </g>
                );
              }),
            )}
          </svg>
        );
      }}
    </ChartFrame>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, Math.max(3, n - 1)) + "…" : s;
}

/** Plate M3: top-1 reliability diagram + 24px count histogram. */
export function ReliabilityDiagram({ model, compare = [] }: { model: Model; compare?: Model[] }) {
  const series = [model, ...compare]
    .map((m) => ({ m, bins: (m.selfboot?.reliability?.bins ?? null) as ReliabilityBin[] | null }))
    .filter((s) => s.bins && s.bins.length);
  const main = series.find((s) => s.m.id === model.id);
  const label =
    `Top-1 reliability on post-cutoff text for ${model.label}: ` +
    (main?.bins ?? []).map((b) => `confidence ${fmtNum(b[3], "num2")} accuracy ${fmtNum(b[4], "num2")}`).join("; ");
  return (
    <ChartFrame ariaLabel={label} maxWidth={380}>
      {(w) => {
        const size = Math.max(220, Math.min(340, w - 50));
        const L = 40;
        const T = 24;
        const x = linear([0, 1], [L, L + size]);
        const y = linear([0, 1], [T + size, T]);
        const maxCount = Math.max(1, ...series.flatMap((s) => s.bins!.map((b) => b[2])));
        const hTop = T + size + 40;
        const hH = 24;
        const mainBins = main?.bins ?? [];
        const maxMain = Math.max(1, ...mainBins.map((b) => b[2]));
        return (
          <svg width={L + size + 10} height={hTop + hH + 30}>
            <rect x={L} y={T} width={size} height={size} fill="var(--bg)" opacity={0.5} />
            <XAxis scale={x} y={T + size} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} format={(v) => String(+v.toFixed(1))} gridTop={T} />
            <YAxis scale={y} x={L} ticks={[0, 0.2, 0.4, 0.6, 0.8, 1]} format={(v) => String(+v.toFixed(1))} gridRight={L + size} />
            <line x1={x(0)} y1={y(0)} x2={x(1)} y2={y(1)} stroke="var(--ink-2)" strokeDasharray="4 3" />
            <text x={x(0.62)} y={y(0.66)} transform={`rotate(-45 ${x(0.62)} ${y(0.66)})`} textAnchor="middle" style={{ fontSize: 11 }}>
              perfectly calibrated
            </text>
            <text x={x(0.97)} y={y(0.06)} textAnchor="end" style={{ fontStyle: "italic" }}>
              over-confident
            </text>
            <text x={x(0.03)} y={y(0.92)} style={{ fontStyle: "italic" }}>
              under-confident
            </text>
            <text x={L + size} y={T + size + 30} textAnchor="end" style={{ fill: "var(--ink-2)" }}>
              mean top-1 confidence (bins[i][3])
            </text>
            <text x={L - 30} y={10} style={{ fill: "var(--ink-2)" }}>
              accuracy (bins[i][4])
            </text>
            {series.map((s) => {
              const hollow = s.m.id !== model.id;
              const pts = s.bins!.filter((b) => isNum(b[3]) && isNum(b[4]) && b[2] > 0);
              return (
                <g key={s.m.id}>
                  <polyline
                    points={pts.map((b) => `${x(b[3]!)},${y(b[4]!)}`).join(" ")}
                    fill="none"
                    stroke={hollow ? "var(--ink-3)" : "var(--ink)"}
                    strokeWidth={1.5}
                    strokeDasharray={hollow ? "4 3" : undefined}
                  />
                  {pts.map((b, i) => {
                    const sz = 4 + 10 * Math.sqrt(b[2] / maxCount);
                    return (
                      <Mark
                        key={i}
                        x={x(b[3]!)}
                        y={y(b[4]!)}
                        label={`${s.m.label}, bin ${fmtNum(b[0], "num2")}–${fmtNum(b[1], "num2")}: confidence ${fmtNum(b[3], "num3")}, accuracy ${fmtNum(b[4], "num3")}, ${fmt(b[2], "count")} positions`}
                        tip={
                          <TipBody
                            title={`${s.m.label} · bin ${fmtNum(b[0], "num2")}–${fmtNum(b[1], "num2")}`}
                            lines={[`confidence ${fmtNum(b[3], "num3")}`, `accuracy ${fmtNum(b[4], "num3")}`, `${fmt(b[2], "count")} positions`]}
                            path={`${path(s.m, "selfboot.reliability.bins")}[${i}]`}
                          />
                        }
                      >
                        <GlyphShape stage={s.m.stage} x={x(b[3]!)} y={y(b[4]!)} size={sz} hollow={hollow} />
                      </Mark>
                    );
                  })}
                </g>
              );
            })}
            {/* count histogram */}
            {mainBins.map((b, i) => {
              const hh = (b[2] / maxMain) * hH;
              return <rect key={i} x={x(b[0]) + 1} width={Math.max(1, x(b[1]) - x(b[0]) - 2)} y={hTop + hH - hh} height={hh} fill="var(--bar)" />;
            })}
            <line x1={L} x2={L + size} y1={hTop + hH} y2={hTop + hH} stroke="var(--rule-strong)" />
            <text x={L} y={hTop + hH + 14}>
              positions per confidence bin (max {fmt(maxMain, "count")})
            </text>
          </svg>
        );
      }}
    </ChartFrame>
  );
}

/** Rows of labelled dots: model filled, compare hollow, sorted by the model's value. */
export function DotRows({
  rows,
  model,
  compare = [],
  fmtKind = "nats",
  axisTitle,
  zero = false,
  band,
}: {
  rows: { key: string; label: string; values: Record<string, number | null>; paths?: Record<string, string> }[];
  model: Model;
  compare?: Model[];
  fmtKind?: Fmt;
  axisTitle: string;
  zero?: boolean;
  band?: number;
}) {
  const all = rows.flatMap((r) => Object.values(r.values));
  const ex = extent(zero ? [...all, 0] : all) ?? [0, 1];
  const pad = (ex[1] - ex[0]) * 0.06 || 0.1;
  const dom: [number, number] = [ex[0] - pad, ex[1] + pad];
  const label = `${axisTitle}: ` + rows.map((r) => `${r.label} ${fmt(r.values[model.id], fmtKind)}`).join("; ");
  return (
    <ChartFrame ariaLabel={label}>
      {(w) => {
        const L = Math.min(150, w * 0.38);
        const x = linear(dom, [L, w - 12]);
        const rh = 20;
        // long axis titles wrap (XAxis) on narrow charts: reserve the extra lines so the unit is never cut off
        const H = rows.length * rh + 40 + xTitleExtra(axisTitle, w - 12 - L);
        return (
          <svg width={w} height={H}>
            {band !== undefined && <rect x={x(-band)} width={x(band) - x(-band)} y={0} height={rows.length * rh} fill="var(--band)" />}
            {zero && <line x1={x(0)} x2={x(0)} y1={0} y2={rows.length * rh} stroke="var(--zero)" strokeWidth={1.5} />}
            {rows.map((r, i) => {
              const cy = i * rh + rh / 2;
              return (
                <g key={r.key}>
                  <line x1={L} x2={w - 12} y1={cy} y2={cy} stroke="var(--rule)" />
                  <text x={L - 8} y={cy} dy="0.32em" textAnchor="end" style={{ fill: "var(--ink-2)" }}>
                    {r.label}
                  </text>
                  {compare.map((c) =>
                    isNum(r.values[c.id]) ? (
                      <Mark
                        key={c.id}
                        x={x(r.values[c.id]!)}
                        y={cy}
                        label={`${c.label}: ${r.label} ${fmt(r.values[c.id], fmtKind)}`}
                        tip={<TipBody title={`${c.label} · ${r.label}`} lines={[fmt(r.values[c.id], fmtKind)]} path={r.paths?.[c.id]} />}
                      >
                        <GlyphShape stage={c.stage} x={x(r.values[c.id]!)} y={cy} size={8} hollow />
                      </Mark>
                    ) : null,
                  )}
                  {isNum(r.values[model.id]) && (
                    <Mark
                      x={x(r.values[model.id]!)}
                      y={cy}
                      label={`${model.label}: ${r.label} ${fmt(r.values[model.id], fmtKind)}`}
                      tip={<TipBody title={`${model.label} · ${r.label}`} lines={[fmt(r.values[model.id], fmtKind)]} path={r.paths?.[model.id]} />}
                    >
                      <GlyphShape stage={model.stage} x={x(r.values[model.id]!)} y={cy} size={8} />
                    </Mark>
                  )}
                </g>
              );
            })}
            <XAxis scale={x} y={rows.length * rh + 2} ticks={niceTicks(dom[0], dom[1], w < 480 ? 3 : 6)} format={(v) => fmtTick(v, { signed: fmtKind === "gap" })} title={axisTitle} />
          </svg>
        );
      }}
    </ChartFrame>
  );
}

export function domainRows(models: Model[], prefix = "F_CE_", sortBy?: Model) {
  const keys = Array.from(new Set(models.flatMap((m) => Object.keys(m.fingerprint ?? {}).filter((k) => k.startsWith(prefix)))));
  const rows = keys.map((k) => ({
    key: k,
    label: domainName(k) ?? k,
    values: Object.fromEntries(models.map((m) => [m.id, fp(m, k)])),
    paths: Object.fromEntries(models.map((m) => [m.id, path(m, ["fingerprint", k])])),
  }));
  if (sortBy) rows.sort((a, b) => cmpNullsLast(a.values[sortBy.id], b.values[sortBy.id]));
  return rows;
}

/**
 * Dot strip of one value for every model, one row per stage (Plate M4, F4, F6). The highlighted model is
 * filled and labelled; compare models are outlined; others are filled at reduced weight.
 * Findings extras (all optional, the model page passes none): `median` ticks per row, a `band`, `ci` whiskers,
 * `tags` after row labels, `noJoinArrow`, `labelOf` (findings pass rowLabel). Values outside an explicit `domain`
 * clamp to the axis end and print '← v off axis'.
 */
export function StageDotStrip({
  bundle,
  value,
  valuePath,
  fmtKind,
  axisTitle,
  highlight,
  compare = [],
  zero = false,
  labelIds = [],
  joinIds = [],
  domain,
  ticks,
  median: showMedian = false,
  band,
  ci,
  tags = {},
  noJoinArrow = false,
  labelOf,
  metricName = "",
  ciKey,
  showMissing = true,
  logScale = false,
  boundOf,
}: {
  bundle: Bundle;
  value: (m: Model) => number | null;
  valuePath: (m: Model) => string;
  fmtKind: Fmt;
  axisTitle: string;
  highlight?: string;
  compare?: string[];
  zero?: boolean;
  labelIds?: string[];
  joinIds?: string[];
  domain?: [number, number];
  ticks?: number[];
  /** a MedianTick per stage row, value printed under it */
  median?: boolean;
  band?: { lo: number; hi: number; label: string };
  ci?: (m: Model) => [number, number] | null;
  /** tag text printed after a labelled model's label (e.g. 'exception') */
  tags?: Record<string, string>;
  /** join polyline without the arrow head */
  noJoinArrow?: boolean;
  /** row label text (default: the model's label) */
  labelOf?: (m: Model) => string;
  /** metric name for the tooltip's value line ('<name> <value>') */
  metricName?: string;
  /** `ci.<key>` entry for the tooltip's interval */
  ciKey?: string;
  /** false: the caller lists unmeasured checkpoints itself (a NullPlate sentence, DESIGN §11.6) instead of the in-figure line */
  showMissing?: boolean;
  /** log₁₀ axis (positive values only); ticks at powers of ten */
  logScale?: boolean;
  /** rows whose value is a lower bound: hollow glyph with a "≥" beside it (the off-axis idiom) */
  boundOf?: (m: Model) => boolean;
}) {
  const ms = bundle.models.filter((m) => isNum(value(m)) && (!logScale || value(m)! > 0));
  const ex = domain ?? extent(zero && !logScale ? [...ms.map(value), 0] : ms.map(value)) ?? (logScale ? [0.001, 1] : [0, 1]);
  const pad = domain ? 0 : (ex[1] - ex[0]) * 0.05 || 0.05;
  const dom: [number, number] = logScale ? (domain ?? [ex[0] / 1.5, ex[1] * 1.5]) : [ex[0] - pad, ex[1] + pad];
  const logTicks = (() => {
    const out: number[] = [];
    if (!logScale || !(dom[0] > 0) || !Number.isFinite(dom[1])) return out;
    for (let e = Math.ceil(Math.log10(dom[0]) - 1e-9); e <= Math.floor(Math.log10(dom[1]) + 1e-9) && out.length < 12; e++) out.push(10 ** e);
    return out;
  })();
  const clampV = (v: number) => Math.max(dom[0], Math.min(dom[1], v));
  const offAxis = (v: number) => v < dom[0] || v > dom[1];
  const labelText = (m: Model) => (labelOf ? labelOf(m) : m.label);
  const missing = showMissing ? bundle.models.filter((m) => !isNum(value(m))) : [];
  const stages = stageOrder.filter((s) => ms.some((m) => m.stage === s));
  const aria =
    `${axisTitle}, by stage: ` +
    stages.map((s) => `${s}: ${ms.filter((m) => m.stage === s).map((m) => `${m.label} ${fmt(value(m), fmtKind)}`).join(", ")}`).join("; ");
  return (
    <ChartFrame ariaLabel={aria}>
      {(w) => {
        const L = 52;
        const x = logScale ? log10Scale(dom, [L, w - 14]) : linear(dom, [L, w - 14]);
        // median rows are taller: the tick's value prints under the row
        const rh = showMedian ? 44 : 34;
        const LANE = 14;
        const missLines = missing.length ? wrapText(`not measured: ${missing.map((m) => m.label).join(", ")}`, w - 8) : [];
        // Direct labels go into label lanes above their stage row (never over the row's glyphs), packed 1-D:
        // a label takes the lowest lane where it does not overlap another label; a leader joins it to its glyph.
        const labelled = ms.filter((m) => m.id === highlight || labelIds.includes(m.id));
        const labels = new Map<string, { text: string; tag?: string; x0: number; x1: number; lane: number }>();
        const lanesOf = stages.map((s) => {
          const taken: { x0: number; x1: number; lane: number }[] = [];
          let n = 0;
          for (const m of labelled.filter((q) => q.stage === s).sort((a, b) => value(a)! - value(b)!)) {
            const text = `${labelText(m)} ${fmtNum(value(m), fmtKind)}`;
            const tag = tags[m.id];
            const tw = textWidth(text + (tag ? ` ${tag}` : ""));
            const x0 = Math.max(2, Math.min(x(clampV(value(m)!)) - 4, w - 2 - tw));
            const x1 = x0 + tw;
            let lane = 0;
            while (taken.some((t) => t.lane === lane && x0 < t.x1 + 6 && t.x0 < x1 + 6)) lane++;
            taken.push({ x0, x1, lane });
            labels.set(m.id, { text, tag, x0, x1, lane });
            n = Math.max(n, lane + 1);
          }
          return n;
        });
        const rowTop: number[] = [];
        stages.forEach((_, i) => rowTop.push(i ? rowTop[i - 1] + rh + lanesOf[i - 1] * LANE : 0));
        const rowY = (i: number) => rowTop[i] + lanesOf[i] * LANE + (showMedian ? 17 : rh / 2);
        const rowsH = stages.length ? rowTop[stages.length - 1] + rh + lanesOf[stages.length - 1] * LANE : 0;
        const H = rowsH + 44 + Math.max(0, missLines.length - 1) * 14 + (axisTitle ? xTitleExtra(axisTitle, w - 14 - L) : 0);
        const pos = new Map<string, { x: number; y: number }>();
        stages.forEach((s: Stage, i) => {
          const row = ms.filter((m) => m.stage === s);
          const xs = row.map((m) => x(clampV(value(m)!)));
          const slots = beeswarm(xs, 8, 3);
          row.forEach((m, j) => pos.set(m.id, { x: xs[j], y: rowY(i) + slots[j] * 6 }));
        });
        const joins = joinIds.map((id) => pos.get(id)).filter(Boolean) as { x: number; y: number }[];
        const vFmt: Fmt = fmtKind === "gap" ? "signed" : fmtKind;
        return (
          <svg width={w} height={H}>
            {band && <RangeBand x={x(clampV(band.lo))} y={0} width={x(clampV(band.hi)) - x(clampV(band.lo))} height={rowsH} label={band.label} />}
            {stages.map((s, i) => (
              <g key={s}>
                <line x1={L} x2={w - 14} y1={rowY(i)} y2={rowY(i)} stroke="var(--rule)" />
                <GlyphShape stage={s} x={8} y={rowY(i)} size={9} />
                <text x={17} y={rowY(i)} dy="0.32em" style={{ fill: "var(--ink)", fontWeight: 600 }}>
                  {STAGE_CODE[s]}
                </text>
              </g>
            ))}
            {zero && dom[0] < 0 && dom[1] > 0 && <line x1={x(0)} x2={x(0)} y1={0} y2={rowsH} stroke="var(--zero)" strokeWidth={1.5} />}
            {showMedian &&
              stages.map((s, i) => {
                const med = median(ms.filter((m) => m.stage === s).map((m) => value(m)!));
                return med === null ? null : <MedianTick key={"med" + s} x={x(clampV(med))} y={rowY(i)} value={med} fmt={vFmt} />;
              })}
            {joins.length > 1 && (
              <polyline points={joins.map((p) => `${p.x},${p.y}`).join(" ")} fill="none" stroke="var(--ink)" strokeWidth={1} markerEnd={noJoinArrow ? undefined : "url(#arrow)"} />
            )}
            {ci &&
              ms.map((m) => {
                const b = ci(m);
                const p = pos.get(m.id)!;
                return b ? <CiWhisker key={"ci" + m.id} x1={x(clampV(b[0]))} x2={x(clampV(b[1]))} y1={p.y} /> : null;
              })}
            {ms.map((m) => {
              const p = pos.get(m.id)!;
              const isHl = m.id === highlight;
              const isCmp = compare.includes(m.id);
              const fade = highlight !== undefined && !isHl && !isCmp;
              return (
                <Mark
                  key={m.id}
                  x={p.x}
                  y={p.y}
                  href={`/model/${encodeURIComponent(m.id)}`}
                  label={`${m.label} (${m.family}), ${m.stage}: ${fmt(value(m), fmtKind)}`}
                  tip={<TipBody title={tipTitle(m)} lines={tipLines(m, metricName, value(m), fmtKind, ciKey)} path={valuePath(m)} />}
                >
                  {isHl && <circle cx={p.x} cy={p.y} r={8} fill="var(--hl)" />}
                  <g opacity={fade ? 0.45 : 1}>
                    <GlyphShape stage={m.stage} x={p.x} y={p.y} size={isHl ? 9 : 7} hollow={isCmp || !!boundOf?.(m)} />
                    {boundOf?.(m) && (
                      <text x={p.x + 6} y={p.y + 4} className="halo" style={{ fontSize: 10, fill: "var(--ink-2)" }}>
                        ≥
                      </text>
                    )}
                  </g>
                </Mark>
              );
            })}
            {ms.map((m) => {
              const v = value(m)!;
              if (!offAxis(v)) return null;
              const p = pos.get(m.id)!;
              return (
                <text key={"off" + m.id} x={p.x + (v < dom[0] ? 7 : -7)} y={p.y - 5} textAnchor={v < dom[0] ? "start" : "end"} className="halo" style={{ fontSize: 11 }}>
                  {v < dom[0] ? "←" : "→"} {fmtNum(v, vFmt)} off axis
                </text>
              );
            })}
            {labelled.map((m) => {
              const p = pos.get(m.id)!;
              const lb = labels.get(m.id)!;
              const i = stages.indexOf(m.stage);
              const base = rowTop[i] + lanesOf[i] * LANE + 2 - lb.lane * LANE; // text baseline of this lane
              return (
                <g key={"lab" + m.id}>
                  <line x1={p.x} x2={p.x} y1={p.y - 5} y2={base + 2} stroke="var(--ink-3)" strokeWidth={1} />
                  <text x={lb.x0} y={base} className="halo" style={{ fill: "var(--ink)" }}>
                    {lb.text}
                    {lb.tag && <tspan className="tag"> {lb.tag}</tspan>}
                  </text>
                </g>
              );
            })}
            <XAxis
              scale={x}
              y={rowsH + 2}
              ticks={ticks ?? (logScale ? logTicks : niceTicks(dom[0], dom[1], w < 480 ? 4 : 7))}
              format={(v) => (logScale ? (v >= 1 ? String(v) : v.toFixed(Math.max(0, -Math.floor(Math.log10(v))))) : fmtTick(v, { pct: fmtKind === "pct", signed: fmtKind === "gap" }))}
              title={axisTitle}
            />
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

/** Horizontal bars on a shared linear axis (M5 effective number of surnames, E3 top-10 mass). */
export function HBars({
  bars,
  max,
  axisTitle,
  fmtKind,
  secondary,
}: {
  bars: { label: string; value: number | null; path: string; ghost?: boolean }[];
  max: number;
  axisTitle: string;
  fmtKind: Fmt;
  secondary?: (v: number) => string;
}) {
  return (
    <ChartFrame ariaLabel={`${axisTitle}: ` + bars.map((b) => `${b.label} ${fmt(b.value, fmtKind)}`).join("; ")}>
      {(w) => {
        const L = Math.min(170, w * 0.4);
        const x = linear([0, max], [L, w - 60]);
        const rh = 24;
        const ticks = niceTicks(0, max, w < 480 ? 3 : 5);
        // secondary tick labels are wider than the primary ones: drop any that would touch its left neighbour
        const secTicks: number[] = [];
        if (secondary)
          for (const t of ticks.filter((v) => v > 0)) {
            const prev = secTicks[secTicks.length - 1];
            const need = (textWidth(secondary(t)) + (prev === undefined ? 0 : textWidth(secondary(prev)))) / 2 + 8;
            if (prev === undefined || x(t) - x(prev) >= need) secTicks.push(t);
          }
        const secTitle = secondary ? wrapText(axisTitle, w - L - 4) : [];
        const H = bars.length * rh + (secondary ? 44 + secTitle.length * 14 : 40) + (secondary ? 0 : xTitleExtra(axisTitle, w - 60 - L));
        return (
          <svg width={w} height={H}>
            {bars.map((b, i) => (
              <g key={b.label}>
                <text x={L - 8} y={i * rh + 12} dy="0.32em" textAnchor="end" style={{ fill: "var(--ink-2)" }}>
                  {b.label}
                </text>
                <rect x={L} y={i * rh + 5} width={x(max) - L} height={14} fill="var(--track)" />
                {isNum(b.value) ? (
                  <Mark x={x(b.value)} y={i * rh + 12} label={`${b.label}: ${fmt(b.value, fmtKind)}`} tip={<TipBody title={b.label} lines={[fmt(b.value, fmtKind)]} path={b.path} />}>
                    <rect
                      x={L}
                      y={i * rh + 5}
                      width={Math.max(0, x(Math.min(b.value, max)) - L)}
                      height={14}
                      fill={b.ghost ? "none" : "var(--bar)"}
                      stroke={b.ghost ? "var(--ink)" : "none"}
                    />
                  </Mark>
                ) : (
                  <rect x={L} y={i * rh + 5} width={x(max) - L} height={14} fill="url(#hatch)" />
                )}
                <text x={x(max) + 6} y={i * rh + 12} dy="0.32em" style={{ fill: "var(--ink)" }}>
                  {fmtNum(b.value, fmtKind)}
                </text>
              </g>
            ))}
            <XAxis scale={x} y={bars.length * rh + 4} ticks={ticks} format={(v) => fmtNum(v, fmtKind === "pct" ? "pct" : "count")} title={secondary ? undefined : axisTitle} />
            {secondary && (
              <g>
                {secTicks.map((t) => (
                  <text key={t} x={x(t)} y={bars.length * rh + 34} textAnchor="middle" style={{ fontSize: 11 }}>
                    {secondary(t)}
                  </text>
                ))}
                <text x={L} y={bars.length * rh + 34 + 16} style={{ fill: "var(--ink-2)" }}>
                  {secTitle.map((l, i) => (
                    <tspan key={i} x={L} dy={i ? 14 : 0}>
                      {l}
                    </tspan>
                  ))}
                </text>
              </g>
            )}
          </svg>
        );
      }}
    </ChartFrame>
  );
}

/** Dot-on-axis gauge with a labelled reference tick (own-sample lexical stats). */
export function Gauge({
  name,
  model,
  compare,
  value,
  pathOf,
  refValue,
  refLabel,
  domain,
  fmtKind = "num3",
}: {
  name: string;
  model: Model;
  compare: Model[];
  value: (m: Model) => number | null;
  pathOf: (m: Model) => string;
  refValue: number | null;
  refLabel: string;
  domain: [number, number];
  fmtKind?: Fmt;
}) {
  const v = value(model);
  return (
    <ChartFrame ariaLabel={`${name}: ${fmt(v, fmtKind)}; ${refLabel} ${fmt(refValue, fmtKind)}`}>
      {(w) => {
        const L = 92;
        const R = 150;
        const span = domain[1] - domain[0] || 1;
        const x = linear([domain[0] - span * 0.04, domain[1] + span * 0.04], [L, Math.max(L + 60, w - R)]);
        return (
          <svg width={w} height={42}>
            <text x={0} y={22} dy="0.32em" className="mono" style={{ fill: "var(--ink-2)", fontFamily: "var(--f-mono)" }}>
              {name}
            </text>
            <line x1={x.range[0]} x2={x.range[1]} y1={22} y2={22} stroke="var(--rule-strong)" />
            <text x={x.range[0]} y={38} textAnchor="middle" style={{ fontSize: 11 }}>
              {fmtNum(domain[0], fmtKind)}
            </text>
            <text x={x.range[1]} y={38} textAnchor="middle" style={{ fontSize: 11 }}>
              {fmtNum(domain[1], fmtKind)}
            </text>
            {isNum(refValue) && (
              <g>
                <line x1={x(refValue)} x2={x(refValue)} y1={13} y2={31} stroke="var(--ink)" strokeWidth={1} />
                <text x={x(refValue)} y={9} textAnchor="middle" style={{ fontSize: 11 }}>
                  {refLabel}
                </text>
              </g>
            )}
            {compare.map((c) =>
              isNum(value(c)) ? (
                <Mark key={c.id} x={x(value(c)!)} y={22} label={`${c.label}: ${name} ${fmt(value(c), fmtKind)}`} tip={<TipBody title={c.label} lines={[`${name} ${fmt(value(c), fmtKind)}`]} path={pathOf(c)} />}>
                  <GlyphShape stage={c.stage} x={x(value(c)!)} y={22} size={8} hollow />
                </Mark>
              ) : null,
            )}
            {isNum(v) && (
              <Mark x={x(v)} y={22} label={`${model.label}: ${name} ${fmt(v, fmtKind)}`} tip={<TipBody title={model.label} lines={[`${name} ${fmt(v, fmtKind)}`]} path={pathOf(model)} />}>
                <GlyphShape stage={model.stage} x={x(v)} y={22} size={9} />
              </Mark>
            )}
            <text x={x.range[1] + 14} y={22} dy="0.32em" style={{ fill: "var(--ink)" }}>
              {fmtNum(v, fmtKind)} <tspan style={{ fill: "var(--ink-3)" }}>({refLabel} {fmtNum(refValue, fmtKind)})</tspan>
            </text>
          </svg>
        );
      }}
    </ChartFrame>
  );
}

export function Kv({ items }: { items: [ReactNode, ReactNode][] }) {
  return (
    <dl className="statlist">
      {items.map(([k, v], i) => (
        <div key={i} style={{ display: "contents" }}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
