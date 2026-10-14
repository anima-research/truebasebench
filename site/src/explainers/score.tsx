/**
 * Explainer (f) Four ramps, one score (DESIGN §8 f). Interactive: the primary model's value glyphs are sliders
 * (drag, or arrow keys / PageUp / PageDown / Home / End); the sub-scores and the overall are recomputed with the same
 * ramps as docs/vh_truebase.py (src/data/scoring.ts) and labelled "edited" until reset.
 */
import { useEffect, useMemo, useState } from "react";
import type { ExplainerProps } from "./types";
import { SUB_KEYS, type Model, type SubKey } from "../data/types";
import { get, path } from "../data/bundle";
import { rampSpecimen, ranked, sameScorePair, recipeTrio, STAGE_CODE } from "../data/derive";
import { RAMPS, SUB_META } from "../data/method";
import { isScoredSub, scoredKeys, scoredKeysOf, subScore } from "../data/scoring";
import { useWidth } from "../components/Chart";
import { Num } from "../components/Num";
import { fmt, fmtNum, fmtTick, isNum } from "../lib/numfmt";
import { ExplainerShell, type StepSpec } from "./kit/Shell";
import { ModelPicker } from "./kit/Picker";
import { useStepper } from "./kit/useStepper";
import { InlineGlyph } from "./kit/InlineGlyph";
import { easeInOut, lerp, seg } from "./kit/anim";
import { fmtFeature, RampPlot, rampDomain } from "./kit/RampPlot";
import { full, N, pn, resolveIds } from "./kit/num";

const DURS = [700, 900, 900, 900, 1800, 1200];
const subPath = (k: SubKey, f: "value" | "score" | "source") => ["subscores", k, f];
const eligible = (m: Model) => isNum(m.score) && SUB_KEYS.some((k) => isNum(get(m, subPath(k, "score"))));

interface Row {
  k: SubKey;
  value: number | null;
  score: number | null;
  edited: boolean;
}

/** Rows for the keys that are terms of this model's overall (score v1: calib, spread, prior; v0: all four). */
function rowsOf(m: Model, edits: Partial<Record<SubKey, number>> = {}): Row[] {
  return scoredKeysOf(m).map((k) => {
    const e = edits[k];
    if (isNum(e)) return { k, value: e, score: subScore(k, e), edited: true };
    return { k, value: get(m, subPath(k, "value")), score: get(m, subPath(k, "score")), edited: false };
  });
}

function meanOf(rows: Row[]): { mean: number | null; n: number } {
  const s = rows.map((r) => r.score).filter(isNum);
  return { mean: s.length ? s.reduce((a, b) => a + b, 0) / s.length : null, n: s.length };
}

const featFmt = (k: SubKey) => (SUB_META[k].unit === "share" ? "pct" : k === "calib" ? "gap" : "nats") as "pct" | "gap" | "nats";

function AveragePanel({ width, rows, overall, prog, ghost }: { width: number; rows: Row[]; overall: number | null; prog: number; ghost: { rows: Row[]; overall: number | null } | null }) {
  const n = Math.max(1, rows.filter((r) => isNum(r.score)).length);
  const L = 38;
  const R = 70;
  const u = (width - L - R) / Math.max(3, rows.length);
  const rowH = 14;
  const top = 6;
  const sumY = top + rows.length * rowH + 18;
  const ovY = sumY + 40;
  const a = easeInOut(seg(prog, 0, 0.5));
  const b = easeInOut(seg(prog, 0.55, 1));
  let cum = 0;
  const segs = rows.map((r, i) => {
    const w = isNum(r.score) ? r.score * u : 0;
    const x0 = L + cum;
    if (isNum(r.score)) cum += w;
    return { r, i, w, x0 };
  });
  const sumLen = n * u;
  return (
    <svg width={width} height={ovY + 44} viewBox={`0 0 ${width} ${ovY + 44}`}>
      {/* per-score rows */}
      {segs.map(({ r, i }) => {
        const y = top + i * rowH;
        return (
          <g key={r.k}>
            <text x={L - 6} y={y + 5} dy="0.32em" textAnchor="end" className="ink2">
              {SUB_META[r.k].short}
            </text>
            <rect x={L} y={y} width={u} height={10} fill={isNum(r.score) ? "var(--track)" : "url(#hatch)"} />
            <text x={L + u + 6} y={y + 5} dy="0.32em" className={r.edited ? "ink it" : "ink"}>
              {isNum(r.score) ? fmtNum(r.score, "score") : "— not measured"}
            </text>
          </g>
        );
      })}
      {/* sum track 0..n */}
      <g opacity={prog > 0 ? 1 : 0.35}>
        <rect x={L} y={sumY} width={sumLen} height={10} fill="var(--track)" opacity={1 - b * 0.7} />
        {Array.from({ length: n + 1 }, (_, i) => (
          <g key={i} opacity={1 - b}>
            <line x1={L + i * u} x2={L + i * u} y1={sumY - 3} y2={sumY + 13} stroke="var(--rule-strong)" />
            <text x={L + i * u} y={sumY + 24} textAnchor="middle">
              {i}
            </text>
          </g>
        ))}
        <text x={L - 6} y={sumY + 5} dy="0.32em" textAnchor="end" className="ink2">
          Σ
        </text>
      </g>
      {/* overall track */}
      <text x={L - 6} y={ovY + 6} dy="0.32em" textAnchor="end" className="ink2 b">
        all
      </text>
      <rect x={L} y={ovY} width={u} height={12} fill={isNum(overall) ? "var(--track)" : "url(#hatch)"} />
      {[0.5, 1].map((t) => (
        <line key={t} x1={L + t * u} x2={L + t * u} y1={ovY - 2} y2={ovY + 14} stroke="var(--rule-strong)" />
      ))}
      <text x={L} y={ovY + 26}>
        0
      </text>
      <text x={L + u} y={ovY + 26} textAnchor="middle">
        1
      </text>
      {/* moving segments */}
      {segs.map(({ r, i, w, x0 }) => {
        if (!isNum(r.score)) return null;
        const yRow = top + i * rowH;
        const xA = lerp(L, x0, a);
        const yA = lerp(yRow, sumY, a);
        const scale = lerp(1, 1 / n, b);
        const x = L + (xA - L) * scale;
        const y = lerp(yA, ovY + 1, b);
        return <rect key={r.k} x={x} y={y} width={Math.max(0, w * scale)} height={10} fill="var(--bar)" stroke="var(--bg-plate)" strokeWidth={b < 1 ? 1 : 0} />;
      })}
      {b >= 1 && isNum(overall) && (
        <text x={L + u + 8} y={ovY + 6} dy="0.32em" className="ink b">
          {fmtNum(overall, "score")}
        </text>
      )}
      {ghost && isNum(ghost.overall) && b >= 1 && (
        <g>
          <rect x={L} y={ovY + 16} width={ghost.overall * u} height={6} fill="none" stroke="var(--ink-2)" strokeWidth={1.2} />
          <text x={L + u + 8} y={ovY + 20} dy="0.32em" className="ink2">
            {fmtNum(ghost.overall, "score")} (compare)
          </text>
        </g>
      )}
      <text x={width - 4} y={sumY + 5} dy="0.32em" textAnchor="end" className="it" opacity={a * (1 - b)}>
        end to end
      </text>
      <text x={width - 4} y={ovY + 6} dy="0.32em" textAnchor="end" className="it" opacity={b}>
        ÷ {n}
      </text>
    </svg>
  );
}

function Equation({ m, rows, label }: { m: Model; rows: Row[]; label?: string }) {
  const { mean, n } = meanOf(rows);
  const edited = rows.some((r) => r.edited);
  const diff = isNum(mean) && isNum(m.score) ? mean - m.score : null;
  const parts = rows.map((r) => (isNum(r.score) ? fmtNum(r.score, "score") : "—"));
  return (
    <p className="xp-eq">
      {label && <span className="ink3">{label} </span>}({parts.filter((p) => p !== "—").join(" + ")}) / {n} = <strong>{fmtNum(mean, "score")}</strong>{" "}
      {edited ? (
        <span className="ink3">
          · edited; bundle overall <Num path={path(m, "score")} fmt="score" />
        </span>
      ) : diff !== null && Math.abs(diff) <= 1e-9 ? (
        <span className="ink3">· matches bundle</span>
      ) : diff !== null ? (
        <span className="ink3">· differs from bundle by {fmtNum(diff, "raw")}</span>
      ) : null}
      {parts.includes("—") ? <span className="ink3"> · a missing sub-score is left out of the mean</span> : null}
    </p>
  );
}

export default function Score({ bundle, reducedMotion }: ExplainerProps) {
  const spec = rampSpecimen(bundle);
  const pair = sameScorePair(bundle);
  const trio = pair ? null : recipeTrio(bundle);
  const partnerOf = (m: Model | null) => (pair && m ? (m.id === pair.a.id ? pair.b : m.id === pair.b.id ? pair.a : null) : null);
  const defaultCompare = partnerOf(spec) ?? (pair ? pair.b : trio ? trio[1] : null);
  const [ids, setIds] = useState<(string | null)[]>([spec?.id ?? null, defaultCompare?.id ?? null]);
  const [P, C] = resolveIds(bundle, ids, eligible);
  const [edits, setEdits] = useState<Partial<Record<SubKey, number>>>({});
  const st = useStepper(DURS, reducedMotion);
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const W = Math.min(640, width);
  useEffect(() => setEdits({}), [P?.id]);
  const domains = useMemo(() => {
    const out = {} as Record<SubKey, [number, number]>;
    for (const k of SUB_KEYS) out[k] = rampDomain(k, [P, C].filter(Boolean).map((m) => get(m, subPath(k, "value"))));
    return out;
  }, [P, C]);
  if (!P || !C) return <p className="pending">No checkpoint with sub-scores in this bundle.</p>;

  const rows = rowsOf(P, edits);
  const crow = rowsOf(C);
  const { mean } = meanOf(rows);
  const edited = rows.some((r) => r.edited);
  const overall = edited ? mean : P.score;
  const showC = st.step >= 5;
  const at = st.at;
  const rk = ranked(bundle);
  const pIdx = rk.findIndex((r) => r.model.id === P.id);
  const walk = (d: number) => {
    const list = rk.filter((r) => eligible(r.model));
    const i = list.findIndex((r) => r.model.id === P.id);
    const nx = list[(i + d + list.length) % list.length]?.model;
    if (nx) setIds([nx.id, partnerOf(nx)?.id ?? C.id]);
  };
  const onDrag = (k: SubKey) => (v: number) => {
    setEdits((e) => ({ ...e, [k]: v }));
    if (st.step < 4) st.goto(4);
  };
  const pile = P.subscores?.calib?.source === "calib_gap";
  const SCORED = scoredKeys(bundle);
  const probeKeys = SUB_KEYS.filter((k) => !SCORED.includes(k));
  const nWord = SCORED.length === 3 ? "Three" : SCORED.length === 4 ? "Four" : String(SCORED.length);
  const probeScore = (m: Model, k: SubKey) => get(m, subPath(k, "score"));
  const listScores = (m: Model) => SCORED.map((k, i) => (
    <span key={k}>
      {i ? ", " : ""}
      {k} <N m={m} k={subPath(k, "score")} f="score" />
    </span>
  ));

  const half = W >= 560;
  const plotW = half ? (W - 16) / 2 : W;
  const prog = { glyph: at(0), ramp: at(1), drop: at(2), readoff: at(3) };
  const sameReason = Math.abs((P.score ?? 0) - (C.score ?? 0)) < 0.005;

  const steps: StepSpec[] = [
    {
      title: "Raw features are on different scales",
      body: (
        <>
          {full(P)} has a calibration gap of <N m={P} k={subPath("calib", "value")} f="gap" />, a spread of{" "}
          <N m={P} k={subPath("spread", "value")} f="nats" />, <N m={P} k={subPath("memo", "value")} f="pct" /> of Wikipedia in verbatim runs and
          chat markers in <N m={P} k={subPath("prior", "value")} f="pct" /> of bare-BOS samples.
        </>
      ),
      summary: `Raw features: gap ${fmt(get(P, subPath("calib", "value")), "gap")}, spread ${fmt(get(P, subPath("spread", "value")), "nats")}, memo ${fmt(get(P, subPath("memo", "value")), "pct")}, prior ${fmt(get(P, subPath("prior", "value")), "pct")}.`,
    },
    {
      title: "Each becomes 0–1 by a ramp anchored on known checkpoints",
      body: (
        <>
          Each feature passes through a clipped linear ramp: 1 at a true-base anchor, 0 at a post-trained anchor. The anchors were set on the Trinity
          TrueBase / Base / Preview triple and checked on the OLMo-2 ladder.
        </>
      ),
      summary: "Each feature passes through a clipped linear ramp from 1 at a true-base anchor to 0 at a post-trained anchor.",
    },
    {
      title: "Drop the value onto the ramp",
      body: (
        <>
          A line rises from each value until it meets its ramp. A value beyond an anchor lands on a plateau and is clipped to 0 or 1. Drag a glyph, or
          focus it and use the arrow keys, to move the value and watch the score follow.
        </>
      ),
      summary: "Each value rises to meet its ramp; values beyond an anchor are clipped.",
    },
    {
      title: "Carry the heights over",
      body: (
        <>
          The heights become sub-scores: {listScores(P)}.
          {probeKeys.length > 0 && (
            <>
              {" "}
              The {probeKeys.map((k) => SUB_META[k].name.toLowerCase()).join(", ")} ramp ({probeKeys.map((k) => <N key={k} m={P} k={subPath(k, "score")} f="score" />)}) is computed the same
              way but is a validation probe: it is not a term of the mean.
            </>
          )}
        </>
      ),
      summary: `Sub-scores: ${SCORED.map((k) => `${k} ${fmt(get(P, subPath(k, "score")), "score")}`).join(", ")}${probeKeys.length ? `; probe ${probeKeys.map((k) => `${k} ${fmt(probeScore(P, k), "score")}`).join(", ")} (not in the mean)` : ""}.`,
    },
    {
      title: "Average",
      body: (
        <>
          The sub-scores slide end to end, then compress by 1/n into the overall bar: <N m={P} k="score" f="score" />. 1 means indistinguishable from
          a pre-anneal checkpoint — a distance, not a quality ranking. A missing sub-score is left out and the denominator shrinks.
        </>
      ),
      summary: `Overall ${fmt(P.score, "score")}, the mean of the available sub-scores.`,
    },
    {
      title: "Same overall, different reasons",
      body: sameReason ? (
        <>
          {full(C)} (hollow) scores <N m={C} k="score" f="score" />, within 0.005 of {P.label}, from a different profile: {listScores(C)}. The
          sub-scores, not the overall, say what happened to a checkpoint.
        </>
      ) : (
        <>
          {full(C)} (hollow) scores <N m={C} k="score" f="score" /> from {listScores(C)}. Similar overall scores can come from different sub-scores.
        </>
      ),
      summary: `${C.label} scores ${fmt(C.score, "score")} with a different sub-score profile.`,
    },
  ];

  const picker = (
    <ModelPicker
      bundle={bundle}
      eligible={eligible}
      presets={[
        ...(spec ? [{ label: "Ramp specimen", ids: [spec.id, defaultCompare?.id ?? C.id], onSelect: () => setIds([spec.id, defaultCompare?.id ?? C.id]) }] : []),
        ...(pair ? [{ label: "Same-score pair", ids: [pair.a.id, pair.b.id], onSelect: () => setIds([pair.a.id, pair.b.id]) }] : []),
        ...(trio ? [{ label: "Recipe trio", ids: [trio[0].id, trio[1].id], onSelect: () => setIds([trio[0].id, trio[1].id]) }] : []),
      ]}
      slots={[
        { key: "P", label: "Model", value: P.id, model: P, onChange: (id) => setIds([id, C.id]) },
        { key: "C", label: "Compare", value: C.id, model: C, hollow: true, onChange: (id) => setIds([P.id, id]) },
      ]}
      extra={
        <div className="xp-walk" role="group" aria-label="Walk the ranked list">
          <button type="button" className="btn" onClick={() => walk(-1)} aria-label="Previous in ranked list">
            ‹ prev
          </button>
          <span className="small ink2">
            rank {pIdx >= 0 ? `${rk[pIdx].tie ? "=" : ""}${rk[pIdx].rank}` : "—"} of {rk.length}
          </span>
          <button type="button" className="btn" onClick={() => walk(1)} aria-label="Next in ranked list">
            next ›
          </button>
        </div>
      }
      note="Default: the checkpoint with the most sub-scores strictly between 0 and 1; compare: its same-score partner."
    />
  );

  const figure = (
    <div ref={ref}>
      <div className="xp-ramps" style={{ gridTemplateColumns: half ? "repeat(2, minmax(0, 1fr))" : "minmax(0, 1fr)" }}>
        {[...SCORED, ...probeKeys].map((k) => {
          const probe = !isScoredSub(P, k);
          // a probe ramp is drawn like the others (same ramp, same drop) but its height goes nowhere
          const r = rows.find((x) => x.k === k) ?? { k, value: get(P, subPath(k, "value")), score: get(P, subPath(k, "score")), edited: false };
          const c = crow.find((x) => x.k === k) ?? { k, value: get(C, subPath(k, "value")), score: get(C, subPath(k, "score")), edited: false };
          return (
            <div key={k} className={"xp-ramp" + (probe ? " xp-probe" : "")}>
              <p className="xp-sub-label">
                {SUB_META[k].name}
                {probe && <span className="probe-tag">probe · not in the mean</span>}{" "}
                <span className="ink3" style={{ textTransform: "none", letterSpacing: 0 }}>· {SUB_META[k].readsAs}</span>
                {k === "calib" && pile ? <span className="xp-srcchip">calib_gap (Pile fallback)</span> : null}
              </p>
              {isNum(r.value) || showC ? (
                <RampPlot
                  k={k}
                  width={plotW}
                  domain={domains[k]}
                  prog={prog}
                  barLabel={SUB_META[k].short}
                  items={[
                    ...(showC ? [{ id: C.id, stage: C.stage, value: c.value, score: c.score, hollow: true, name: full(C) }] : []),
                    ...(isNum(r.value) ? [{ id: P.id, stage: P.stage, value: r.value, score: r.score, name: full(P), onDrag: probe ? undefined : onDrag(k) }] : []),
                  ]}
                />
              ) : (
                <p className="small ink3">Not measured for this checkpoint; the overall is the mean of the others.</p>
              )}
              {r.edited && (
                <p className="xp-editnote">
                  edited: {fmtFeature(k, r.value)} → {fmtNum(r.score, "score")} (bundle <N m={P} k={subPath(k, "value")} f={featFmt(k)} /> →{" "}
                  <N m={P} k={subPath(k, "score")} f="score" />)
                </p>
              )}
            </div>
          );
        })}
      </div>
      <div className="xp-sub">
        <div className="xp-sub-row">
          <p className="xp-sub-label">
            Average · <InlineGlyph stage={P.stage} size={8} /> {P.label} · {STAGE_CODE[P.stage]}
          </p>
          {edited && (
            <button type="button" className="btn" onClick={() => setEdits({})}>
              Reset to bundle values
            </button>
          )}
        </div>
        <AveragePanel width={W} rows={rows} overall={overall} prog={edited ? 1 : at(4)} ghost={showC ? { rows: crow, overall: C.score } : null} />
        {(at(4) >= 1 || edited) && <Equation m={P} rows={rows} />}
        {showC && <Equation m={C} rows={crow} label={`compare ${C.label}:`} />}
      </div>
    </div>
  );

  const anchors = [...SCORED, ...probeKeys].map((k) => `${SUB_META[k].name}${probeKeys.includes(k) ? " (probe)" : ""} 1 at ${SUB_META[k].unit === "share" ? fmtTick(RAMPS[k][0], { pct: true }) : fmtTick(RAMPS[k][0])}, 0 at ${SUB_META[k].unit === "share" ? fmtTick(RAMPS[k][1], { pct: true }) : fmtTick(RAMPS[k][1])}`).join("; ");
  return (
    <ExplainerShell
      id="score"
      label={`Plate F · ${nWord} ramps, one score`}
      standfirst={`${nWord} raw features, ${nWord.toLowerCase()} clipped ramps, one mean${probeKeys.length ? `; the ${probeKeys.map((k) => SUB_META[k].name.toLowerCase()).join(", ")} ramp is shown as a validation probe` : ""}. Drag a value to see how the score is built.`}
      st={st}
      steps={steps}
      picker={picker}
      figure={figure}
      figureLabel={`Score for ${P.label}: ${rows.map((r) => `${r.k} ${fmtFeature(r.k, r.value)} to ${fmtNum(r.score, "score")}`).join(", ")}; overall ${fmtNum(overall, "score")}.`}
      caption={
        <>
          Ramps mirror RAMPS in docs/vh_truebase.py ({anchors}); calib uses min(gap, 0), so positive gaps score 1. Clipped zones are shaded. Edited
          values are recomputed in the browser with the same ramps and are not measurements; Reset restores the bundle.
        </>
      }
      sources={[`models[${P.id}].subscores.{calib,spread,memo,prior}.{value,score,source,scored}`, `models[${P.id}].score`, "method.RAMPS (reference.ramps when present)", "reference.scored_subscores"]}
      data={{
        columns: ["sub-score", "scored", `${P.label} value`, `${P.label} score`, `${C.label} value`, `${C.label} score`],
        numeric: [false, false, true, true, true, true],
        rows: [
          ...[...SCORED, ...probeKeys].map((k) => {
            const rv = get(P, subPath(k, "value"));
            const cv = get(C, subPath(k, "value"));
            return [SUB_META[k].name, SCORED.includes(k) ? "yes" : "no (probe)", fmtFeature(k, rv), fmtNum(get(P, subPath(k, "score")), "score"), fmtFeature(k, cv), fmtNum(get(C, subPath(k, "score")), "score")];
          }),
          ["overall", "", "", fmtNum(P.score, "score"), "", fmtNum(C.score, "score")],
        ],
      }}
      numbers={[
        ...SUB_KEYS.map((k) => pn(`${P.label} ${k} value`, P, subPath(k, "value"), featFmt(k))),
        ...SUB_KEYS.map((k) => pn(`${P.label} ${k} score`, P, subPath(k, "score"), "score")),
        pn(`${P.label} overall`, P, "score", "score"),
        pn(`${C.label} overall`, C, "score", "score"),
      ]}
    />
  );
}

