/**
 * Plates for the bundle-v6 blocks: predicted tail mass vs realised rate (tailmass), exact prior mass on chat
 * openers (prior) and the out-of-distribution genres (ood). Every block may be missing; callers hide the plate then.
 */
import { path } from "../data/bundle";
import { ciBounds } from "../data/derive";
import type { Bundle, Model, Prior, TailBin, TailStats } from "../data/types";
import { ChartFrame, Mark, TipBody } from "../components/Chart";
import { GlyphShape } from "../components/Glyph";
import { XAxis, YAxis } from "../components/Axis";
import { fmt, fmtNum, isNum, MINUS } from "../lib/numfmt";
import { linear, log10Scale } from "../lib/scale";

export const TAIL_KS = [2, 3, 4] as const;
export type TailK = (typeof TAIL_KS)[number];
export const tailLabel = (k: TailK) => `p < 10${k === 2 ? "⁻²" : k === 3 ? "⁻³" : "⁻⁴"}`;

/** value [lo, hi] for an interval entry, or just the value. */
export function withCI(value: number | null | undefined, bounds: [number, number] | null, kind: Parameters<typeof fmtNum>[1]): string {
  const v = fmtNum(value ?? null, kind);
  return bounds ? `${v} [${fmtNum(bounds[0], kind)}, ${fmtNum(bounds[1], kind)}]` : v;
}

/**
 * Predicted tail mass (filled) against the realised rate (hollow) at three thresholds, one row each, one linear axis.
 * The ratio realised/predicted with its CI sits at the row's right.
 */
export function TailMassRows({ model, compare = [] }: { model: Model; compare?: Model[] }) {
  const series = [model, ...compare].filter((m) => m.tailmass);
  const vals = series.flatMap((m) => TAIL_KS.flatMap((k) => [m.tailmass?.[`pred${k}`], m.tailmass?.[`real${k}`]])).filter(isNum);
  const max = Math.max(0.01, ...vals);
  const aria =
    `Predicted tail mass vs realised rate for ${model.label}: ` +
    TAIL_KS.map((k) => `${tailLabel(k)} predicted ${fmt(model.tailmass?.[`pred${k}`] ?? null, "pct")}, realised ${fmt(model.tailmass?.[`real${k}`] ?? null, "pct")}`).join("; ");
  return (
    <ChartFrame ariaLabel={aria}>
      {(w) => {
        const L = Math.min(96, w * 0.25);
        const R = 118;
        const x = linear([0, max * 1.05], [L, w - R]);
        const rh = 30;
        const H = TAIL_KS.length * rh + 44;
        const ticks = [0, max / 2, max].map((t) => +t.toPrecision(2));
        return (
          <svg width={w} height={H}>
            <XAxis scale={x} y={TAIL_KS.length * rh + 6} ticks={ticks} format={(v) => fmt(v, "pct")} gridTop={0} />
            <text x={w - R} y={H - 6} textAnchor="end" style={{ fill: "var(--ink-2)" }}>
              share of positions / probability mass
            </text>
            {TAIL_KS.map((k, i) => {
              const y = i * rh + rh / 2;
              const pred = model.tailmass?.[`pred${k}`] ?? null;
              const real = model.tailmass?.[`real${k}`] ?? null;
              const ratio = model.tailmass?.[`ratio${k}`] ?? null;
              const b = ciBounds(model, `tail_ratio${k}`);
              return (
                <g key={k}>
                  <text x={L - 8} y={y + 4} textAnchor="end">
                    {tailLabel(k)}
                  </text>
                  <line x1={x(0)} x2={x(max * 1.05)} y1={y} y2={y} stroke="var(--rule)" />
                  {series.map((m) => {
                    const p = m.tailmass?.[`pred${k}`] ?? null;
                    const r = m.tailmass?.[`real${k}`] ?? null;
                    const hollowSeries = m.id !== model.id;
                    if (!isNum(p) || !isNum(r)) return null;
                    return (
                      <g key={m.id}>
                        <line x1={x(p)} x2={x(r)} y1={y} y2={y} stroke={hollowSeries ? "var(--ink-3)" : "var(--ink)"} strokeWidth={hollowSeries ? 1 : 2} strokeDasharray={hollowSeries ? "3 2" : undefined} />
                        <Mark
                          x={x(p)}
                          y={y}
                          label={`${m.label}, ${tailLabel(k)}: predicted mass ${fmt(p, "pct")}`}
                          tip={<TipBody title={`${m.label} · ${tailLabel(k)}`} lines={[`predicted mass ${fmtNum(p, "pct")}`]} path={path(m, `tailmass.pred${k}`)} />}
                        >
                          <GlyphShape stage={m.stage} x={x(p)} y={y} size={9} hollow={hollowSeries} />
                        </Mark>
                        <Mark
                          x={x(r)}
                          y={y}
                          label={`${m.label}, ${tailLabel(k)}: realised rate ${fmt(r, "pct")}`}
                          tip={<TipBody title={`${m.label} · ${tailLabel(k)}`} lines={[`realised rate ${fmtNum(r, "pct")}`]} path={path(m, `tailmass.real${k}`)} />}
                        >
                          <circle cx={x(r)} cy={y} r={4.5} fill="var(--bg)" stroke={hollowSeries ? "var(--ink-3)" : "var(--ink)"} strokeWidth={1.5} />
                        </Mark>
                      </g>
                    );
                  })}
                  <text x={w - R + 10} y={y + 4} style={{ fill: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                    {isNum(ratio) ? `×${fmtNum(ratio, "num2")}` : "—"}
                    {b && (
                      <tspan style={{ fill: "var(--ink-3)" }}>
                        {" "}
                        [{fmtNum(b[0], "num2")}, {fmtNum(b[1], "num2")}]
                      </tspan>
                    )}
                  </text>
                  <text x={w - R + 10} y={y + 15} style={{ fill: "var(--ink-3)", fontSize: 10 }}>
                    {i === 0 ? "realised / predicted" : ""}
                  </text>
                  {isNum(pred) && isNum(real) && i === 0 && (
                    <>
                      <text x={x(pred)} y={y - 9} textAnchor="middle" style={{ fontSize: 10, fill: "var(--ink-2)" }}>
                        predicted
                      </text>
                      <text x={x(real)} y={y + 16} textAnchor="middle" style={{ fontSize: 10, fill: "var(--ink-2)" }}>
                        realised
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </svg>
        );
      }}
    </ChartFrame>
  );
}

/**
 * Tail reliability diagram: quartiles of predicted mass m_k, mean predicted (x) vs mean realised (y), log–log, with the
 * diagonal. Threshold series are told apart by glyph size (10⁻² largest) and are labelled; compare models are hollow.
 */
export function TailReliabilityDiagram({ model, compare = [] }: { model: Model; compare?: Model[] }) {
  const series = [model, ...compare].filter((m) => m.tailmass);
  const pts = series.flatMap((m) => TAIL_KS.flatMap((k) => ((m.tailmass?.[`bins${k}`] ?? []) as TailBin[]).map((b, i) => ({ m, k, i, b }))));
  const xs = pts.flatMap((p) => [p.b[0], p.b[1]]).filter((v): v is number => isNum(v) && v > 0);
  if (!xs.length) return null;
  const lo = Math.pow(10, Math.floor(Math.log10(Math.min(...xs))));
  const hi = Math.pow(10, Math.ceil(Math.log10(Math.max(...xs))));
  const ticks: number[] = [];
  for (let t = lo; t <= hi * 1.0001; t *= 10) ticks.push(t);
  const aria =
    `Tail reliability for ${model.label}: ` +
    TAIL_KS.map((k) => `${tailLabel(k)}: ` + ((model.tailmass?.[`bins${k}`] ?? []) as TailBin[]).map((b) => `predicted ${fmt(b[0], "pct")} realised ${fmt(b[1], "pct")}`).join(", ")).join("; ");
  return (
    <ChartFrame ariaLabel={aria} maxWidth={380}>
      {(w) => {
        const size = Math.max(220, Math.min(320, w - 56));
        const L = 46;
        const T = 16;
        const x = log10Scale([lo, hi], [L, L + size]);
        const y = log10Scale([lo, hi], [T + size, T]);
        const fmtTick = (v: number) => (v >= 0.01 ? fmt(v, "pct") : `10${v === 0.001 ? "⁻³" : v === 0.0001 ? "⁻⁴" : "^" + Math.round(Math.log10(v))}`);
        return (
          <svg width={L + size + 10} height={T + size + 44}>
            <rect x={L} y={T} width={size} height={size} fill="var(--bg)" opacity={0.5} />
            <XAxis scale={x} y={T + size} ticks={ticks} format={fmtTick} gridTop={T} />
            <YAxis scale={y} x={L} ticks={ticks} format={fmtTick} gridRight={L + size} />
            <line x1={x(lo)} y1={y(lo)} x2={x(hi)} y2={y(hi)} stroke="var(--ink-2)" strokeDasharray="4 3" />
            <text x={x(hi) - 4} y={y(lo) - 24} textAnchor="end" style={{ fontStyle: "italic" }}>
              over-confident below
            </text>
            <text x={L + size} y={T + size + 30} textAnchor="end" style={{ fill: "var(--ink-2)" }}>
              mean predicted tail mass in the quartile
            </text>
            <text x={L - 40} y={10} style={{ fill: "var(--ink-2)" }}>
              realised rate
            </text>
            {pts
              .filter((p) => isNum(p.b[0]) && isNum(p.b[1]) && p.b[0]! > 0 && p.b[1]! > 0)
              .map((p) => {
                const hollow = p.m.id !== model.id;
                const sz = p.k === 2 ? 11 : p.k === 3 ? 8 : 5.5;
                return (
                  <Mark
                    key={`${p.m.id}-${p.k}-${p.i}`}
                    x={x(p.b[0]!)}
                    y={y(p.b[1]!)}
                    label={`${p.m.label}, ${tailLabel(p.k)}, quartile ${p.i + 1}: predicted ${fmt(p.b[0], "pct")}, realised ${fmt(p.b[1], "pct")}, ${fmt(p.b[2], "count")} positions`}
                    tip={
                      <TipBody
                        title={`${p.m.label} · ${tailLabel(p.k)} · quartile ${p.i + 1}`}
                        lines={[`predicted ${fmtNum(p.b[0], "pct")}`, `realised ${fmtNum(p.b[1], "pct")}`, `${fmt(p.b[2], "count")} positions`]}
                        path={`${path(p.m, `tailmass.bins${p.k}`)}[${p.i}]`}
                      />
                    }
                  >
                    <GlyphShape stage={p.m.stage} x={x(p.b[0]!)} y={y(p.b[1]!)} size={sz} hollow={hollow} />
                  </Mark>
                );
              })}
            {TAIL_KS.map((k, i) => (
              <g key={k} transform={`translate(${L + 8 + i * 70}, ${T + 12})`}>
                <GlyphShape stage={model.stage} x={0} y={0} size={k === 2 ? 11 : k === 3 ? 8 : 5.5} />
                <text x={10} y={4} style={{ fontSize: 11 }}>
                  {tailLabel(k)}
                </text>
              </g>
            ))}
          </svg>
        );
      }}
    </ChartFrame>
  );
}

const FLOOR = 1e-12;

/**
 * Prior mass on a log axis: the two set masses as bars, then the most probable templates. Bars start at 10⁻¹²;
 * the marker rate (sampled, with its CI) is printed by the caller.
 */
export function PriorMassBars({ model, bundle, compare = [] }: { model: Model; bundle: Bundle; compare?: Model[] }) {
  const pr = model.prior as Prior;
  const openers = bundle.reference.prior_openers ?? {};
  const top = Object.entries(pr.logp)
    .filter(([n, v]) => isNum(v) && openers[n]?.set !== "ctrl")
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 6);
  type Row = { label: string; sub?: string; value: number | null; path: string; kind: "set" | "tpl" };
  const rows: Row[] = [
    { label: "any instruction opener", sub: `${Object.values(openers).filter((o) => o.set === "instr").length || "—"} templates`, value: pr.instr_mass ?? null, path: path(model, "prior.instr_mass"), kind: "set" },
    { label: "any control opener", sub: `${Object.values(openers).filter((o) => o.set === "ctrl").length || "—"} natural starts`, value: pr.ctrl_mass ?? null, path: path(model, "prior.ctrl_mass"), kind: "set" },
    ...top.map(([n, v]) => ({ label: n, sub: openers[n] ? JSON.stringify(openers[n].text) : undefined, value: Math.exp(v as number), path: `exp(${path(model, ["prior", "logp", n])})`, kind: "tpl" as const })),
  ];
  const ghosts = (row: Row) =>
    compare
      .filter((c) => c.prior)
      .map((c) => {
        if (row.kind === "set") return { c, v: row.label.startsWith("any instruction") ? c.prior!.instr_mass ?? null : c.prior!.ctrl_mass ?? null };
        const lp = c.prior!.logp[row.label];
        return { c, v: isNum(lp) ? Math.exp(lp) : null };
      });
  const aria = `Prior mass for ${model.label}: ` + rows.map((r) => `${r.label} ${fmtMass(r.value)}`).join("; ");
  return (
    <ChartFrame ariaLabel={aria}>
      {(w) => {
        const L = Math.min(190, w * 0.42);
        const R = 70;
        const x = log10Scale([FLOOR, 1], [L, w - R]);
        const rh = 26;
        const ticks = [1e-12, 1e-9, 1e-6, 1e-3, 1].filter((t) => w > 420 || t !== 1e-9);
        const H = rows.length * rh + 46;
        return (
          <svg width={w} height={H}>
            <XAxis scale={x} y={rows.length * rh + 4} ticks={ticks} format={(v) => `10${supExp(Math.round(Math.log10(v)))}`} gridTop={0} />
            <text x={w - R} y={H - 6} textAnchor="end" style={{ fill: "var(--ink-2)" }}>
              probability the document starts this way (log axis)
            </text>
            {rows.map((r, i) => {
              const y = i * rh;
              const v = isNum(r.value) ? Math.max(FLOOR, r.value) : null;
              return (
                <g key={r.label}>
                  <text x={L - 8} y={y + rh / 2 + 1} textAnchor="end" style={{ fontWeight: r.kind === "set" ? 600 : 400 }}>
                    {r.label}
                  </text>
                  {r.sub && (
                    <text x={L - 8} y={y + rh / 2 + 11} textAnchor="end" style={{ fontSize: 10, fill: "var(--ink-3)", fontFamily: r.kind === "tpl" ? "var(--f-mono)" : undefined }}>
                      {r.sub.length > 28 ? r.sub.slice(0, 27) + "…" : r.sub}
                    </text>
                  )}
                  {v !== null && (
                    <Mark x={x(v)} y={y + rh / 2 - 4} label={`${r.label}: ${fmtMass(r.value)}`} tip={<TipBody title={r.label} lines={[fmtMass(r.value)]} path={r.path} />}>
                      <rect x={x(FLOOR)} y={y + 6} width={Math.max(1, x(v) - x(FLOOR))} height={rh - 14} fill={r.kind === "set" ? "var(--bar)" : "var(--ink-3)"} />
                    </Mark>
                  )}
                  {ghosts(r).map(({ c, v: gv }) =>
                    isNum(gv) ? <line key={c.id} x1={x(Math.max(FLOOR, gv))} x2={x(Math.max(FLOOR, gv))} y1={y + 3} y2={y + rh - 5} stroke="var(--ink-2)" strokeWidth={1.5} strokeDasharray="2 1" /> : null,
                  )}
                  <text x={w - R + 8} y={y + rh / 2 + 4} style={{ fontVariantNumeric: "tabular-nums" }}>
                    {fmtMass(r.value)}
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

export function supExp(n: number): string {
  const sup: Record<string, string> = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻" };
  return String(n).split("").map((c) => sup[c] ?? c).join("");
}

/** 5.8% above 1e-3, else 1.6×10⁻⁴ style. */
export function fmtMass(v: number | null | undefined): string {
  if (!isNum(v)) return "—";
  if (v >= 1e-3) return fmt(v, "pct");
  if (v <= 0) return "0";
  const e = Math.floor(Math.log10(v));
  const m = v / Math.pow(10, e);
  return `${m.toFixed(1)}×10${supExp(e)}`;
}

export const OOD_GENRES: { key: string; label: string; note: string }[] = [
  { key: "hexdump", label: "hex dump", note: "random bytes, xxd layout" },
  { key: "base64", label: "base64", note: "random bytes" },
  { key: "minified_js", label: "minified JS", note: "this site's build" },
  { key: "chess_pgn", label: "chess PGN", note: "random-walk games" },
  { key: "dna_fasta", label: "DNA FASTA", note: "uniform ACGT" },
  { key: "shuffled_english", label: "shuffled English", note: "Pile words, shuffled" },
  { key: "random_csv", label: "random CSV", note: "random numbers" },
];

export function oodRows(m: Model): { key: string; label: string; note: string; stats: TailStats | null }[] {
  const o = m.ood ?? {};
  const known = OOD_GENRES.map((g) => ({ ...g, stats: o[g.key] ?? null }));
  const extra = Object.keys(o)
    .filter((k) => k !== "ALL" && !OOD_GENRES.some((g) => g.key === k))
    .map((k) => ({ key: k, label: k, note: "", stats: o[k] ?? null }));
  return [...known, ...extra].filter((r) => r.stats);
}

export { MINUS };
