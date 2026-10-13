/**
 * Explainer (a) One position: entropy, varentropy, surprisal (DESIGN §8 a).
 * The distribution SHAPE is constructed (p_k ∝ r^k over 64 candidates, entropy = the model's F_H); H, s and the gap
 * are the model's bundle values. If bundle.explainers.position exists, the measured top-16 replaces the construction.
 */
import { useMemo, useState } from "react";
import type { ExplainerProps } from "./types";
import type { Bundle, Model } from "../data/types";
import { fp, getAny } from "../data/bundle";
import { specimenPair } from "../data/derive";
import { useWidth } from "../components/Chart";
import { XAxis } from "../components/Axis";
import { fmt, fmtNum, isNum } from "../lib/numfmt";
import { linear, niceStep } from "../lib/scale";
import { ExplainerShell, Tag, type StepSpec } from "./kit/Shell";
import { ModelPicker } from "./kit/Picker";
import { useStepper } from "./kit/useStepper";
import { InlineGlyph } from "./kit/InlineGlyph";
import { easeInOut, easeSettle, lerp, seg, stagger } from "./kit/anim";
import { geometricWithEntropy } from "./kit/construct";
import { fk, full, N, pn, resolveIds, tx } from "./kit/num";

const N_CAND = 64;
const N_BARS = 16;
const LANE_MAX = 8;
const DURS = [900, 1300, 900, 700, 800, 700, 1500];

interface Spec {
  model: Model;
  H: number;
  s: number;
  gap: number;
  /** probabilities in rank order (constructed or measured top-k) */
  p: number[];
  /** pooled "all other tokens" mass when p is a measured top-k */
  otherMass: number | null;
  V: number;
  measured: boolean;
  tokens: string[] | null;
}

interface MeasuredPos {
  top?: [string, number][];
  other_mass?: number;
  H?: number;
  V?: number;
  s?: number;
}

const eligible = (m: Model) => isNum(fp(m, "F_H")) && isNum(fp(m, "F_CE")) && isNum(fp(m, "F_calib_gap"));

function specOf(bundle: Bundle, m: Model): Spec {
  const meas = getAny(bundle, ["explainers", "position", "models", m.id]) as MeasuredPos | null;
  if (meas && Array.isArray(meas.top) && meas.top.length && isNum(meas.H) && isNum(meas.s)) {
    const top = meas.top.slice(0, N_BARS);
    return {
      model: m,
      H: meas.H,
      s: meas.s,
      gap: meas.H - meas.s,
      p: top.map((x) => x[1]),
      otherMass: isNum(meas.other_mass) ? meas.other_mass : Math.max(0, 1 - top.reduce((a, x) => a + x[1], 0)),
      V: isNum(meas.V) ? meas.V : 0,
      measured: true,
      tokens: top.map((x) => x[0]),
    };
  }
  const H = fp(m, "F_H")!;
  const c = geometricWithEntropy(H, N_CAND);
  return { model: m, H, s: fp(m, "F_CE")!, gap: fp(m, "F_calib_gap")!, p: c.p, otherMass: null, V: c.V, measured: false, tokens: null };
}

/** bar heights: top-16 plus pooled rest */
function barsOf(sp: Spec): number[] {
  const top = sp.p.slice(0, N_BARS);
  const rest = sp.otherMass ?? sp.p.slice(N_BARS).reduce((a, b) => a + b, 0);
  return [...top, rest];
}

interface Prog {
  bars: number;
  drop: number;
  fulcrum: number;
  band: number;
  s: number;
  gap: number;
  /** 0 = A, 1 = B */
  mix: number;
}

function Figure({ W, A, B, prog, ymax, ghost }: { W: number; A: Spec; B: Spec | null; prog: Prog; ymax: number; ghost: boolean }) {
  const mix = B ? prog.mix : 0;
  const cur = mix >= 0.5 && B ? B : A;
  const L = 40;
  const R = 12;
  const pw = W - L - R;
  const narrow = W < 480;
  const T = narrow ? 40 : 26;
  const BH = 132;
  const barBase = T + BH;
  const laneY = barBase + 150;
  const axisY = laneY + 20;
  const H = B ? lerp(A.H, B.H, mix) : A.H;
  const s = B ? lerp(A.s, B.s, mix) : A.s;
  const sdV = Math.sqrt(B ? lerp(A.V, B.V, mix) : A.V);
  const nP = Math.max(A.p.length, B?.p.length ?? 0);
  const pAt = (k: number) => (B ? lerp(A.p[k] ?? 0, B.p[k] ?? 0, mix) : A.p[k] ?? 0);
  const barsA = barsOf(A);
  const barsB = B ? barsOf(B) : barsA;
  const nb = barsA.length;
  const bw = pw / nb;
  const y = linear([0, ymax], [barBase, T]);
  const x = linear([0, LANE_MAX], [L, L + pw]);
  const yTicks = (() => {
    const st = niceStep(ymax, 3);
    const out: number[] = [];
    for (let v = 0; v <= ymax + 1e-9; v += st) out.push(+v.toFixed(6));
    return out;
  })();
  const Rmax = Math.min(16, bw * 0.9);
  const dots: { cx: number; cy: number; r: number; key: number }[] = [];
  let beyond = 0;
  let beyondMass = 0;
  for (let k = 0; k < nP; k++) {
    const p = pAt(k);
    if (!(p > 0)) continue;
    const sur = -Math.log(p);
    const r = Math.max(0.9, Rmax * Math.sqrt(p));
    const bi = Math.min(k, nb - 1);
    const fromX = L + bw * (bi + 0.5);
    const fromY = y(k < N_BARS ? p : barsOf(cur)[nb - 1]);
    const d = easeSettle(stagger(prog.drop, bi, nb, 0.45, 0.5));
    if (sur > LANE_MAX && d >= 1) {
      beyond += 1;
      beyondMass += p;
      continue;
    }
    const toX = x(Math.min(sur, LANE_MAX));
    const toY = laneY - r;
    if (prog.drop <= 0) continue;
    dots.push({ cx: lerp(fromX, toX, d), cy: lerp(fromY, toY, d), r, key: k });
  }
  const fx = lerp(x(0), x(H), easeInOut(prog.fulcrum));
  const leftFirst = s < H; // label placement: the smaller value's label goes to the left
  const sY = lerp(laneY - 120, laneY - 6, easeSettle(prog.s));
  const totalH = axisY + 44;
  const tokenLabel = (i: number) => (cur.tokens ? cur.tokens[i] ?? "" : `t${i + 1}`);
  const showEvery = bw >= 22 ? 1 : 2;
  return (
    <svg width={W} height={totalH} viewBox={`0 0 ${W} ${totalH}`}>
      {/* distribution */}
      <text x={L - 34} y={narrow ? 28 : 12} className="ink2">
        probability
      </text>
      <Tag x={narrow ? 0 : W - R} y={12} anchor={narrow ? "start" : "end"}>
        {cur.measured ? "measured at one post-cutoff position" : "distribution shape constructed; H and s from bundle"}
      </Tag>
      {yTicks.map((v) => (
        <g key={v}>
          <line x1={L} x2={L + pw} y1={y(v)} y2={y(v)} stroke="var(--rule)" />
          <text x={L - 6} y={y(v)} dy="0.32em" textAnchor="end">
            {fmtNum(v, "num2")}
          </text>
        </g>
      ))}
      {barsA.map((_, i) => {
        const v = B ? lerp(barsA[i] ?? 0, barsB[i] ?? 0, mix) : barsA[i];
        const h = (barBase - y(v)) * easeSettle(stagger(prog.bars, i, nb, 0.4, 0.55));
        const last = i === nb - 1;
        return (
          <g key={i}>
            <rect x={L + bw * i + 1.5} width={Math.max(1, bw - 3)} y={barBase - h} height={h} fill={last ? "var(--rule-strong)" : "var(--bar)"} />
            {(i % showEvery === 0 || last) && (
              <text x={L + bw * (i + 0.5)} y={barBase + 13} textAnchor="middle" className={cur.tokens && !last ? "mono" : undefined}>
                {last ? "rest" : tokenLabel(i)}
              </text>
            )}
          </g>
        );
      })}
      <line x1={L} x2={L + pw} y1={barBase} y2={barBase} stroke="var(--rule-strong)" />
      <text x={L + pw} y={barBase + 27} textAnchor="end">
        “rest” = all other tokens{cur.measured ? "" : `, ${N_CAND - N_BARS} pooled`}
      </text>

      {/* surprisal lane */}
      <text x={L} y={laneY - 112} className="xp-panel">
        Surprisal lane
      </text>
      <line x1={L} x2={L + pw} y1={laneY} y2={laneY} stroke="var(--ink-2)" strokeWidth={1} />
      {/* ±√V band (constructed, not printed) */}
      {prog.band > 0 && sdV > 0 && (
        <g opacity={prog.band}>
          <line x1={x(Math.max(0, H - sdV))} x2={x(Math.min(LANE_MAX, H + sdV))} y1={laneY - 40} y2={laneY - 40} stroke="var(--ink-2)" />
          <line x1={x(Math.max(0, H - sdV))} x2={x(Math.max(0, H - sdV))} y1={laneY - 44} y2={laneY - 36} stroke="var(--ink-2)" />
          <line x1={x(Math.min(LANE_MAX, H + sdV))} x2={x(Math.min(LANE_MAX, H + sdV))} y1={laneY - 44} y2={laneY - 36} stroke="var(--ink-2)" />
          <text x={x(Math.min(LANE_MAX, H + sdV)) + 4} y={laneY - 40} dy="0.32em" className="it">
            ±√V {cur.measured ? "" : "(constructed)"}
          </text>
        </g>
      )}
      {dots.map((d) => (
        <circle key={d.key} cx={d.cx} cy={d.cy} r={d.r} fill="var(--bar)" fillOpacity={0.78} stroke="var(--bg-plate)" strokeWidth={0.5} />
      ))}
      {beyond > 0 && (
        <text x={L + pw} y={laneY - 8} textAnchor="end">
          +{beyond} beyond {LANE_MAX} nats (p {fmt(beyondMass, "pct")}) →
        </text>
      )}
      {/* ghost of A's H and s after the switch */}
      {ghost && B && mix >= 1 && (
        <g>
          <line x1={x(A.H)} x2={x(A.H)} y1={laneY - 24} y2={laneY + 12} stroke="var(--ink-3)" strokeDasharray="2 2" />
          <circle cx={x(A.s)} cy={laneY - 6} r={5} fill="none" stroke="var(--ink-3)" strokeWidth={1.5} />
          <text x={x(Math.max(A.H, A.s)) + 8} y={laneY + 4} className="it">
            A
          </text>
        </g>
      )}
      {/* fulcrum: entropy as the balance point */}
      {prog.fulcrum > 0 && (
        <g>
          <polygon points={`${fx},${laneY + 1} ${fx + 7},${laneY + 14} ${fx - 7},${laneY + 14}`} fill="var(--ink)" />
          {prog.fulcrum >= 1 && (
            <>
              <line x1={x(H)} x2={x(H)} y1={laneY - 52} y2={laneY} stroke="var(--ink)" strokeDasharray="3 2" />
              <text x={x(H) + (leftFirst ? 4 : -4)} y={laneY - 56} textAnchor={leftFirst ? "start" : "end"} className="ink b">
                H = {fmt(cur.H, "nats")}
              </text>
            </>
          )}
        </g>
      )}
      {/* real token */}
      {prog.s > 0 && (
        <g>
          <circle cx={x(s)} cy={sY} r={6} fill="var(--hl)" stroke="var(--ink)" strokeWidth={2} />
          {prog.s >= 1 && (
            <text x={x(s) + (leftFirst ? -4 : 4)} y={laneY - 56} textAnchor={leftFirst ? "end" : "start"} className="ink">
              s = {fmt(cur.s, "nats")}
            </text>
          )}
        </g>
      )}
      {/* the gap bracket, from s to H */}
      {prog.gap > 0 && (
        <g>
          {(() => {
            const x0 = x(s);
            const x1 = lerp(x0, x(H), prog.gap);
            const by = laneY - 76;
            return (
              <>
                <line x1={x0} x2={x1} y1={by} y2={by} stroke="var(--ink)" strokeWidth={1.5} />
                <line x1={x0} x2={x0} y1={by - 4} y2={by + 4} stroke="var(--ink)" strokeWidth={1.5} />
                <line x1={x1} x2={x1} y1={by - 4} y2={by + 4} stroke="var(--ink)" strokeWidth={1.5} />
                {prog.gap > 0.5 && (
                  <text x={Math.min(L + pw - 4, Math.max(L + 4, (x0 + x(H)) / 2))} y={by - 8} textAnchor="middle" className="ink b">
                    H − s = {fmt(cur.gap, "gap")}
                  </text>
                )}
              </>
            );
          })()}
        </g>
      )}
      <XAxis scale={x} y={axisY} ticks={[0, 1, 2, 3, 4, 5, 6, 7, 8]} format={(v) => String(v)} title="surprisal −log p, nats (linear)" titleOffset={34} />
    </svg>
  );
}

export default function Position({ bundle, reducedMotion }: ExplainerProps) {
  const sp = specimenPair(bundle);
  const [ids, setIds] = useState<(string | null)[]>([sp?.A.id ?? null, sp?.B.id ?? null]);
  const [A, B] = resolveIds(bundle, ids, eligible);
  const st = useStepper(DURS, reducedMotion);
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const W = Math.min(640, width);
  const sa = useMemo(() => (A ? specOf(bundle, A) : null), [bundle, A]);
  const sb = useMemo(() => (B ? specOf(bundle, B) : null), [bundle, B]);
  if (!A || !B || !sa || !sb) return <p className="pending">No checkpoint with F_H, F_CE and F_calib_gap in this bundle.</p>;

  const ymax = (() => {
    const m = Math.max(...barsOf(sa), ...barsOf(sb));
    const stp = niceStep(m, 4);
    return Math.ceil(m / stp) * stp;
  })();
  const at = st.at;
  const prog: Prog = {
    bars: at(0),
    drop: at(1),
    fulcrum: at(2),
    band: at(3),
    s: at(4),
    gap: at(5),
    mix: easeInOut(seg(at(6), 0.1, 0.9)),
  };
  const reducedFinal = st.reduced && st.step === 6;
  const full1: Prog = { bars: 1, drop: 1, fulcrum: 1, band: 1, s: 1, gap: 1, mix: 0 };

  const constructed = !sa.measured || !sb.measured;
  const steps: StepSpec[] = [
    {
      title: "Every token gets a probability",
      body: (
        <>
          At one position the model spreads probability over its whole vocabulary. The 16 most likely candidates are bars; the rest are pooled.
          {constructed ? (
            <>
              {" "}
              The shape is constructed so that its entropy equals <N m={A} k={fk("F_H")} f="nats" />, the mean entropy of {A.label} on post-cutoff
              text.
            </>
          ) : null}
        </>
      ),
      summary: `Bars show the probability of the 16 most likely tokens and the pooled rest; the shape has entropy ${tx(A, fk("F_H"), "nats")}.`,
    },
    {
      title: "Probability becomes surprise",
      body: (
        <>
          Each candidate drops onto the surprisal lane at −log p nats, with dot area proportional to its probability. Likely tokens land near 0 and
          unlikely ones far to the right: rank order has become position on an axis.
        </>
      ),
      summary: "Each candidate drops onto the surprisal axis at minus log p; dot area is its probability.",
    },
    {
      title: "Entropy is the balance point",
      body: (
        <>
          Entropy H is the probability-weighted mean surprise, the point where the lane balances: H = <N m={A} k={fk("F_H")} f="nats" />, this
          model’s mean on post-cutoff text.
        </>
      ),
      summary: `Entropy is the balance point of the dots: H = ${tx(A, fk("F_H"), "nats")}.`,
    },
    {
      title: "Varentropy is how widely the weight is spread",
      body: (
        <>
          Varentropy V is the variance of surprise around H. The bracket shows ±√V of the drawn distribution and is not a measurement. Measured on Pile
          text, the median varentropy at positions with 2 ≤ H &lt; 3 nats is <N m={A} k={fk("Vmed|H2-3")} f="num3" />; on post-cutoff text, V/H at
          H &gt; 1 is <N m={A} k={fk("F_V/H|H>1")} f="num3" />.
        </>
      ),
      summary: `Varentropy is the spread of surprise around H; measured on Pile text, median varentropy at 2 ≤ H < 3 is ${tx(A, fk("Vmed|H2-3"), "num3")}.`,
    },
    {
      title: "Surprisal is where the real token landed",
      body: (
        <>
          Then the real next token is revealed. Its surprisal s = −log p(real token). Averaged over post-cutoff text, {A.label} pays s ={" "}
          <N m={A} k={fk("F_CE")} f="nats" /> per token: its cross-entropy.
        </>
      ),
      summary: `The real token lands at s = ${tx(A, fk("F_CE"), "nats")}.`,
    },
    {
      title: "The gap",
      body: (
        <>
          The bracket from s to H prints H − s = <N m={A} k={fk("F_calib_gap")} f="gap" />. Near zero, the model expected as much surprise as it
          got. Averaged over a corpus, this is the calibration gap.
        </>
      ),
      summary: `H minus s is ${tx(A, fk("F_calib_gap"), "gap")}.`,
    },
    {
      title: "Same position, specimen B",
      body: (
        <>
          {full(B)} concentrates its mass: H = <N m={B} k={fk("F_H")} f="nats" />, but the real tokens cost s ={" "}
          <N m={B} k={fk("F_CE")} f="nats" />. The fulcrum slides left, s moves right, and the bracket becomes H − s ={" "}
          <N m={B} k={fk("F_calib_gap")} f="gap" />. Over a corpus that is over-confidence: see <a href="#calibration-gap">the calibration gap</a>.
        </>
      ),
      summary: `For ${B.label}: H ${tx(B, fk("F_H"), "nats")}, s ${tx(B, fk("F_CE"), "nats")}, gap ${tx(B, fk("F_calib_gap"), "gap")}.`,
    },
  ];

  const figure = (
    <div ref={ref}>
      <p className="xp-context">
        <span className="xp-tagline">illustrative context</span>
        <span className="xp-context-text">
          The committee will meet again on the <span className="xp-caret" aria-label="next-token position" />
        </span>
      </p>
      {reducedFinal ? (
        <>
          <p className="xp-sub-label">
            <InlineGlyph stage={A.stage} size={8} />{" "}
            A · {full(A)}
          </p>
          <Figure W={W} A={sa} B={null} prog={full1} ymax={ymax} ghost={false} />
          <p className="xp-sub-label" style={{ marginTop: 12 }}>
            <InlineGlyph stage={B.stage} size={8} />{" "}
            B · {full(B)}
          </p>
          <Figure W={W} A={sb} B={null} prog={full1} ymax={ymax} ghost={false} />
        </>
      ) : (
        <>
          <p className="xp-sub-label">
            <InlineGlyph stage={(prog.mix >= 0.5 ? B : A).stage} size={8} />{" "}
            {prog.mix >= 0.5 ? `B · ${full(B)}` : `A · ${full(A)}`}
          </p>
          <Figure W={W} A={sa} B={sb} prog={prog} ymax={ymax} ghost />
        </>
      )}
    </div>
  );

  const label =
    `One position. ${A.label}: entropy ${fmt(sa.H, "nats")}, real-token surprisal ${fmt(sa.s, "nats")}, gap ${fmt(sa.gap, "gap")}. ` +
    `${B.label}: entropy ${fmt(sb.H, "nats")}, surprisal ${fmt(sb.s, "nats")}, gap ${fmt(sb.gap, "gap")}.`;
  const keys: [string, string, "nats" | "gap" | "num3"][] = [
    ["F_H", "entropy H, post-cutoff mean", "nats"],
    ["F_CE", "surprisal s (cross-entropy)", "nats"],
    ["F_calib_gap", "gap H − s", "gap"],
    ["Vmed|H2-3", "median V at 2 ≤ H < 3, Pile text", "num3"],
    ["F_V/H|H>1", "V/H at H > 1, post-cutoff text", "num3"],
  ];
  return (
    <ExplainerShell
      id="position"
      label="Plate A · One position: entropy, varentropy, surprisal"
      standfirst="At a single position, three numbers summarise the model’s guess and what actually came next."
      st={st}
      steps={steps}
      picker={
        <ModelPicker
          bundle={bundle}
          eligible={eligible}
          presets={sp ? [{ label: "A vs B (computed)", ids: [sp.A.id, sp.B.id], onSelect: () => setIds([sp.A.id, sp.B.id]) }] : []}
          slots={[
            { key: "A", label: "A", value: A.id, model: A, onChange: (id) => setIds([id, B.id]) },
            { key: "B", label: "B", value: B.id, model: B, hollow: true, onChange: (id) => setIds([A.id, id]) },
          ]}
          note="Default: the specimen family’s first pre-anneal rung (A) and last post-trained rung (B)."
        />
      }
      figure={figure}
      figureLabel={label}
      caption={
        constructed ? (
          <>
            Distribution shape constructed: p<sub>k</sub> ∝ r<sup>k</sup> over {N_CAND} candidates (top {N_BARS} drawn, the remaining{" "}
            {N_CAND - N_BARS} pooled), with r found by bisection so that its entropy equals the model’s F_H. The real-token marker sits at s = F_CE.
            Because F_calib_gap = F_H − F_CE, the bracket prints the bundle’s gap. ±√V belongs to the construction and is not printed; the measured
            varentropy figures are in the step text.
          </>
        ) : (
          <>Measured at one post-cutoff position: the real top-{N_BARS} probabilities, H, V and s of each model (bundle.explainers.position).</>
        )
      }
      sources={[
        `models[*].fingerprint.F_H, F_CE, F_calib_gap`,
        `models[*].fingerprint["Vmed|H2-3"], ["F_V/H|H>1"]`,
        ...(sa.measured || sb.measured ? ["explainers.position"] : []),
      ]}
      data={{
        columns: ["field", `A · ${A.label}`, `B · ${B.label}`],
        numeric: [false, true, true],
        rows: [
          ...keys.map(([k, name, f]) => [name, tx(A, fk(k), f), tx(B, fk(k), f)]),
          ["constructed p(t1)", fmtNum(sa.p[0], "num3"), fmtNum(sb.p[0], "num3")],
          ["constructed √V (not a measurement)", fmtNum(Math.sqrt(sa.V), "num3"), fmtNum(Math.sqrt(sb.V), "num3")],
        ],
      }}
      numbers={[
        ...keys.map(([k, name, f]) => pn(`A ${name}`, A, fk(k), f)),
        ...keys.slice(0, 3).map(([k, name, f]) => pn(`B ${name}`, B, fk(k), f)),
      ]}
    />
  );
}

