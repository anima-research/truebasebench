/**
 * Coverage calibration (methodology {#pit}, model page §2): the coverage deviation P(u ≤ q) − q over q for the specimen
 * pair, over faint bands of every base-side and every post-trained checkpoint, so the stage-wise shape shows; and a
 * sparkline for a key-value row. Every number is read from models[*].pit (docs/vh_pit.py).
 */
import { path } from "../data/bundle";
import type { Bundle, Model, Pit } from "../data/types";
import { ChartFrame, Mark, TipBody } from "../components/Chart";
import { GlyphShape } from "../components/Glyph";
import { XAxis, YAxis } from "../components/Axis";
import { fmtNum, isNum } from "../lib/numfmt";
import { linear, niceTicks } from "../lib/scale";

/** The coverage grid of vh_pit.py: q = 0, 0.025, …, 1. */
export const Q = Array.from({ length: 41 }, (_, i) => i / 40);

export function deviation(p: Pit): { q: number; d: number }[] {
  const cov = p.cov ?? [];
  return Q.map((q, i) => ({ q, d: isNum(cov[i]) ? (cov[i] as number) - q : NaN })).filter((x) => isNum(x.d));
}

/** KS printed to 4 decimals (values run 0.002–0.14). */
export const fmtKS = (v: number | null | undefined) => (isNum(v) ? v.toFixed(4) : "—");

const isBaseSide = (m: Model) => m.stage !== "post-trained";

/**
 * Coverage deviation curves: specimen A (filled) and B (hollow) drawn in ink; every other checkpoint as a faint line in
 * its stage colour (bases bulge up at low q, post-trained dip at high q). Horizontal zero = perfectly calibrated.
 */
export function CoverageDeviation({ bundle, pair, labels }: { bundle: Bundle; pair: Model[]; labels?: string[] }) {
  const all = bundle.models.filter((m) => m.pit && (m.pit.cov?.length ?? 0) === 41);
  const main = pair.filter((m) => all.includes(m));
  const others = all.filter((m) => !main.includes(m));
  const devs = new Map(all.map((m) => [m.id, deviation(m.pit!)]));
  const ext = Math.max(0.01, ...all.flatMap((m) => devs.get(m.id)!.map((x) => Math.abs(x.d))));
  const aria =
    "Coverage deviation P(u ≤ q) − q: " +
    main.map((m) => `${m.label}: KS ${fmtKS(m.pit!.KS)} at q ${fmtNum(m.pit!.q_at_max, "num2")}, excess at 0.1 ${fmtNum(m.pit!.excess_q10, "signed")}, at 0.9 ${fmtNum(m.pit!.excess_q90, "signed")}`).join("; ") +
    `; ${others.length} other checkpoints drawn faintly by stage`;
  return (
    <ChartFrame ariaLabel={aria} maxWidth={440}>
      {(w) => {
        const L = 54;
        const T = 14;
        const pw = w - L - 16;
        const ph = Math.max(160, Math.min(240, pw * 0.62));
        const x = linear([0, 1], [L, L + pw]);
        const y = linear([-ext * 1.08, ext * 1.08], [T + ph, T]);
        const yt = niceTicks(-ext, ext, 5);
        const line = (m: Model) => devs.get(m.id)!.map((p) => `${x(p.q)},${y(p.d)}`).join(" ");
        const colour = (m: Model) => (isBaseSide(m) ? "var(--st-base)" : "var(--st-post)");
        return (
          <svg width={w} height={T + ph + 48}>
            <rect x={L} y={T} width={pw} height={ph} fill="var(--bg)" opacity={0.5} />
            <XAxis scale={x} y={T + ph} ticks={[0, 0.25, 0.5, 0.75, 1]} format={(v) => String(v)} gridTop={T} />
            <YAxis scale={y} x={L} ticks={yt} format={(v) => fmtNum(v, "signed")} gridRight={L + pw} />
            <line x1={L} x2={L + pw} y1={y(0)} y2={y(0)} stroke="var(--zero)" strokeWidth={1.5} />
            <text x={L + pw} y={T + ph + 32} textAnchor="end" style={{ fill: "var(--ink-2)" }}>
              q: the model’s top-q probability mass
            </text>
            <text x={L - 48} y={T - 3} style={{ fill: "var(--ink-2)" }}>
              P(u ≤ q) − q
            </text>
            <text x={L + 6} y={T + 12} style={{ fontSize: 11, fontStyle: "italic", fill: "var(--ink-3)" }}>
              real token inside the mass more often than q
            </text>
            <text x={L + 6} y={T + ph - 5} style={{ fontSize: 11, fontStyle: "italic", fill: "var(--ink-3)" }}>
              less often: over-confident
            </text>
            {others.map((m) => (
              <polyline key={m.id} points={line(m)} fill="none" stroke={colour(m)} strokeWidth={1} opacity={0.22} />
            ))}
            {main.map((m, si) => {
              const hollow = si > 0;
              const pts = devs.get(m.id)!;
              const at = (q: number) => pts.find((p) => Math.abs(p.q - q) < 1e-9);
              return (
                <g key={m.id}>
                  <polyline points={line(m)} fill="none" stroke={hollow ? "var(--ink-3)" : "var(--ink)"} strokeWidth={1.8} strokeDasharray={hollow ? "5 3" : undefined} />
                  {[0.1, 0.25, 0.5, 0.75, 0.9].map((q) => {
                    const p = at(q);
                    if (!p) return null;
                    return (
                      <Mark
                        key={q}
                        x={x(q)}
                        y={y(p.d)}
                        label={`${m.label}, q = ${q}: coverage minus q ${fmtNum(p.d, "signed")}`}
                        tip={<TipBody title={`${m.label} · q = ${q}`} lines={[`P(u ≤ q) − q = ${fmtNum(p.d, "signed")}`]} path={`${path(m, "pit.cov")}[${Math.round(q * 40)}] − ${q}`} />}
                      >
                        <GlyphShape stage={m.stage} x={x(q)} y={y(p.d)} size={8} hollow={hollow} />
                      </Mark>
                    );
                  })}
                  <text x={x(0.98)} y={y(pts[Math.round(0.9 * 40)]?.d ?? 0) + (hollow ? 14 : -8)} textAnchor="end" className="halo" style={{ fontSize: 11, fill: hollow ? "var(--ink-3)" : "var(--ink)" }}>
                    {labels?.[si] ?? m.label}
                  </text>
                </g>
              );
            })}
          </svg>
        );
      }}
    </ChartFrame>
  );
}

/** Tiny coverage-deviation sparkline for a key-value row (zero line, deviation scaled to its own extent). */
export function PitSpark({ p, width = 110, height = 28 }: { p: Pit; width?: number; height?: number }) {
  const pts = deviation(p);
  if (pts.length < 5) return null;
  const ext = Math.max(0.002, ...pts.map((x) => Math.abs(x.d)));
  const x = linear([0, 1], [3, width - 3]);
  const y = linear([-ext, ext], [height - 3, 3]);
  const aria = `coverage deviation over q, extreme ${fmtNum(ext, "signed")} at q ${fmtNum(p.q_at_max, "num2")}`;
  return (
    <svg width={width} height={height} role="img" aria-label={aria} style={{ display: "inline-block", verticalAlign: "middle" }}>
      <title>{aria}</title>
      <line x1={x(0)} x2={x(1)} y1={y(0)} y2={y(0)} stroke="var(--rule-strong)" />
      <polyline points={pts.map((q) => `${x(q.q)},${y(q.d)}`).join(" ")} fill="none" stroke="var(--ink)" strokeWidth={1.3} />
      {isNum(p.q_at_max) && <line x1={x(p.q_at_max)} x2={x(p.q_at_max)} y1={3} y2={height - 3} stroke="var(--ink-3)" strokeDasharray="2 2" />}
    </svg>
  );
}
