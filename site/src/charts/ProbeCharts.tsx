/**
 * Validation probes (methodology {#probes}): the overall score against statistics that are not terms of it.
 * Panel 1: score vs Wikipedia verbatim share. Panel 2: score vs few-shot surname KL. Every checkpoint is a stage glyph;
 * Spearman ρ is computed here (src/lib/stats.ts) and printed by the page through Num(derived).
 */
import { path } from "../data/bundle";
import { probeValue } from "../data/derive";
import { PROBE_META, type ProbeKey } from "../data/method";
import type { Bundle, Model } from "../data/types";
import { ChartFrame, Mark, TipBody } from "../components/Chart";
import { GlyphShape } from "../components/Glyph";
import { XAxis, YAxis } from "../components/Axis";
import { fmt, fmtNum, isNum } from "../lib/numfmt";
import { linear, niceTicks } from "../lib/scale";
import { spearman } from "../lib/stats";

export interface ProbeStat {
  key: ProbeKey;
  pairs: { m: Model; x: number; y: number }[];
  rho: number | null;
  n: number;
}

export function probeStat(bundle: Bundle, key: ProbeKey): ProbeStat {
  const pairs = bundle.models
    .map((m) => ({ m, x: m.score, y: probeValue(m, key) }))
    .filter((p): p is { m: Model; x: number; y: number } => isNum(p.x) && isNum(p.y));
  return { key, pairs, rho: spearman(pairs.map((p) => [p.x, p.y])), n: pairs.length };
}

const Y_KIND = { memo: "pct", KL_few: "kl" } as const;
const Y_TITLE = { memo: "Wikipedia verbatim share (X_runfrac_wiki)", KL_few: "few-shot surname KL(Census ‖ model), nats" } as const;
const Y_PATH = { memo: "subscores.memo.value", KL_few: "surnames.KL_few" } as const;

function Panel({ stat, width, highlight }: { stat: ProbeStat; width: number; highlight?: string }) {
  const { key, pairs } = stat;
  const L = 52;
  const T = 10;
  const w = Math.max(200, width);
  const h = Math.min(260, Math.max(180, w * 0.7));
  const ymax = Math.max(0.01, ...pairs.map((p) => p.y));
  const x = linear([0, 1], [L, w - 10]);
  const y = linear([0, ymax * 1.06], [T + h, T]);
  const yt = niceTicks(0, ymax * 1.06, 4);
  return (
    <svg width={w} height={T + h + 48}>
      <rect x={L} y={T} width={w - 10 - L} height={h} fill="var(--bg)" opacity={0.5} />
      <XAxis scale={x} y={T + h} ticks={[0, 0.25, 0.5, 0.75, 1]} format={(v) => String(v)} gridTop={T} />
      <YAxis scale={y} x={L} ticks={yt} format={(v) => fmt(v, Y_KIND[key]).replace(/\s*nats$/, "")} gridRight={w - 10} />
      <text x={w - 10} y={T + h + 30} textAnchor="end" style={{ fill: "var(--ink-2)" }}>
        overall score (1 = pre-anneal-like) →
      </text>
      <text x={L - 46} y={T - 1} style={{ fill: "var(--ink-2)" }}>
        {PROBE_META[key].name}
      </text>
      {pairs.map((p) => (
        <Mark
          key={p.m.id}
          x={x(p.x)}
          y={y(p.y)}
          href={`/model/${encodeURIComponent(p.m.id)}`}
          label={`${p.m.family} ${p.m.label} (${p.m.stage}): score ${fmt(p.x, "score")}, ${PROBE_META[key].name} ${fmt(p.y, Y_KIND[key])}`}
          tip={<TipBody title={`${p.m.family} · ${p.m.label}`} lines={[`${p.m.stage}`, `score ${fmtNum(p.x, "score")}`, `${PROBE_META[key].name} ${fmtNum(p.y, Y_KIND[key])}`]} path={path(p.m, Y_PATH[key])} />}
        >
          <GlyphShape stage={p.m.stage} x={x(p.x)} y={y(p.y)} size={highlight === p.m.id ? 12 : 9} />
        </Mark>
      ))}
      <text x={L + 8} y={T + 16} style={{ fill: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
        Spearman ρ = {stat.rho === null ? "—" : fmtNum(stat.rho, "num2")} · n = {stat.n}
      </text>
    </svg>
  );
}

/** Two panels side by side (stacked on phones). */
export function ProbePanels({ bundle, stats, highlight }: { bundle: Bundle; stats?: ProbeStat[]; highlight?: string }) {
  const st = stats ?? (["memo", "KL_few"] as ProbeKey[]).map((k) => probeStat(bundle, k));
  const aria = st.map((s) => `${PROBE_META[s.key].name} vs overall score, Spearman ${s.rho === null ? "undefined" : s.rho.toFixed(2)} over ${s.n} checkpoints`).join("; ");
  return (
    <ChartFrame ariaLabel={aria}>
      {(w) => {
        const two = w >= 560;
        const pw = two ? (w - 24) / 2 : w;
        return (
          <div style={{ display: "flex", flexWrap: "wrap", gap: two ? 24 : 12 }}>
            {st.map((s) => (
              <div key={s.key} style={{ width: pw, minWidth: 0 }}>
                <Panel stat={s} width={pw} highlight={highlight} />
                <p className="small ink2" style={{ margin: "0 0 0 52px" }}>
                  {Y_TITLE[s.key]}
                </p>
              </div>
            ))}
          </div>
        );
      }}
    </ChartFrame>
  );
}
