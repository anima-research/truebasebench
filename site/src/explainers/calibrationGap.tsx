/**
 * Explainer (c) The calibration gap, and why pre-anneal checkpoints sit at zero (DESIGN §8 c).
 * C1 reuses (a)'s constructed distribution for simulated draws (labelled); C2 places every checkpoint's real
 * F_calib_gap on one linear axis with a lens panel; C3 shows rare-genre gaps and top-1 reliability for A and B.
 */
import { useId, useMemo, useState } from "react";
import type { ExplainerProps } from "./types";
import type { Bundle, Model, Stage } from "../data/types";
import { fp, get, path } from "../data/bundle";
import { ladder, preAnnealBand, specimenFamily, specimenPair, STAGE_CODE, stageOrder } from "../data/derive";
import { RAMPS } from "../data/method";
import { useWidth } from "../components/Chart";
import { GlyphShape } from "../components/Glyph";
import { XAxis, xTitleExtra } from "../components/Axis";
import { Num } from "../components/Num";
import { ReliabilityDiagram } from "../charts/ModelCharts";
import { fmt, fmtNum, fmtTick, isNum } from "../lib/numfmt";
import { beeswarm, linear, niceTicks } from "../lib/scale";
import { ExplainerShell, Tag, type StepSpec } from "./kit/Shell";
import { ModelPicker } from "./kit/Picker";
import { useStepper } from "./kit/useStepper";
import { InlineGlyph } from "./kit/InlineGlyph";
import { drawIndex, easeInOut, easeSettle, lerp, rng, seg, stagger } from "./kit/anim";
import { geometricWithEntropy } from "./kit/construct";
import { fk, full, N, pn, resolveIds, tx } from "./kit/num";

const DURS = [1800, 1000, 1100, 900, 2200, 800, 900, 900];
const N_DRAWS = 90;
const LANE_MAX = 8;
const LENS: [number, number] = [-0.12, 0.04];

/** F_calib_gap, or the Pile calib_gap when the post-cutoff value is missing. */
function gapOf(m: Model): { v: number; key: string; pile: boolean } | null {
  const f = fp(m, "F_calib_gap");
  if (isNum(f)) return { v: f, key: "F_calib_gap", pile: false };
  const c = fp(m, "calib_gap");
  return isNum(c) ? { v: c, key: "calib_gap", pile: true } : null;
}
const eligible = (m: Model) => isNum(fp(m, "F_calib_gap")) && isNum(fp(m, "F_H")) && isNum(fp(m, "F_CE"));
const hiH = (m: Model) => get(m, ["tail", "tf_fresh", "gap_hiH"]);

interface Pt {
  m: Model;
  g: number;
  pile: boolean;
}

/** The second family with a pre-anneal rung (other than the specimen family), most rungs first. */
function secondFamily(bundle: Bundle, first: string | null): string | null {
  const fams = Array.from(new Set(bundle.models.filter((m) => m.stage === "pre-anneal").map((m) => m.family))).filter((f) => f !== first);
  fams.sort((a, b) => ladder(bundle, b).length - ladder(bundle, a).length || a.localeCompare(b));
  return fams[0] ?? null;
}

function GenreRows({ width, A, B, band }: { width: number; A: Model; B: Model; band: number }) {
  const genres = Array.from(new Set([...Object.keys(A.weird ?? {}), ...Object.keys(B.weird ?? {})]));
  genres.sort((a, b) => (a === "ALL" ? -1 : b === "ALL" ? 1 : a.localeCompare(b)));
  const val = (m: Model, g: string) => {
    const r = m.weird?.[g];
    return r && isNum(r[0]) ? r[0] : null;
  };
  const vals = genres.flatMap((g) => [val(A, g), val(B, g)]).filter(isNum);
  if (!genres.length || !vals.length) return <p className="small ink3">Rare-genre pass not run for these checkpoints.</p>;
  const m = Math.max(band, ...vals.map(Math.abs)) * 1.08;
  const LW = Math.min(112, width * 0.4);
  const x = linear([-m, m], [LW, width - 6]);
  const rowH = 15;
  const top = 6;
  const axisY = top + genres.length * rowH + 2;
  return (
    <svg width={width} height={axisY + 40} viewBox={`0 0 ${width} ${axisY + 40}`}>
      <rect x={x(-band)} width={x(band) - x(-band)} y={top} height={genres.length * rowH} fill="var(--band)" />
      <line x1={x(0)} x2={x(0)} y1={top} y2={axisY} stroke="var(--zero)" strokeWidth={1.5} />
      {genres.map((g, i) => {
        const y = top + i * rowH + rowH / 2;
        const a = val(A, g);
        const b = val(B, g);
        return (
          <g key={g}>
            <text x={LW - 6} y={y} dy="0.32em" textAnchor="end" className={g === "ALL" ? "ink b" : undefined}>
              {g === "ALL" ? "all genres" : g}
            </text>
            {isNum(a) && isNum(b) && <line x1={x(a)} x2={x(b)} y1={y} y2={y} stroke="var(--rule-strong)" />}
            {isNum(b) && (
              <g>
                <title>{`${B.label}, ${g}: ${fmt(b, "gap")}`}</title>
                <GlyphShape stage={B.stage} x={x(b)} y={y} size={7} hollow />
              </g>
            )}
            {isNum(a) && (
              <g>
                <title>{`${A.label}, ${g}: ${fmt(a, "gap")}`}</title>
                <GlyphShape stage={A.stage} x={x(a)} y={y} size={7} />
              </g>
            )}
          </g>
        );
      })}
      <XAxis scale={x} y={axisY} ticks={niceTicks(-m, m, 4)} format={(v) => fmtTick(v, { signed: true })} title="gap mean(H − s), nats · Pile rare genres" titleOffset={32} />
    </svg>
  );
}

export default function CalibrationGap({ bundle, reducedMotion }: ExplainerProps) {
  const sp = specimenPair(bundle);
  const [ids, setIds] = useState<(string | null)[]>([sp?.A.id ?? null, sp?.B.id ?? null]);
  const [A, B] = resolveIds(bundle, ids, eligible);
  const st = useStepper(DURS, reducedMotion);
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const W = Math.min(640, width);
  const clipId = useId().replace(/:/g, "");
  const bandInfo = preAnnealBand(bundle);
  const band = bandInfo?.band ?? 0;
  const fam1 = specimenFamily(bundle);
  const fam2 = secondFamily(bundle, fam1);
  const con = useMemo(() => (A ? geometricWithEntropy(fp(A, "F_H")!, 64) : null), [A]);
  const draws = useMemo(() => {
    if (!A || !con) return [];
    const r = rng(`calib:${A.id}`);
    return Array.from({ length: N_DRAWS }, () => -Math.log(con.p[drawIndex(con.p, r())]));
  }, [A, con]);
  if (!A || !B || !con) return <p className="pending">No checkpoint with F_H, F_CE and F_calib_gap in this bundle.</p>;

  const pts: Pt[] = bundle.models.flatMap((m) => {
    const g = gapOf(m);
    return g ? [{ m, g: g.v, pile: g.pile }] : [];
  });
  const rungs1 = fam1 ? ladder(bundle, fam1).filter((m) => gapOf(m)) : [];
  const rungs2 = fam2 ? ladder(bundle, fam2).filter((m) => gapOf(m)) : [];
  const allX = [...pts.map((p) => p.g), ...pts.map((p) => hiH(p.m)).filter(isNum)];
  const lo = Math.min(...allX) - 0.05;
  const hi = Math.max(0.1, Math.max(...allX) + 0.03);

  // ---------- geometry ----------
  const L = 46;
  const R = 12;
  const x = linear([lo, hi], [L, W - R]);
  const lx = linear(LENS, [L, W - R]);
  const lane = linear([0, LANE_MAX], [L, W - R]);
  const narrow = W < 480;
  const c1Top = narrow ? 14 : 0;
  const laneY = c1Top + 76;
  const rowA = c1Top + 104;
  const rowB = c1Top + 126;
  const c1Axis = c1Top + 144;
  const c2Top = c1Top + 202;
  const rows0 = c2Top + (narrow ? 66 : 52);
  const rowY = (s: Stage) => rows0 + stageOrder.indexOf(s) * 28;
  const singleY = rows0 + 1.5 * 28;
  const c2Axis = rows0 + 3 * 28 + 18;
  const c2Title = "calibration gap, mean(H − s) on post-cutoff text, nats (linear)";
  // the connectors to the lens start below the (possibly wrapped) axis title, never through it
  const c2TitleBottom = c2Axis + 30 + xTitleExtra(c2Title, W - R - L) + 6;
  const lensTop = c2TitleBottom + 22;
  const LENS_PAD = 34; // frame top to the first lens row: room for the in-frame LENS label and the band note
  const lRowY = (s: Stage) => lensTop + LENS_PAD + stageOrder.indexOf(s) * 20;
  const lensAxis = lensTop + LENS_PAD + 3 * 20 + 14;
  const rampTop = lensAxis + 50;
  const rampH = 44;
  const totalH = rampTop + rampH + 36;

  const at = st.at;
  // C1: draws
  const nDrawn = at(0) * N_DRAWS;
  const shown = draws.slice(0, Math.ceil(nDrawn));
  const mean = shown.length ? shown.reduce((a, b) => a + b, 0) / shown.length : 0;
  // step 3/4: positions
  const e3 = at(2);
  const e4 = easeInOut(at(3));
  const slotsAll = beeswarm(
    pts.map((p) => x(p.g)),
    7,
    3,
  );
  const slotsByStage = new Map<string, number>();
  for (const s of stageOrder) {
    const ps = pts.filter((p) => p.m.stage === s);
    const sl = beeswarm(
      ps.map((p) => x(p.g)),
      7,
      2,
    );
    ps.forEach((p, i) => slotsByStage.set(p.m.id, sl[i]));
  }
  const lensSlots = new Map<string, number>();
  for (const s of stageOrder) {
    const ps = pts.filter((p) => p.m.stage === s && p.g >= LENS[0] && p.g <= LENS[1]);
    const sl = beeswarm(
      ps.map((p) => lx(p.g)),
      7,
      2,
    );
    ps.forEach((p, i) => lensSlots.set(p.m.id, sl[i]));
  }
  const order = [...pts].sort((a, b) => a.g - b.g);
  const posMain = (p: Pt) => {
    const i = pts.indexOf(p);
    const y1 = singleY + slotsAll[i] * 6;
    const y2 = rowY(p.m.stage) + (slotsByStage.get(p.m.id) ?? 0) * 6;
    return { x: x(p.g), y: lerp(y1, y2, e4) };
  };
  const posLens = (p: Pt) => ({ x: lx(p.g), y: lRowY(p.m.stage) + (lensSlots.get(p.m.id) ?? 0) * 6 });
  const inLens = (g: number) => g >= LENS[0] && g <= LENS[1];
  // step 5: ladder
  const lad = at(4);
  const nR = rungs1.length;
  const curRung = lad > 0 ? Math.min(nR - 1, Math.floor(lad * nR)) : -1;
  const ptOf = (m: Model) => pts.find((p) => p.m.id === m.id)!;
  const path1 = rungs1.map((m) => posMain(ptOf(m)));
  const path1L = rungs1.map((m) => posLens(ptOf(m)));
  const path2 = rungs2.map((m) => posMain(ptOf(m)));
  const path2L = rungs2.map((m) => posLens(ptOf(m)));
  const poly = (ps: { x: number; y: number }[]) => ps.map((p) => `${p.x},${p.y}`).join(" ");
  const ladProg = easeInOut(lad);
  const ladFam2 = seg(lad, 0.5, 1);

  // claims computed from the data
  const posts = pts.filter((p) => p.m.stage === "post-trained");
  const postNeg = posts.filter((p) => p.g < 0).length;
  const preAnl = rungs1.filter((m) => m.stage === "pre-anneal" || m.stage === "anneal");
  const preAnlInBand = preAnl.every((m) => Math.abs(gapOf(m)!.v) <= band + 1e-12);
  const minP = order[0];
  const maxP = order[order.length - 1];
  const gpath = (m: Model) => path(m, fk(gapOf(m)?.key ?? "F_calib_gap"));

  const calibZero = RAMPS.calib[1];
  const calibOne = RAMPS.calib[0];

  const steps: StepSpec[] = [
    {
      title: "Expected surprise",
      body: (
        <>
          C1: when the next token is drawn from the model’s own distribution, the running mean of −log p converges onto its entropy, here{" "}
          <N m={A} k={fk("F_H")} f="nats" />. Cross-entropy is a proper scoring rule: a model trained toward the data expects as much surprise as
          fresh text from that data gives it.
        </>
      ),
      summary: `Simulated draws from the model's own distribution: mean surprise converges to entropy ${tx(A, fk("F_H"), "nats")}.`,
    },
    {
      title: "One number per model",
      body: (
        <>
          On real post-cutoff text, {A.label} has H <N m={A} k={fk("F_H")} f="nats" /> and s <N m={A} k={fk("F_CE")} f="nats" />, a gap of{" "}
          <N m={A} k={fk("F_calib_gap")} f="gap" />. {B.label} has H <N m={B} k={fk("F_H")} f="nats" /> but s <N m={B} k={fk("F_CE")} f="nats" />:{" "}
          <N m={B} k={fk("F_calib_gap")} f="gap" />.
        </>
      ),
      summary: `Gap for ${A.label} ${tx(A, fk("F_calib_gap"), "gap")}; for ${B.label} ${tx(B, fk("F_calib_gap"), "gap")}.`,
    },
    {
      title: "All checkpoints",
      body: (
        <>
          C2: all {pts.length} checkpoints drop onto one linear axis, from <Num path={gpath(minP.m)} fmt="gap" /> ({minP.m.family} ·{" "}
          {minP.m.label}) to <Num path={gpath(maxP.m)} fmt="gap" /> ({maxP.m.family} · {maxP.m.label}).
        </>
      ),
      summary: `${pts.length} checkpoints on one axis, from ${fmt(minP.g, "gap")} to ${fmt(maxP.g, "gap")}.`,
    },
    {
      title: "Sorted by stage",
      body: bandInfo ? (
        <>
          In stage rows, every pre-anneal checkpoint sits within ±<Num path={gpath(bandInfo.model)} value={band} fmt="nats" derived="max |F_calib_gap| over pre-anneal" />{" "}
          of zero, the widest pre-anneal gap ({bandInfo.model.label}). {postNeg} of {posts.length} post-trained checkpoints are negative:
          over-confident.
        </>
      ) : (
        <>No pre-anneal checkpoint has a gap in this bundle, so no band is drawn.</>
      ),
      summary: `Pre-anneal checkpoints sit within plus or minus ${fmt(band, "nats")}; ${postNeg} of ${posts.length} post-trained checkpoints are negative.`,
    },
    {
      title: "Down the ladder",
      body:
        rungs1.length > 1 ? (
          <>
            Along the {fam1} ladder the gap runs from <Num path={gpath(rungs1[0])} fmt="gap" /> ({rungs1[0].label}) to{" "}
            <Num path={gpath(rungs1[nR - 1])} fmt="gap" /> ({rungs1[nR - 1].label}).{" "}
            {preAnlInBand ? "The pre-anneal and anneal rungs stay inside the band; " : "Not every pre-anneal or anneal rung stays inside the band; "}
            each post-training stage pushes it further negative. {fam2 ? `${fam2} is the dashed path.` : ""}
          </>
        ) : (
          <>No family in this bundle has both a pre-anneal and a post-trained rung.</>
        ),
      summary: rungs1.length > 1 ? `Along ${fam1}: ${rungs1.map((m) => fmt(gapOf(m)!.v, "gap")).join(", ")}.` : "No ladder.",
    },
    {
      title: "Where it is unsure",
      body: (
        <>
          Rings mark the gap at positions where the model is uncertain (H &gt; 4), tail.tf_fresh.gap_hiH. For {B.label} it is{" "}
          <N m={B} k={["tail", "tf_fresh", "gap_hiH"]} f="gap" /> against <N m={B} k={fk("F_calib_gap")} f="gap" /> overall; for {A.label}{" "}
          <N m={A} k={["tail", "tf_fresh", "gap_hiH"]} f="gap" />. Over-confidence concentrates where the model is unsure.
        </>
      ),
      summary: `Gap at H above 4: ${B.label} ${fmt(hiH(B), "gap")}, ${A.label} ${fmt(hiH(A), "gap")}.`,
    },
    {
      title: "Not just on average",
      body: (
        <>
          C3: the gap per rare-genre Pile document set (not post-cutoff text) for A and B, and top-1 reliability on post-cutoff text, ECE{" "}
          <N m={A} k={["selfboot", "reliability", "ECE"]} f="num3" /> against <N m={B} k={["selfboot", "reliability", "ECE"]} f="num3" />.{" "}
          <em>Spread</em> is mean |per-domain gap| on post-cutoff text: <N m={A} k={fk("F_gap_domain_absmean")} f="nats" /> for A,{" "}
          <N m={B} k={fk("F_gap_domain_absmean")} f="nats" /> for B.
        </>
      ),
      summary: `Spread ${tx(A, fk("F_gap_domain_absmean"), "nats")} for A and ${tx(B, fk("F_gap_domain_absmean"), "nats")} for B.`,
    },
    {
      title: "Becoming a score",
      body: (
        <>
          The calib ramp maps the gap to a sub-score: 1 at <Num path="method.RAMPS.calib[0]" value={calibOne} fmt="signed" def unit={false} />, 0 at{" "}
          <Num path="method.RAMPS.calib[1]" value={calibZero} fmt="signed" def unit={false} />, positive gaps clipped to 1. A scores{" "}
          <N m={A} k={["subscores", "calib", "score"]} f="score" />, B <N m={B} k={["subscores", "calib", "score"]} f="score" />. See{" "}
          <a href="#score">four ramps, one score</a>.
        </>
      ),
      summary: `Calib sub-score: ${A.label} ${tx(A, ["subscores", "calib", "score"], "score")}, ${B.label} ${tx(B, ["subscores", "calib", "score"], "score")}.`,
    },
  ];

  // ---------- figure ----------
  const showRows = st.step >= 3;
  const glyphs = (inLensPanel: boolean) =>
    pts.map((p, i) => {
      if (inLensPanel && (!showRows || !inLens(p.g))) return null;
      const e = inLensPanel ? e4 : easeSettle(stagger(e3, order.indexOf(p), pts.length, 0.35, 0.6));
      if (e <= 0) return null;
      const pos = inLensPanel ? posLens(p) : posMain(p);
      const y = inLensPanel ? pos.y : lerp(c2Top + 30, pos.y, e);
      const isSpec = p.m.id === A.id || p.m.id === B.id;
      return (
        <g key={p.m.id + (inLensPanel ? "L" : "")} opacity={inLensPanel ? e : 1}>
          <title>{`${full(p.m)}: ${fmt(p.g, "gap")}${p.pile ? " (Pile calib_gap)" : ""}`}</title>
          <GlyphShape stage={p.m.stage} x={pos.x} y={y} size={isSpec ? 9 : 7} />
          {isSpec && i >= 0 && (
            <circle cx={pos.x} cy={y} r={7.5} fill="none" stroke="var(--ink)" strokeWidth={1} />
          )}
        </g>
      );
    });
  const rings = (inLensPanel: boolean) =>
    at(5) > 0
      ? pts.map((p) => {
          const h = hiH(p.m);
          if (!isNum(h)) return null;
          if (inLensPanel && !(inLens(h) && inLens(p.g))) return null;
          const a = inLensPanel ? posLens(p) : posMain(p);
          const xr = inLensPanel ? lx(h) : x(h);
          const e = easeSettle(at(5));
          const xx = lerp(a.x, xr, e);
          return (
            <g key={p.m.id + "r" + inLensPanel}>
              <title>{`${full(p.m)}: gap at H > 4 ${fmt(h, "gap")}`}</title>
              <line x1={a.x} x2={xx} y1={a.y} y2={a.y} stroke="var(--rule-strong)" />
              <circle cx={xx} cy={a.y} r={3.5} fill="none" stroke="var(--ink-2)" strokeWidth={1.2} />
            </g>
          );
        })
      : null;
  const rider = (inLensPanel: boolean) => {
    if (curRung < 0) return null;
    const m = rungs1[curRung];
    const p = ptOf(m);
    if (inLensPanel && !inLens(p.g)) return null;
    const pos = inLensPanel ? posLens(p) : posMain(p);
    return <circle cx={pos.x} cy={pos.y} r={9} fill="var(--hl)" />;
  };
  const rungLabels = (inLensPanel: boolean) => {
    if (lad <= 0) return null;
    // Labels sit above the glyph's ring (r 7.5); a label closer than 12px in x to an earlier one on the same
    // level is lifted one 10px step, so rung numbers never overprint each other or a glyph.
    const placed: { x: number; y: number }[] = [];
    return rungs1.map((m, i) => {
      if (i > curRung) return null;
      const p = ptOf(m);
      if (inLensPanel ? !inLens(p.g) : inLens(p.g) && x(LENS[1]) - x(LENS[0]) < 120) return null;
      const pos = inLensPanel ? posLens(p) : posMain(p);
      // candidates: above the ring, one step higher, below the glyph, then further out on either side
      const cands = [pos.y - 11, pos.y - 21, pos.y + 18, pos.y - 31, pos.y + 28];
      const free = (y: number) => !placed.some((q) => Math.abs(q.x - pos.x) < 12 && Math.abs(q.y - y) < 10);
      const y = cands.find(free) ?? cands[cands.length - 1];
      placed.push({ x: pos.x, y });
      return (
        <text key={m.id + inLensPanel} x={pos.x} y={y} textAnchor="middle" className="ink b halo" style={{ fontSize: 10 }}>
          {i + 1}
        </text>
      );
    });
  };

  const rampY = linear([0, 1], [rampTop + rampH, rampTop]);
  const rampPts = [LENS[0], calibZero, calibOne, LENS[1]].map((v) => `${lx(v)},${rampY(Math.max(0, Math.min(1, (Math.min(v, 0) - calibZero) / (calibOne - calibZero))))}`).join(" ");
  const curM = curRung >= 0 ? rungs1[curRung] : null;

  const svg = (
    <svg width={W} height={totalH} viewBox={`0 0 ${W} ${totalH}`}>
      <defs>
        <clipPath id={`lens-${clipId}`}>
          <rect x={L - 8} y={lensTop + 18} width={W - L - R + 16} height={lensAxis - lensTop - 14} />
        </clipPath>
      </defs>
      {/* ---------- C1 ---------- */}
      <text x={0} y={11} className="panel-label">
        C1 · If the text were the model’s own
      </text>
      <Tag x={narrow ? 0 : W - R} y={narrow ? 25 : 11} anchor={narrow ? "start" : "end"}>
        simulated draws; H from bundle
      </Tag>
      <text x={0} y={c1Top + 28} className="ink2">
        <tspan className="b">A</tspan> · {full(A)}
      </text>
      <line x1={L} x2={W - R} y1={laneY} y2={laneY} stroke="var(--ink-2)" />
      {shown.map((v, i) => {
        const last = i === shown.length - 1 && at(0) < 1;
        const fall = last ? (nDrawn % 1 || 1) : 1;
        const yy = lerp(c1Top + 44, laneY - 3 - (i % 6) * 3.4, easeSettle(fall));
        return <circle key={i} cx={lane(Math.min(v, LANE_MAX))} cy={yy} r={2.4} fill="var(--bar)" fillOpacity={0.55} />;
      })}
      <line x1={lane(con.H)} x2={lane(con.H)} y1={c1Top + 42} y2={laneY + 6} stroke="var(--ink)" strokeDasharray="3 2" />
      <text x={lane(con.H) + 4} y={c1Top + 44} className="ink b">
        H = {fmt(fp(A, "F_H"), "nats")}
      </text>
      {shown.length > 0 && (
        <g>
          <polygon points={`${lane(mean)},${laneY + 1} ${lane(mean) + 6},${laneY + 11} ${lane(mean) - 6},${laneY + 11}`} fill="var(--ink-2)" />
          <text x={lane(mean) - 9} y={laneY + 11} textAnchor="end" className="it">
            running mean
          </text>
        </g>
      )}
      {/* step 2: H and s per model, on the same nats scale */}
      {[
        { m: A, y: rowA, tag: "A" },
        { m: B, y: rowB, tag: "B" },
      ].map(({ m, y, tag }) => {
        const e = at(1);
        if (e <= 0) return null;
        const Hm = fp(m, "F_H")!;
        const sm = fp(m, "F_CE")!;
        const b = seg(e, 0.35, 0.8);
        return (
          <g key={tag} opacity={seg(e, 0, 0.3)}>
            <text x={L - 8} y={y} dy="0.32em" textAnchor="end" className="ink b">
              {tag}
            </text>
            <line x1={lane(Hm)} x2={lane(Hm)} y1={y - 7} y2={y + 7} stroke="var(--ink)" strokeWidth={2} />
            <circle cx={lane(sm)} cy={y} r={4.5} fill="var(--hl)" stroke="var(--ink)" strokeWidth={1.5} />
            <line x1={lane(sm)} x2={lerp(lane(sm), lane(Hm), b)} y1={y} y2={y} stroke="var(--ink)" strokeWidth={1.5} />
            {e >= 0.8 && (
              <text x={lane(Math.max(Hm, sm)) + 10} y={y} dy="0.32em" className="ink">
                H {fmtNum(Hm, "num3")} · s {fmtNum(sm, "num3")} → gap {fmt(fp(m, "F_calib_gap"), "gap")}
              </text>
            )}
          </g>
        );
      })}
      <XAxis scale={lane} y={c1Axis} ticks={[0, 1, 2, 3, 4, 5, 6, 7, 8]} format={(v) => String(v)} title="surprisal −log p, nats (linear); bar = H, ring = s" titleOffset={30} />

      {/* ---------- C2 ---------- */}
      <text x={0} y={c2Top + 11} className="panel-label">
        C2 · Every checkpoint, on one axis
      </text>
      {curM && (
        <text x={narrow ? 0 : W - R} y={narrow ? c2Top + 26 : c2Top + 11} textAnchor={narrow ? "start" : "end"} className="ink">
          rung {curRung + 1}: {curM.label} {fmt(gapOf(curM)!.v, "gap")}
        </text>
      )}
      {showRows &&
        stageOrder.map((s) => (
          <g key={s} opacity={e4}>
            <line x1={L} x2={W - R} y1={rowY(s)} y2={rowY(s)} stroke="var(--rule)" />
            <GlyphShape stage={s} x={8} y={rowY(s)} size={8} />
            <text x={16} y={rowY(s)} dy="0.32em" className="ink2">
              {STAGE_CODE[s]}
            </text>
          </g>
        ))}
      {showRows && band > 0 && (
        <g opacity={e4}>
          <rect x={x(-band)} width={x(band) - x(-band)} y={rows0 - 12} height={c2Axis - rows0 + 12} fill="var(--band)" />
        </g>
      )}
      <line x1={x(0)} x2={x(0)} y1={narrow ? c2Top + 46 : c2Top + 32} y2={c2Axis} stroke="var(--zero)" strokeWidth={1.5} />
      <text x={narrow ? 0 : x(0) - 6} y={narrow ? c2Top + 42 : c2Top + 30} textAnchor={narrow ? "start" : "end"} className="it">
        calibrated: expected surprise = realised surprise
      </text>
      {rider(false)}
      {rings(false)}
      {glyphs(false)}
      {lad > 0 && path2.length > 1 && (
        <polyline points={poly(path2)} fill="none" stroke="var(--ink-3)" strokeWidth={1.2} strokeDasharray="4 3" opacity={ladFam2} />
      )}
      {lad > 0 && path1.length > 1 && (
        <polyline
          points={poly(path1)}
          fill="none"
          stroke="var(--ink)"
          strokeWidth={1.5}
          pathLength={1}
          strokeDasharray={ladProg < 1 ? `${ladProg} 1` : undefined}
          markerEnd={ladProg >= 1 ? "url(#arrow)" : undefined}
        />
      )}
      {rungLabels(false)}
      <XAxis scale={x} y={c2Axis} ticks={niceTicks(lo, hi, W < 480 ? 4 : 7)} format={(v) => fmtTick(v, { signed: true })} title={c2Title} titleOffset={30} />

      {/* ---------- lens ---------- */}
      {/* the lens window on the main axis, then connectors from below the axis title to the lens frame's top corners */}
      <rect x={x(LENS[0])} y={c2Axis - 3} width={x(LENS[1]) - x(LENS[0])} height={6} fill="none" stroke="var(--rule-strong)" />
      <line x1={x(LENS[0])} x2={L - 8} y1={c2TitleBottom} y2={lensTop} stroke="var(--rule-strong)" />
      <line x1={x(LENS[1])} x2={W - R + 8} y1={c2TitleBottom} y2={lensTop} stroke="var(--rule-strong)" />
      <rect x={L - 8} y={lensTop} width={W - L - R + 16} height={lensAxis - lensTop} fill="none" stroke="var(--rule-strong)" />
      <text x={L - 2} y={lensTop + 14} className="panel-label">
        Lens · {fmtTick(LENS[0], { signed: true })} to {fmtTick(LENS[1], { signed: true })} nats
      </text>
      {band > 0 && showRows && (
        <g opacity={e4}>
          <rect x={lx(-band)} width={lx(band) - lx(-band)} y={lensTop + 20} height={lensAxis - lensTop - 20} fill="var(--band)" />
          {(() => {
            const txt = `±${fmtNum(band, "num3")}, the widest pre-anneal gap`;
            const right = lx(band) + 4 + txt.length * 5.6 <= W - R;
            return (
              <text x={right ? lx(band) + 4 : lx(-band) - 4} y={lensTop + (right ? 14 : 30)} textAnchor={right ? "start" : "end"} className="ink2 halo">
                {txt}
              </text>
            );
          })()}
        </g>
      )}
      <line x1={lx(0)} x2={lx(0)} y1={lensTop + 20} y2={lensAxis} stroke="var(--zero)" strokeWidth={1.5} />
      <line x1={lx(calibZero)} x2={lx(calibZero)} y1={lensTop + 20} y2={lensAxis} stroke="var(--rule-strong)" strokeDasharray="2 2" />
      <g clipPath={`url(#lens-${clipId})`}>
        {rider(true)}
        {rings(true)}
        {glyphs(true)}
        {lad > 0 && path2L.length > 1 && <polyline points={poly(path2L)} fill="none" stroke="var(--ink-3)" strokeWidth={1.2} strokeDasharray="4 3" opacity={ladFam2} />}
        {lad > 0 && path1L.length > 1 && (
          <polyline points={poly(path1L)} fill="none" stroke="var(--ink)" strokeWidth={1.5} pathLength={1} strokeDasharray={ladProg < 1 ? `${ladProg} 1` : undefined} />
        )}
      </g>
      {/* rung numbers sit outside the clip so a lifted label is never cut by the frame */}
      {rungLabels(true)}
      <XAxis scale={lx} y={lensAxis} ticks={[-0.12, -0.1, -0.08, -0.06, -0.04, -0.02, 0, 0.02, 0.04].filter((_, i) => W >= 480 || i % 2 === 0)} format={(v) => fmtTick(v, { signed: true })} />

      {/* ---------- calib ramp under the lens ---------- */}
      {at(7) > 0 && (
        <g>
          <rect x={lx(LENS[0])} width={lx(calibZero) - lx(LENS[0])} y={rampTop} height={rampH} fill="var(--track)" opacity={at(7)} />
          <rect x={lx(calibOne)} width={lx(LENS[1]) - lx(calibOne)} y={rampTop} height={rampH} fill="var(--track)" opacity={at(7)} />
          <polyline points={rampPts} fill="none" stroke="var(--ink)" strokeWidth={1.5} pathLength={1} strokeDasharray={at(7) < 1 ? `${easeInOut(at(7))} 1` : undefined} />
          <text x={L - 6} y={rampY(1)} dy="0.32em" textAnchor="end">
            1
          </text>
          <text x={L - 6} y={rampY(0)} dy="0.32em" textAnchor="end">
            0
          </text>
          <text x={lx(calibOne) - 4} y={rampTop - 4} textAnchor="end" className="ink2">
            1 at {fmtTick(calibOne)}
          </text>
          <text x={lx(calibZero) + 4} y={rampTop + rampH + 14} className="ink2">
            0 at {fmtTick(calibZero)}
          </text>
          <text x={lx(LENS[1])} y={rampTop + rampH + 28} textAnchor="end" className="it">
            calib sub-score; positive gaps clipped to 1
          </text>
          {[A, B].map((m, i) => {
            const g = gapOf(m)?.v;
            const sc = get(m, ["subscores", "calib", "score"]);
            if (!isNum(g) || !isNum(sc) || !inLens(Math.max(LENS[0], Math.min(LENS[1], g)))) return null;
            const gx = lx(Math.max(LENS[0], Math.min(LENS[1], g)));
            return (
              <g key={m.id} opacity={seg(at(7), 0.5, 1)}>
                <GlyphShape stage={m.stage} x={gx} y={rampY(sc)} size={8} hollow={i === 1} />
                <text x={gx + (gx < L + 60 ? 8 : -8)} y={rampY(sc) + (sc < 0.5 ? -8 : 14)} textAnchor={gx < L + 60 ? "start" : "end"} className="ink">
                  {i === 0 ? "A" : "B"} {fmtNum(sc, "score")}
                  {g < LENS[0] ? " (gap off lens)" : ""}
                </text>
              </g>
            );
          })}
        </g>
      )}
    </svg>
  );

  const c3 = (
    <div className={"xp-sub" + (st.step >= 6 ? "" : " future")}>
      <p className="xp-sub-label">
        C3 · In every genre · <InlineGlyph stage={A.stage} size={7} /> A {A.label} · <InlineGlyph stage={B.stage} size={7} hollow /> B {B.label}
      </p>
      <div className="xp-row2">
        <div>
          <p className="small ink2" style={{ margin: "0 0 4px" }}>
            Gap per rare-genre Pile document set (not post-cutoff text)
          </p>
          <GenreRows width={W >= 560 ? (W - 16) / 2 : W} A={A} B={B} band={band} />
        </div>
        <div>
          <p className="small ink2" style={{ margin: "0 0 4px" }}>
            Top-1 reliability on post-cutoff text · ECE A {tx(A, ["selfboot", "reliability", "ECE"], "num3")}, B {tx(B, ["selfboot", "reliability", "ECE"], "num3")}
          </p>
          <ReliabilityDiagram model={A} compare={[B]} />
        </div>
      </div>
    </div>
  );

  const figure = (
    <div ref={ref}>
      {svg}
      {rungs1.length > 0 && (
        <ol className={"xp-key" + (st.step >= 4 ? "" : " future")} aria-label={`${fam1} ladder`}>
          {rungs1.map((m, i) => (
            <li key={m.id} className={i === curRung && lad < 1 ? "cur" : undefined}>
              <span className="xp-key-n">{i + 1}</span> <InlineGlyph stage={m.stage} size={7} /> {m.label} <Num path={gpath(m)} fmt="gap" unit={false} />
            </li>
          ))}
        </ol>
      )}
      {c3}
    </div>
  );

  const label =
    `Calibration gap of ${pts.length} checkpoints on one axis from ${fmt(minP.g, "gap")} to ${fmt(maxP.g, "gap")}; pre-anneal band plus or minus ${fmt(band, "nats")}. ` +
    (rungs1.length ? `${fam1} ladder: ${rungs1.map((m) => `${m.label} ${fmt(gapOf(m)!.v, "gap")}`).join(", ")}.` : "");

  return (
    <ExplainerShell
      id="calibration-gap"
      label="Plate C · The calibration gap"
      standfirst="A model trained only toward the data expects as much surprise as unseen text gives it; every later stage makes it over-confident."
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
          note={`The ladder is the specimen family (${fam1 ?? "none"}); the dashed path is ${fam2 ?? "absent"}. C2 always shows every checkpoint.`}
        />
      }
      figure={figure}
      figureLabel={label}
      caption={
        <>
          C1’s draws are simulated from the constructed distribution of explainer (a) and print no number of their own. C2 and the lens are linear;
          the band is ± the widest pre-anneal gap in the bundle. Rings are tail.tf_fresh.gap_hiH. C3’s genre rows are rare-genre Pile documents,
          not post-cutoff text. Checkpoints without a post-cutoff gap would use the Pile calib_gap and say so in their tooltip.
        </>
      }
      sources={[
        "models[*].fingerprint.F_calib_gap (calib_gap fallback)",
        "models[*].fingerprint.F_H, F_CE, F_gap_domain_absmean",
        "models[*].tail.tf_fresh.gap_hiH",
        `models[${A.id}|${B.id}].weird[*][0], selfboot.reliability`,
        "models[*].subscores.calib.score · method.RAMPS.calib",
      ]}
      data={[
        {
          columns: ["checkpoint", "stage", "gap", "gap at H > 4", "calib score"],
          numeric: [false, false, true, true, true],
          rows: order.map((p) => [full(p.m) + (p.pile ? " (Pile)" : ""), STAGE_CODE[p.m.stage], fmt(p.g, "gap"), fmt(hiH(p.m), "gap"), fmtNum(get(p.m, ["subscores", "calib", "score"]), "score")]),
        },
      ]}
      numbers={[
        pn("A F_H", A, fk("F_H"), "nats"),
        pn("A F_CE", A, fk("F_CE"), "nats"),
        pn("A F_calib_gap", A, fk("F_calib_gap"), "gap"),
        pn("B F_H", B, fk("F_H"), "nats"),
        pn("B F_CE", B, fk("F_CE"), "nats"),
        pn("B F_calib_gap", B, fk("F_calib_gap"), "gap"),
        ...(bandInfo ? [{ label: "pre-anneal band", path: gpath(bandInfo.model), fmt: "nats" as const, value: band, derived: "max |F_calib_gap| over pre-anneal" }] : []),
        pn("A gap at H > 4", A, ["tail", "tf_fresh", "gap_hiH"], "gap"),
        pn("B gap at H > 4", B, ["tail", "tf_fresh", "gap_hiH"], "gap"),
        pn("A spread", A, fk("F_gap_domain_absmean"), "nats"),
        pn("B spread", B, fk("F_gap_domain_absmean"), "nats"),
      ]}
    />
  );
}
