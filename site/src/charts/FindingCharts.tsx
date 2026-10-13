import { Link } from "react-router-dom";
import { ladder, ladderColumns, stageOrder, STAGE_CODE } from "../data/derive";
import { fp, path } from "../data/bundle";
import { SUB_META } from "../data/method";
import { SUB_KEYS, type Bundle, type Model } from "../data/types";
import { ChartFrame, Mark, TipBody } from "../components/Chart";
import { GlyphShape } from "../components/Glyph";
import { XAxis, xTitleExtra, YAxis } from "../components/Axis";
import { fmt, fmtNum, fmtTick, isNum, type Fmt } from "../lib/numfmt";
import { linear, log10Scale, niceTicks, textWidth, wrapText, type Scale } from "../lib/scale";
import type { TailPair } from "../findings";

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
}

function shortLabel(s: string, n = 14): string {
  const t = s.replace(/\s*\(.*?\)\s*/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
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
}: {
  rungs: Model[];
  metric: Metric;
  domain: [number, number];
  height?: number;
  lens?: [number, number];
  compact?: boolean;
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
        const labelSpace = compact ? (tight ? 62 : 42) : tight ? 90 : 70;
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
              {pts.flat().map((p) =>
                isNum(p.v) ? (
                  <Mark
                    key={p.m.id + (isLens ? "L" : "")}
                    x={p.x}
                    y={ys(clip(p.v))}
                    href={href(p.m)}
                    label={`${p.m.label}, ${p.m.stage}: ${fmt(p.v, metric.fmtKind)}`}
                    tip={<TipBody title={`${p.m.family} · ${p.m.label}`} lines={[`${metric.name}: ${fmt(p.v, metric.fmtKind)}`]} path={metric.pathOf(p.m)} />}
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
            <text x={4} y={10} style={{ fill: "var(--ink-2)" }}>
              {metric.axis}
            </text>
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

/** Small multiples of LadderChart for every family with ≥ 2 rungs, sharing the y scale. */
export function LadderSmallMultiples({ bundle, metric }: { bundle: Bundle; metric: Metric }) {
  const fams = Array.from(new Set(bundle.models.map((m) => m.family)))
    .map((f) => ladder(bundle, f))
    .filter((r) => r.length >= 2)
    .sort((a, b) => b.length - a.length || a[0].family.localeCompare(b[0].family));
  const vals = fams.flat().map(metric.value).filter(isNum);
  let lo = Math.min(...vals, metric.zero ? 0 : Infinity);
  let hi = Math.max(...vals, metric.zero ? 0 : -Infinity);
  if (metric.band !== undefined) {
    lo = Math.min(lo, -metric.band);
    hi = Math.max(hi, metric.band);
  }
  const pad = (hi - lo) * 0.06;
  const domain: [number, number] = [lo - pad, hi + pad];
  return (
    <div className="small-mult">
      {fams.map((rungs) => (
        <div key={rungs[0].family} className="cell-plate">
          <h3>
            <Link to={`/?family=${encodeURIComponent(rungs[0].family)}&view=ladders`}>{rungs[0].family}</Link>
          </h3>
          <LadderChart rungs={rungs} metric={metric} domain={domain} height={130} compact />
        </div>
      ))}
    </div>
  );
}

const DASH: Record<string, string | undefined> = { calib: undefined, spread: "6 3", memo: "1.5 3", prior: "7 3 1.5 3" };

/** F2: four sub-score lines across a family's rungs, labelled at their right ends (no legend). */
export function ProfileChart({ rungs }: { rungs: Model[] }) {
  const aria = `Sub-scores along ${rungs[0]?.family}: ` + SUB_KEYS.map((k) => `${SUB_META[k].name} ${rungs.map((r) => fmtNum(r.subscores?.[k]?.score ?? null, "score")).join(" → ")}`).join("; ");
  return (
    <ChartFrame ariaLabel={aria}>
      {(w) => {
        const L = 34;
        const R = 54;
        const T = 12;
        const H = 150;
        const x = linear([0, Math.max(1, rungs.length - 1)], [L + 8, w - R]);
        const y = linear([0, 1], [T + H, T]);
        const short = rungShortLabels(rungs, 14);
        const ends = SUB_KEYS.map((k) => ({ k, v: rungs[rungs.length - 1].subscores?.[k]?.score ?? null }));
        // de-collide end labels: 12px apart, kept inside the plot so they never reach the rung labels below it
        const endOrder = ends.filter((e) => isNum(e.v)).sort((a, b) => b.v! - a.v!);
        const ys = endOrder.map((e) => y(e.v!));
        for (let i = 1; i < ys.length; i++) ys[i] = Math.max(ys[i], ys[i - 1] + 12);
        const over = ys.length ? ys[ys.length - 1] - (T + H) : 0;
        if (over > 0) {
          ys[ys.length - 1] -= over;
          for (let i = ys.length - 2; i >= 0; i--) ys[i] = Math.min(ys[i], ys[i + 1] - 12);
        }

        return (
          <svg width={w} height={T + H + 70}>
            <YAxis scale={y} x={L} ticks={[0, 0.25, 0.5, 0.75, 1]} format={(v) => String(v)} gridRight={w - R} />
            {SUB_KEYS.map((k) => (
              <polyline
                key={k}
                points={rungs.map((r, i) => (isNum(r.subscores?.[k]?.score) ? `${x(i)},${y(r.subscores![k]!.score!)}` : "")).join(" ")}
                fill="none"
                stroke="var(--ink)"
                strokeWidth={1.5}
                strokeDasharray={DASH[k]}
              />
            ))}
            {rungs.map((r, i) => (
              <g key={r.id}>
                <GlyphShape stage={r.stage} x={x(i)} y={T + H + 10} size={8} />
                <text transform={`translate(${x(i)},${T + H + 22}) rotate(35)`} style={{ fontSize: 11 }}>
                  {short.get(r.id)}
                </text>
              </g>
            ))}
            {endOrder.map((e, i) => (
              <text key={e.k} x={w - R + 6} y={ys[i]} dy="0.32em" style={{ fill: "var(--ink)" }}>
                {SUB_META[e.k].name}
              </text>
            ))}
          </svg>
        );
      }}
    </ChartFrame>
  );
}

/** F2: comb matrix of C S M P for anneal and base checkpoints. */
export function CombMatrix({ models }: { models: Model[] }) {
  return (
    <div className="tbl-scroll">
      {/* a minimum width keeps bar and number side by side; narrower screens scroll the table, not the page */}
      <table className="tbl" style={{ minWidth: 600 }}>
        <thead>
          <tr>
            <th scope="col">checkpoint</th>
            {SUB_KEYS.map((k) => (
              <th key={k} scope="col" title={SUB_META[k].readsAs}>
                {SUB_META[k].short} · {SUB_META[k].name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {models.map((m) => (
            <tr key={m.id}>
              <th scope="row" style={{ fontWeight: 400, background: "none" }}>
                <span className="stage-tag">
                  <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true">
                    <GlyphShape stage={m.stage} size={8} />
                  </svg>
                  <span className="code">{STAGE_CODE[m.stage]}</span>
                </span>{" "}
                <Link to={href(m)}>
                  {m.family} · {m.label}
                </Link>
              </th>
              {SUB_KEYS.map((k) => {
                const v = m.subscores?.[k]?.score ?? null;
                return (
                  <td key={k}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <svg width={48} height={8} aria-hidden="true" style={{ flex: "none" }}>
                        <rect width={48} height={8} fill={isNum(v) ? "var(--track)" : "url(#hatch)"} />
                        {isNum(v) && <rect width={48 * v} height={8} fill="var(--bar)" />}
                      </svg>
                      <span className="small ink2">{fmtNum(v, "score")}</span>
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** F3: scatter of x = F_calib_gap vs y = roll_instr_marker_rate, stage glyphs, labelled specimen with arrow. */
export function GapPriorScatter({ bundle, label, arrowTo }: { bundle: Bundle; label?: Model | null; arrowTo?: Model | null }) {
  const ms = bundle.models.filter((m) => isNum(fp(m, "F_calib_gap")) && isNum(fp(m, "roll_instr_marker_rate")));
  const xs = ms.map((m) => fp(m, "F_calib_gap")!);
  const ys = ms.map((m) => fp(m, "roll_instr_marker_rate")!);
  return (
    <ChartFrame ariaLabel={`Calibration gap against instruction-marker rate for ${ms.length} checkpoints` + (label ? `; ${label.label} at gap ${fmt(fp(label, "F_calib_gap"), "gap")}` : "")}>
      {(w) => {
        const L = 46;
        const T = 20;
        const H = Math.min(320, Math.max(220, w * 0.55));
        const x = linear([Math.min(...xs) - 0.03, Math.max(0.05, Math.max(...xs) + 0.02)], [L, w - 14]);
        const y = linear([0, Math.max(...ys) * 1.08], [T + H, T]);
        const p = (m: Model) => ({ x: x(fp(m, "F_calib_gap")!), y: y(fp(m, "roll_instr_marker_rate")!) });
        return (
          <svg width={w} height={T + H + 44}>
            <XAxis scale={x} y={T + H} ticks={niceTicks(x.domain[0], x.domain[1], w < 480 ? 4 : 8)} format={(v) => fmtTick(v, { signed: true })} gridTop={T} title="calibration gap on post-cutoff text, mean(H − s), nats" />
            <YAxis scale={y} x={L} ticks={niceTicks(0, y.domain[1], 5)} format={(v) => fmtTick(v, { pct: true })} gridRight={w - 14} title="instruction-marker rate, bare-BOS samples" />
            <line x1={x(0)} x2={x(0)} y1={T} y2={T + H} stroke="var(--zero)" strokeWidth={1.5} />
            {label && arrowTo && isNum(fp(arrowTo, "F_calib_gap")) && (
              <line x1={p(label).x} y1={p(label).y} x2={p(arrowTo).x} y2={p(arrowTo).y} stroke="var(--ink)" strokeWidth={1} markerEnd="url(#arrow)" />
            )}
            {ms.map((m) => (
              <Mark
                key={m.id}
                x={p(m).x}
                y={p(m).y}
                href={href(m)}
                label={`${m.label} (${m.family}), ${m.stage}: gap ${fmt(fp(m, "F_calib_gap"), "gap")}, marker rate ${fmt(fp(m, "roll_instr_marker_rate"), "pct")}`}
                tip={<TipBody title={`${m.family} · ${m.label}`} lines={[`gap ${fmt(fp(m, "F_calib_gap"), "gap")}`, `markers ${fmt(fp(m, "roll_instr_marker_rate"), "pct")}`]} path={path(m, "fingerprint.F_calib_gap")} />}
              >
                {label?.id === m.id && <circle cx={p(m).x} cy={p(m).y} r={8} fill="var(--hl)" />}
                <GlyphShape stage={m.stage} x={p(m).x} y={p(m).y} size={label?.id === m.id ? 9 : 7} />
              </Mark>
            ))}
            {label && (
              <g>
                <line x1={p(label).x} y1={p(label).y - 8} x2={p(label).x} y2={T + 4} stroke="var(--ink-2)" />
                {(() => {
                  const t = `${label.family} · ${label.label}`;
                  const px = p(label).x;
                  const tw = textWidth(t);
                  const z = x(0);
                  // never run into the zero line: left of zero, the label ends before x(0) − 4 (end-anchored at the leader)
                  const crossesZero = px < z && px + 4 + tw > z - 4;
                  const fitsLeft = px - 4 - tw >= 2;
                  const fitsRight = px + 4 + tw <= w - 2;
                  const [lx, anchor]: [number, "start" | "end"] = crossesZero
                    ? fitsLeft
                      ? [px - 4, "end"]
                      : [z + 4, "start"]
                    : fitsRight
                      ? [px + 4, "start"]
                      : [px - 4, "end"];
                  return (
                    <text x={lx} y={T + 8} textAnchor={anchor} className="halo" style={{ fill: "var(--ink)" }}>
                      {t}
                    </text>
                  );
                })()}
              </g>
            )}
          </svg>
        );
      }}
    </ChartFrame>
  );
}

/** F5: dumbbells, KL_desc hollow → KL_few filled, log x axis (0.1–10), grouped by stage, sorted by KL_few. */
export function KLDumbbells({ bundle }: { bundle: Bundle }) {
  const ms = bundle.models.filter((m) => m.surnames && (isNum(m.surnames.KL_few) || isNum(m.surnames.KL_desc)));
  const missing = bundle.models.filter((m) => !ms.includes(m));
  const groups = stageOrder.map((s) => ms.filter((m) => m.stage === s).sort((a, b) => (a.surnames!.KL_few ?? 99) - (b.surnames!.KL_few ?? 99))).filter((g) => g.length);
  const rows = groups.flatMap((g, gi) => g.map((m, i) => ({ m, gap: i === 0 && gi > 0 })));
  return (
    <ChartFrame ariaLabel={`KL(Census‖model), few-shot and described, for ${ms.length} checkpoints: ` + ms.map((m) => `${m.label} few ${fmt(m.surnames!.KL_few ?? null, "kl")} described ${fmt(m.surnames!.KL_desc ?? null, "kl")}`).join("; ")}>
      {(w) => {
        const L = Math.min(190, w * 0.45);
        const rh = 17;
        let yy = 8;
        const ys = rows.map((r) => {
          yy += r.gap ? 10 : 0;
          const v = yy + rh / 2;
          yy += rh;
          return v;
        });
        const x0 = log10Scale([0.1, 10], [L, w - 14]);
        // values outside the fixed decades are pinned to the axis end and drawn hollow-ringed with an arrow note
        const KL_LO = 0.1;
        const KL_HI = 10;
        const clampKL = (v: number) => Math.max(KL_LO, Math.min(KL_HI, v));
        const offKL = (v: number) => v < KL_LO || v > KL_HI;
        const x = Object.assign((v: number) => x0(clampKL(v)), x0) as typeof x0;
        const axisTitle = "KL(Census‖model), nats, log scale · filled = few-shot, hollow = described";
        const titleLines = wrapText(axisTitle, w - 14 - L);
        const missLines = missing.length ? wrapText(`not measured: ${missing.map((m) => m.label).join(", ")}`, w - 8) : [];
        const H = yy + 30 + titleLines.length * 14 + missLines.length * 14 + 4;
        return (
          <svg width={w} height={H}>
            {x.ticks().map((t) => (
              <line key={t} x1={x(t)} x2={x(t)} y1={4} y2={yy} stroke="var(--rule)" />
            ))}
            {rows.map(({ m }, i) => {
              const f = m.surnames!.KL_few;
              const d = m.surnames!.KL_desc;
              return (
                <g key={m.id}>
                  <text x={L - 8} y={ys[i]} dy="0.32em" textAnchor="end" style={{ fill: "var(--ink-2)" }}>
                    {shortLabel(`${m.family.split(" ")[0]} ${m.label}`, Math.floor(L / 6))}
                  </text>
                  {isNum(f) && isNum(d) && <line x1={x(f)} x2={x(d)} y1={ys[i]} y2={ys[i]} stroke="var(--ink-3)" />}
                  {isNum(d) && (
                    <Mark x={x(d)} y={ys[i]} href={href(m)} label={`${m.label}: described KL ${fmt(d, "kl")}`} tip={<TipBody title={m.label} lines={[`described KL ${fmt(d, "kl")}`]} path={path(m, "surnames.KL_desc")} />}>
                      <GlyphShape stage={m.stage} x={x(d)} y={ys[i]} size={7} hollow />
                    </Mark>
                  )}
                  {isNum(f) && (
                    <Mark x={x(f)} y={ys[i]} href={href(m)} label={`${m.label}: few-shot KL ${fmt(f, "kl")}`} tip={<TipBody title={m.label} lines={[`few-shot KL ${fmt(f, "kl")}`]} path={path(m, "surnames.KL_few")} />}>
                      <GlyphShape stage={m.stage} x={x(f)} y={ys[i]} size={7} />
                    </Mark>
                  )}
                  {[f, d].map((v, j) =>
                    isNum(v) && offKL(v) ? (
                      <text key={j} x={x(v) + (v < KL_LO ? 7 : -7)} y={ys[i] - 5} textAnchor={v < KL_LO ? "start" : "end"} className="halo" style={{ fontSize: 10 }}>
                        {v < KL_LO ? "←" : "→"} {fmtNum(v, "kl")} off axis
                      </text>
                    ) : null,
                  )}
                </g>
              );
            })}
            <XAxis scale={x} y={yy + 2} ticks={[0.1, 1, 10]} format={(v) => String(v)} />
            <text x={L} y={yy + 2 + 30} style={{ fill: "var(--ink-2)" }}>
              {titleLines.map((l, i) => (
                <tspan key={i} x={L} dy={i ? 14 : 0}>
                  {l}
                </tspan>
              ))}
            </text>
            {missLines.length > 0 && (
              <text x={4} y={yy + 2 + 30 + titleLines.length * 14 + 4}>
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

/** F6: paired arrows of tail.tf_fresh["s>10"] from base pair to each post-trained rung, labelled with % change. */
export function PairedArrows({ pairs }: { pairs: TailPair[] }) {
  const sorted = [...pairs].sort((a, b) => b.rise - a.rise);
  const vals = pairs.flatMap((p) => [p.rateBase, p.ratePost]);
  return (
    <ChartFrame ariaLabel={`Share of real tokens with surprisal above 10 nats, base → post-trained: ` + sorted.map((p) => `${p.post.label} ${fmt(p.rateBase, "pct")} → ${fmt(p.ratePost, "pct")}`).join("; ")}>
      {(w) => {
        const L = Math.min(200, w * 0.42);
        const rh = 20;
        const x = linear([0, Math.max(...vals) * 1.1], [L, w - 52]);
        const xTitle = "share of tokens with s > 10 nats; hollow = base";
        const H = sorted.length * rh + 40 + xTitleExtra(xTitle, w - 52 - L);
        return (
          <svg width={w} height={H}>
            {sorted.map((p, i) => {
              const cy = i * rh + rh / 2;
              return (
                <g key={p.post.id}>
                  <text x={L - 8} y={cy} dy="0.32em" textAnchor="end" style={{ fill: "var(--ink-2)" }}>
                    {shortLabel(`${p.post.family.split(" ")[0]} ${p.post.label}`, Math.floor(L / 6))}
                  </text>
                  {(() => {
                    // the arrow (and its head) stops 6px short of the post-trained glyph so the glyph stays a clean triangle
                    const x1 = x(p.rateBase);
                    const x2 = x(p.ratePost);
                    const sign = Math.sign(x2 - x1);
                    const end = x2 - sign * 6;
                    const head = Math.abs(end - x1) > 8;
                    return <line x1={x1 + sign * 4} x2={head ? end : x2} y1={cy} y2={cy} stroke="var(--ink)" markerEnd={head ? "url(#arrow)" : undefined} />;
                  })()}
                  <Mark x={x(p.rateBase)} y={cy} href={href(p.base)} label={`${p.base.label}: ${fmt(p.rateBase, "pct")}`} tip={<TipBody title={`${p.base.family} · ${p.base.label}`} lines={[fmt(p.rateBase, "pct")]} path={path(p.base, ["tail", "tf_fresh", "s>10"])} />}>
                    <GlyphShape stage={p.base.stage} x={x(p.rateBase)} y={cy} size={7} hollow />
                  </Mark>
                  <Mark x={x(p.ratePost)} y={cy} href={href(p.post)} label={`${p.post.label}: ${fmt(p.ratePost, "pct")}`} tip={<TipBody title={`${p.post.family} · ${p.post.label}`} lines={[fmt(p.ratePost, "pct")]} path={path(p.post, ["tail", "tf_fresh", "s>10"])} />}>
                    <GlyphShape stage={p.post.stage} x={x(p.ratePost)} y={cy} size={7} />
                  </Mark>
                  <text x={Math.max(x(p.ratePost), x(p.rateBase)) + 8} y={cy} dy="0.32em" style={{ fill: "var(--ink)" }}>
                    {fmtNum(p.rise, "pctSigned")}
                  </text>
                </g>
              );
            })}
            <XAxis scale={x} y={sorted.length * rh + 2} ticks={niceTicks(0, x.domain[1], w < 480 ? 3 : 6)} format={(v) => fmtTick(v, { pct: true })} title={xTitle} />
          </svg>
        );
      }}
    </ChartFrame>
  );
}
