/**
 * Temperature-scaling cost (methodology {#temperature}, model page §2): CE(T) − CE_min over the five measured
 * temperatures on a log-T axis, with the fitted quadratic, the minimum (T*) and the tangent at T = 1, whose slope is
 * exactly the calibration gap on the pass (gap_pass = mean(H − s)). Every number is read from models[*].temp (docs/vh_temp.py).
 */
import { path } from "../data/bundle";
import type { Model, Temp } from "../data/types";
import { ChartFrame, Mark, TipBody } from "../components/Chart";
import { GlyphShape } from "../components/Glyph";
import { XAxis, YAxis } from "../components/Axis";
import { fmt, fmtNum, isNum } from "../lib/numfmt";
import { linear, niceTicks } from "../lib/scale";

export const TEMPS = [0.8, 0.9, 1.0, 1.1, 1.25] as const;
const KEYS = ["0.8", "0.9", "1.0", "1.1", "1.25"] as const;

/** C printed to 4 decimals below 0.01, else 3; "≥" when the minimum sat at the edge of the grid. */
export function fmtC(t: Temp | null | undefined): string {
  if (!t || !isNum(t.C)) return "—";
  return `${t.T_star_at_bound ? "≥ " : ""}${t.C < 0.01 ? t.C.toFixed(4) : t.C.toFixed(3)}`;
}

export function cePoints(t: Temp): { T: number; ce: number }[] {
  return KEYS.map((k, i) => ({ T: TEMPS[i], ce: t.CE_T?.[k] ?? NaN })).filter((p) => isNum(p.ce));
}

/** Least-squares quadratic in log T through the points (the same fit as vh_temp.py). */
export function quadFit(pts: { T: number; ce: number }[]): [number, number, number] | null {
  if (pts.length < 3) return null;
  const xs = pts.map((p) => Math.log(p.T));
  const ys = pts.map((p) => p.ce);
  // normal equations for y = a x² + b x + c
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0, s4 = 0, t0 = 0, t1 = 0, t2 = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i], y = ys[i];
    s0 += 1; s1 += x; s2 += x * x; s3 += x ** 3; s4 += x ** 4; t0 += y; t1 += x * y; t2 += x * x * y;
  }
  // solve 3x3 by Cramer's rule
  const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const M = [[s4, s3, s2], [s3, s2, s1], [s2, s1, s0]];
  const D = det(M);
  if (Math.abs(D) < 1e-18) return null;
  const col = (j: number) => M.map((r, i) => r.map((v, jj) => (jj === j ? [t2, t1, t0][i] : v)));
  return [det(col(0)) / D, det(col(1)) / D, det(col(2)) / D];
}

/**
 * Panel (a): CE(T) − CE_min for up to two models over log T. Points are measured; the curve is the quadratic fit; the
 * minimum is marked at T*; the dashed line is the tangent at T = 1 (slope = −gap). Hollow = the second model.
 */
export function TempCurves({ models, labels }: { models: Model[]; labels?: string[] }) {
  const series = models.filter((m) => m.temp && cePoints(m.temp).length >= 3);
  if (!series.length) return null;
  const ymax = Math.max(0.005, ...series.flatMap((m) => cePoints(m.temp!).map((p) => p.ce - (m.temp!.CE_min ?? Math.min(...cePoints(m.temp!).map((q) => q.ce))))));
  const aria =
    "CE(T) − CE_min over temperature: " +
    series.map((m) => `${m.label}: ` + cePoints(m.temp!).map((p) => `T ${p.T} ${fmtNum(p.ce - (m.temp!.CE_min ?? 0), "num3")}`).join(", ") + `; T* ${fmtNum(m.temp!.T_star, "num2")}, C ${fmtC(m.temp)}`).join("; ");
  return (
    <ChartFrame ariaLabel={aria} maxWidth={420}>
      {(w) => {
        const L = 54;
        const T0 = 14;
        const pw = w - L - 16;
        const ph = Math.max(150, Math.min(220, pw * 0.6));
        const x = linear([Math.log(0.78), Math.log(1.28)], [L, L + pw]);
        const y = linear([0, ymax * 1.08], [T0 + ph, T0]);
        const yt = niceTicks(0, ymax * 1.08, 4);
        return (
          <svg width={w} height={T0 + ph + 48}>
            <rect x={L} y={T0} width={pw} height={ph} fill="var(--bg)" opacity={0.5} />
            <XAxis scale={x} y={T0 + ph} ticks={TEMPS.map((t) => Math.log(t))} format={(v) => String(+Math.exp(v).toFixed(2))} gridTop={T0} />
            <YAxis scale={y} x={L} ticks={yt} format={(v) => fmtNum(v, "num3")} gridRight={L + pw} />
            <text x={L + pw} y={T0 + ph + 32} textAnchor="end" style={{ fill: "var(--ink-2)" }}>
              temperature T (log axis)
            </text>
            <text x={L - 48} y={T0 - 3} style={{ fill: "var(--ink-2)" }}>
              CE(T) − CE_min, nats
            </text>
            {series.map((m, si) => {
              const t = m.temp!;
              const pts = cePoints(t);
              const cem = t.CE_min ?? Math.min(...pts.map((p) => p.ce));
              const q = quadFit(pts);
              const hollow = si > 0;
              const stroke = hollow ? "var(--ink-3)" : "var(--ink)";
              const curve: string[] = [];
              if (q) for (let i = 0; i <= 60; i++) {
                const lx = Math.log(0.78) + (i / 60) * (Math.log(1.28) - Math.log(0.78));
                const v = q[0] * lx * lx + q[1] * lx + q[2] - cem;
                curve.push(`${x(lx)},${y(Math.max(0, Math.min(ymax * 1.08, v)))}`);
              }
              // tangent at T = 1: dCE/dlogT = mean(H − s) on this pass, exactly (gap_pass); fall back to the measured central difference
              const slope = isNum(t.gap_pass) ? t.gap_pass : isNum(t.slope_central) ? t.slope_central : null;
              const ce1 = (t.CE_T?.["1.0"] ?? NaN) - cem;
              const tan = isNum(slope) && isNum(ce1) ? [Math.log(0.86), Math.log(1.16)].map((lx) => `${x(lx)},${y(ce1 + slope * lx)}`) : null;
              return (
                <g key={m.id}>
                  {curve.length > 0 && <polyline points={curve.join(" ")} fill="none" stroke={stroke} strokeWidth={1.5} strokeDasharray={hollow ? "4 3" : undefined} />}
                  {tan && <polyline points={tan.join(" ")} fill="none" stroke="var(--ink-2)" strokeWidth={1} strokeDasharray="2 2" />}
                  {isNum(t.T_star) && (
                    <line x1={x(Math.log(t.T_star))} x2={x(Math.log(t.T_star))} y1={y(0)} y2={y(0) - 10} stroke={stroke} strokeWidth={1.5} />
                  )}
                  {pts.map((p) => (
                    <Mark
                      key={p.T}
                      x={x(Math.log(p.T))}
                      y={y(p.ce - cem)}
                      label={`${m.label}, T = ${p.T}: CE ${fmtNum(p.ce, "num3")} nats, ${fmtNum(p.ce - cem, "num3")} above the minimum`}
                      tip={<TipBody title={`${m.label} · T = ${p.T}`} lines={[`CE(T) ${fmtNum(p.ce, "num3")} nats`, `above min ${fmtNum(p.ce - cem, "num3")}`]} path={path(m, ["temp", "CE_T", String(p.T === 1 ? "1.0" : p.T)])} />}
                    >
                      <GlyphShape stage={m.stage} x={x(Math.log(p.T))} y={y(p.ce - cem)} size={9} hollow={hollow} />
                    </Mark>
                  ))}
                  <text x={x(Math.log(1.26))} y={Math.max(T0 + 12, y(cePoints(t)[cePoints(t).length - 1].ce - cem) - 12 - si * 13)} textAnchor="end" className="halo" style={{ fontSize: 11, fill: stroke }}>
                    {labels?.[si] ?? m.label}
                  </text>
                </g>
              );
            })}
            <text x={x(0)} y={T0 + ph + 14 + 0} textAnchor="middle" style={{ fontSize: 10, fill: "var(--ink-3)" }} />
          </svg>
        );
      }}
    </ChartFrame>
  );
}

/** Tiny CE(T) − CE_min sparkline for a table cell or key-value row. */
export function TempSpark({ t, width = 96, height = 28 }: { t: Temp; width?: number; height?: number }) {
  const pts = cePoints(t);
  if (pts.length < 3) return null;
  const cem = t.CE_min ?? Math.min(...pts.map((p) => p.ce));
  const vmax = Math.max(0.002, ...pts.map((p) => p.ce - cem));
  const x = linear([Math.log(0.8), Math.log(1.25)], [4, width - 4]);
  const y = linear([0, vmax], [height - 4, 4]);
  const aria = `CE above minimum at T 0.8…1.25: ${pts.map((p) => fmtNum(p.ce - cem, "num3")).join(", ")}`;
  return (
    <svg width={width} height={height} role="img" aria-label={aria} style={{ display: "inline-block", verticalAlign: "middle" }}>
      <title>{aria}</title>
      <line x1={x(0)} x2={x(0)} y1={2} y2={height - 2} stroke="var(--rule-strong)" strokeDasharray="2 2" />
      <polyline points={pts.map((p) => `${x(Math.log(p.T))},${y(p.ce - cem)}`).join(" ")} fill="none" stroke="var(--ink)" strokeWidth={1.3} />
      {pts.map((p) => (
        <circle key={p.T} cx={x(Math.log(p.T))} cy={y(p.ce - cem)} r={2} fill="var(--ink)" />
      ))}
      {isNum(t.T_star) && <circle cx={x(Math.log(t.T_star))} cy={y(0)} r={2.5} fill="var(--bg)" stroke="var(--ink)" strokeWidth={1.2} />}
    </svg>
  );
}

export const tempNote = (t: Temp) => `C = CE(1) − min CE(T) = ${fmtC(t)} nats/token; T* = ${fmtNum(t.T_star, "num2")}${t.T_star_at_bound ? " (at the edge of the grid: C is a lower bound)" : ""}${isNum(t.C_ci95?.[0]) && isNum(t.C_ci95?.[1]) ? `; 95% CI [${fmt(t.C_ci95![0]!, "raw")}, ${fmt(t.C_ci95![1]!, "raw")}]` : ""}`;
