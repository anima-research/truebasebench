/**
 * Explainer (e) The surname test: described vs few-shot frames (DESIGN §8 e).
 * Prompt cards print the real frame text (reference.surname_frames or method.ts, mirroring SURNAME_PROMPTS).
 * The dot field has round(exp(census_entropy_top2000)) dots and thins to round(exp(H)) for each frame and model.
 */
import { useState } from "react";
import type { ExplainerProps } from "./types";
import type { Bundle, Model } from "../data/types";
import { get, path } from "../data/bundle";
import { specimenPair, STAGE_CODE, stageOrder } from "../data/derive";
import { CENSUS_SURNAMES, SURNAME_FRAMES, SURNAME_PROMPTS } from "../data/method";
import { f5, FINDING_DEFS } from "../findings";
import { useWidth } from "../components/Chart";
import { GlyphShape } from "../components/Glyph";
import { Num } from "../components/Num";
import { TopNamesChart, topNamesOf } from "../charts/TopNames";
import { fmt, fmtCount, fmtNum, isNum } from "../lib/numfmt";
import { linear, log10Scale } from "../lib/scale";
import { ExplainerShell, type StepSpec } from "./kit/Shell";
import { ModelPicker } from "./kit/Picker";
import { useStepper } from "./kit/useStepper";
import { InlineGlyph } from "./kit/InlineGlyph";
import { easeInOut, easeSettle, lerp, seg, stagger } from "./kit/anim";
import { full, N, pn, resolveIds, tx } from "./kit/num";

const DURS = [700, 900, 1500, 1700, 1200, 1100, 700];
const COLS = 32;
const sk = (k: string) => ["surnames", k];
const sv = (m: Model, k: string) => get(m, sk(k));
const eligible = (m: Model) => isNum(sv(m, "H_desc")) && isNum(sv(m, "H_few")) && isNum(sv(m, "KL_few"));

/** Frame texts: reference.surname_frames when present, else method.ts (SURNAME_PROMPTS). */
function frames(bundle: Bundle): { desc: string; few: string; descName: string; fewName: string } {
  const ref = bundle.reference.surname_frames;
  const di = SURNAME_FRAMES.desc.indexOf("plain");
  const refDesc = ref?.desc?.[di];
  const refFew = ref?.few?.[0];
  const isText = (s: unknown): s is string => typeof s === "string" && s.includes("\n");
  return {
    desc: isText(refDesc) ? refDesc : SURNAME_PROMPTS.plain,
    few: isText(refFew) ? refFew : SURNAME_PROMPTS.fewshot1,
    descName: "plain",
    fewName: SURNAME_FRAMES.few[0],
  };
}

function Field({ total, lit, pitch }: { total: number; lit: number; pitch: number }) {
  const rows = Math.ceil(total / COLS);
  const r = Math.max(1.2, pitch * 0.32);
  const w = COLS * pitch;
  const h = rows * pitch;
  const n = Math.round(lit);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => {
        const cx = (i % COLS) * pitch + pitch / 2;
        const cy = Math.floor(i / COLS) * pitch + pitch / 2;
        return i < n ? <circle key={i} cx={cx} cy={cy} r={r} fill="var(--ink)" /> : <circle key={i} cx={cx} cy={cy} r={r - 0.4} fill="none" stroke="var(--rule-strong)" strokeWidth={0.8} />;
      })}
    </svg>
  );
}

function HBarRows({ width, rows, prog }: { width: number; rows: { name: string; v: number | null; on: boolean; fmtKind: "pct" | "num3" }[]; prog: number }) {
  const LW = Math.min(124, width * 0.42);
  const x = linear([0, 1], [LW, width - 44]);
  return (
    <svg width={width} height={rows.length * 22 + 22} viewBox={`0 0 ${width} ${rows.length * 22 + 22}`}>
      {rows.map((r, i) => {
        const y = 4 + i * 22;
        const e = easeSettle(prog);
        return (
          <g key={r.name} opacity={r.on ? 1 : 0.4}>
            <text x={LW - 6} y={y + 7} dy="0.32em" textAnchor="end" className={r.on ? "ink" : undefined}>
              {r.name}
            </text>
            <rect x={LW} y={y + 2} width={x(1) - LW} height={10} fill={isNum(r.v) ? "var(--track)" : "url(#hatch)"} />
            {isNum(r.v) && <rect x={LW} y={y + 2} width={(x(r.v) - LW) * e} height={10} fill="var(--bar)" />}
            <text x={isNum(r.v) ? LW + (x(r.v) - LW) * e + 4 : LW + 4} y={y + 7} dy="0.32em" className="ink">
              {e >= 1 || !isNum(r.v) ? fmt(r.v, r.fmtKind) : ""}
            </text>
          </g>
        );
      })}
      {[0, 0.5, 1].map((t) => (
        <text key={t} x={x(t)} y={rows.length * 22 + 16} textAnchor="middle">
          {t}
        </text>
      ))}
    </svg>
  );
}

function Dumbbells({ width, bundle, A, B, prog, range }: { width: number; bundle: Bundle; A: Model; B: Model; prog: number; range: [number, number] | null }) {
  const ms = bundle.models.filter((m) => isNum(sv(m, "KL_few")) || isNum(sv(m, "KL_desc")));
  const groups = stageOrder.map((s) => ms.filter((m) => m.stage === s).sort((a, b) => (sv(a, "KL_few") ?? 99) - (sv(b, "KL_few") ?? 99)));
  const LW = Math.min(170, width * 0.42);
  const x = log10Scale([0.1, 10], [LW, width - 10]);
  const rowH = 12;
  const gapH = 14;
  let y = 14;
  const rows: { m: Model; y: number }[] = [];
  const heads: { s: string; y: number }[] = [];
  groups.forEach((g, gi) => {
    if (!g.length) return;
    heads.push({ s: stageOrder[gi], y: y + 4 });
    y += gapH;
    for (const m of g) {
      rows.push({ m, y });
      y += rowH;
    }
    y += 4;
  });
  const axisY = y + 4;
  const clampX = (v: number) => x(Math.max(0.1, Math.min(10, v)));
  return (
    <svg width={width} height={axisY + 50} viewBox={`0 0 ${width} ${axisY + 50}`}>
      {range && <rect x={clampX(range[0])} width={clampX(range[1]) - clampX(range[0])} y={10} height={axisY - 10} fill="var(--band)" />}
      {[0.1, 1, 10].map((t) => (
        <line key={t} x1={x(t)} x2={x(t)} y1={10} y2={axisY} stroke="var(--rule)" />
      ))}
      {heads.map((h) => (
        <g key={h.s}>
          <GlyphShape stage={h.s as Model["stage"]} x={5} y={h.y} size={8} />
          <text x={14} y={h.y} dy="0.32em" className="ink2 b">
            {STAGE_CODE[h.s as Model["stage"]]}
          </text>
        </g>
      ))}
      {rows.map(({ m, y: ry }, i) => {
        const d = sv(m, "KL_desc");
        const f = sv(m, "KL_few");
        const e = easeSettle(stagger(prog, i, rows.length, 0.4, 0.5));
        const spec = m.id === A.id || m.id === B.id;
        const lbl = `${m.family} · ${m.label}`;
        const maxCh = Math.floor((LW - 8) / 5.2);
        return (
          <g key={m.id} opacity={e > 0 ? 1 : 0.25}>
            <title>{`${lbl}: KL described ${fmt(d, "kl")}, KL few-shot ${fmt(f, "kl")}`}</title>
            {spec && <rect x={0} y={ry - 6} width={width} height={12} fill="var(--hl-40)" />}
            <text x={LW - 6} y={ry} dy="0.32em" textAnchor="end" style={{ fontSize: 10 }} className={spec ? "ink" : undefined}>
              {lbl.length > maxCh ? lbl.slice(0, maxCh - 1) + "…" : lbl}
            </text>
            {e > 0 && isNum(d) && isNum(f) && <line x1={clampX(f)} x2={lerp(clampX(f), clampX(d), e)} y1={ry} y2={ry} stroke="var(--ink-3)" />}
            {e > 0 && isNum(d) && <GlyphShape stage={m.stage} x={lerp(isNum(f) ? clampX(f) : clampX(d), clampX(d), e)} y={ry} size={7} hollow />}
            {e > 0 && isNum(f) && <GlyphShape stage={m.stage} x={clampX(f)} y={ry} size={7} />}
          </g>
        );
      })}
      <line x1={LW} x2={width - 10} y1={axisY} y2={axisY} stroke="var(--rule-strong)" />
      {[0.1, 0.3, 1, 3, 10].map((t) => (
        <text key={t} x={x(t)} y={axisY + 14} textAnchor="middle">
          {t}
        </text>
      ))}
      <text x={width < 480 ? 0 : LW} y={axisY + 30} className="ink2">
        KL(Census ‖ model), nats (log scale){width < 480 ? "" : " · filled few-shot, hollow described"}
      </text>
      {width < 480 && (
        <text x={0} y={axisY + 44} className="ink2">
          filled few-shot, hollow described
        </text>
      )}
    </svg>
  );
}

export default function Surnames({ bundle, reducedMotion }: ExplainerProps) {
  const sp = specimenPair(bundle);
  const [ids, setIds] = useState<(string | null)[]>([sp?.A.id ?? null, sp?.B.id ?? null]);
  const [A, B] = resolveIds(bundle, ids, eligible);
  const st = useStepper(DURS, reducedMotion);
  const [ref, width] = useWidth<HTMLDivElement>(640);
  const W = Math.min(640, width);
  const Hc = bundle.reference.census_entropy_top2000;
  if (!A || !B) return <p className="pending">Surname test not run for any checkpoint in this bundle.</p>;
  if (!isNum(Hc)) return <p className="pending">reference.census_entropy_top2000 is missing from this bundle.</p>;
  const total = Math.round(Math.exp(Hc));
  const eff = (m: Model, k: string) => Math.exp(sv(m, k)!);
  const fr = frames(bundle);
  const fiveF = f5(bundle);
  const range = fiveF.cleanRange;

  const at = st.at;
  // field state
  let lit = total;
  let who: { m: Model | null; frame: string } = { m: null, frame: "Census" };
  if (st.step >= 2) {
    lit = lerp(total, eff(A, "H_desc"), easeInOut(at(2)));
    who = { m: A, frame: "described" };
  }
  if (st.step >= 3) {
    const e = easeInOut(seg(at(3), 0.55, 1));
    lit = lerp(eff(A, "H_desc"), eff(A, "H_few"), e);
    if (e > 0) who = { m: A, frame: "few-shot" };
  }
  if (st.step >= 4) {
    lit = lerp(eff(A, "H_few"), eff(B, "H_few"), easeInOut(at(4)));
    if (at(4) > 0.5) who = { m: B, frame: "few-shot" };
  }
  const settled = st.t >= 1 || st.reduced || (st.step !== 2 && st.step !== 3 && st.step !== 4) || (st.step === 3 && at(3) < 0.55);
  const fieldLabel = who.m ? `${who.m === A ? "A" : "B"} · ${who.frame}` : "Census, top 2 000 surnames";
  const fieldValue = who.m ? eff(who.m, who.frame === "described" ? "H_desc" : "H_few") : total;
  const fieldPath = who.m ? path(who.m, sk(who.frame === "described" ? "H_desc" : "H_few")) : "reference.census_entropy_top2000";
  const curM = who.m ?? A;
  const e3Rows = [
    { name: "Census", v: sv(curM, "top10_r"), on: !who.m, fmtKind: "pct" as const },
    { name: `${curM === A ? "A" : "B"} few-shot`, v: sv(curM, "top10_few"), on: who.frame === "few-shot", fmtKind: "pct" as const },
    { name: `${curM === A ? "A" : "B"} described`, v: sv(curM, "top10_desc"), on: who.frame === "described", fmtKind: "pct" as const },
  ];
  // cards
  const fewLines = fr.few.split("\n");
  const itemLines = fewLines.filter((l) => /^\d+\.\s*\S/.test(l)).length;
  const typed = st.step > 3 ? itemLines : st.step === 3 ? Math.floor(seg(at(3), 0, 0.5) * (itemLines + 0.999)) : 0;
  const fewSlot = st.step > 3 || (st.step === 3 && at(3) >= 0.5);
  const descSlot = st.step >= 0 && at(0) > 0 && st.step < 3;
  let itemCount = 0;
  const fewText = fewLines
    .map((l) => {
      if (/^\d+\.\s*\S/.test(l)) {
        itemCount += 1;
        return itemCount <= typed ? l : null;
      }
      if (/^\d+\.\s*$/.test(l)) return fewSlot ? l : null;
      return l;
    })
    .filter((l): l is string => l !== null)
    .join("\n");
  const pitch = Math.max(5, Math.min(9, Math.floor((W >= 560 ? W / 2 - 12 : W) / COLS)));
  const side = W >= 560;
  const topNames = topNamesOf(A, bundle);
  const nullModels = bundle.models.filter((m) => !(isNum(sv(m, "KL_few")) || isNum(sv(m, "KL_desc"))));

  const smithRows = [A, B].map((m, i) => ({ name: `${i === 0 ? "A" : "B"} ${m.label}`, v: sv(m, "smith_plain"), on: true, fmtKind: "pct" as const }));
  const steps: StepSpec[] = [
    {
      title: "Ask for random surnames",
      body: (
        <>
          The described frame asks for “randomly chosen Americans”. If the model sampled the population, its next-name distribution would match the
          2010 Census: about <Num path="reference.census_entropy_top2000" value={total} fmt="eff" derived="exp(census_entropy_top2000)" /> effective
          names among the top 2 000, one dot each.
        </>
      ),
      summary: `The described frame asks for random surnames; the Census has about ${fmtCount(total)} effective names in the top 2 000.`,
    },
    {
      title: "The genre answers, not the population",
      body: (
        <>
          p(Smith) as item 1 under the plain frame: <N m={A} k={sk("smith_plain")} f="pct" /> for A, <N m={B} k={sk("smith_plain")} f="pct" /> for
          B. “A random list of surnames” reads as “a ranked list of common surnames”, which in training text begins Smith, Johnson, Williams.
          {sv(A, "smith_plain") === null || sv(B, "smith_plain") === null
            ? " A dash here means Smith was not that checkpoint’s most likely first name under the plain frame (the probability is recorded only when Smith comes first), not that the probe is missing."
            : ""}
        </>
      ),
      summary: `p(Smith) first: A ${tx(A, sk("smith_plain"), "pct")}, B ${tx(B, sk("smith_plain"), "pct")}.`,
    },
    {
      title: "Thinning",
      body: (
        <>
          Under the described frames {A.label} spreads its mass over only about{" "}
          <Num path={path(A, sk("H_desc"))} value={eff(A, "H_desc")} fmt="eff" derived="exp(surnames.H_desc)" /> effective names, and its top 10
          carry <N m={A} k={sk("top10_desc")} f="pct" /> of the mass against <N m={A} k={sk("top10_r")} f="pct" /> in the Census.
        </>
      ),
      summary: `Described frame: about ${fmtCount(eff(A, "H_desc"))} effective names; top 10 hold ${tx(A, sk("top10_desc"), "pct")}.`,
    },
    {
      title: "Show it six real draws instead",
      body: (
        <>
          Given six genuine Census draws and asked for the seventh, {A.label} relights the field to about{" "}
          <Num path={path(A, sk("H_few"))} value={eff(A, "H_few")} fmt="eff" derived="exp(surnames.H_few)" /> names: KL(Census ‖ model) ={" "}
          <N m={A} k={sk("KL_few")} f="kl" />, against <N m={A} k={sk("KL_desc")} f="kl" /> when described.
        </>
      ),
      summary: `Few-shot frame: about ${fmtCount(eff(A, "H_few"))} effective names, KL ${tx(A, sk("KL_few"), "kl")}.`,
    },
    {
      title: "Post-training thins the tail",
      body: (
        <>
          {full(B)}, shown the same six draws, keeps about <Num path={path(B, sk("H_few"))} value={eff(B, "H_few")} fmt="eff" derived="exp(surnames.H_few)" />{" "}
          effective names: KL <N m={B} k={sk("KL_few")} f="kl" />, entropy <N m={B} k={sk("H_few")} f="nats" /> against the Census{" "}
          <Num path="reference.census_entropy_top2000" fmt="nats" />.
        </>
      ),
      summary: `${B.label} few-shot: about ${fmtCount(eff(B, "H_few"))} effective names, KL ${tx(B, sk("KL_few"), "kl")}.`,
    },
    {
      title: "Every checkpoint",
      body: (
        <>
          Every checkpoint with the test: described (hollow) and few-shot (filled). Pre-anneal checkpoints and clean bases (overall ≥{" "}
          <Num path="findings.CLEAN_BASE_MIN_OVERALL" value={FINDING_DEFS.CLEAN_BASE_MIN_OVERALL} fmt="score" def />) sit at
          few-shot KL{" "}
          {range ? (
            <>
              <Num path="findings.f5.cleanRange[0]" value={range[0]} fmt="kl" derived="min KL_few over pre-anneal and clean bases" />–
              <Num path="findings.f5.cleanRange[1]" value={range[1]} fmt="kl" derived="max KL_few over pre-anneal and clean bases" />
            </>
          ) : (
            "—"
          )}
          , the shaded range. Every described frame lands far to the right.
        </>
      ),
      summary: range ? `Clean checkpoints sit at few-shot KL ${fmt(range[0], "kl")} to ${fmt(range[1], "kl")}.` : "Dumbbells for every checkpoint.",
    },
    {
      title: "Sampling agrees",
      body: (
        <>
          Sampled lists tell the same story. Distinct share: <N m={A} k={sk("distinct")} f="pct" /> for A, <N m={B} k={sk("distinct")} f="pct" /> for
          B. Mean −log p<sub>Census</sub> of the generated Census names: <N m={A} k={sk("surpr")} f="nats" /> and <N m={B} k={sk("surpr")} f="nats" />,
          against <Num path="reference.census_self_entropy_all" fmt="nats1" /> for the Census itself.
        </>
      ),
      summary: `Mean Census surprisal of generated names: A ${tx(A, sk("surpr"), "nats")}, B ${tx(B, sk("surpr"), "nats")}.`,
    },
  ];

  const figure = (
    <div ref={ref}>
      <div className="xp-cards">
        <pre className={`xp-card${st.step >= 3 ? " dim" : ""}`}>
          <span className="xp-card-head">E1 · Described · {fr.descName}</span>
          {fr.desc}
          {descSlot ? <mark aria-label="next item">{"      "}</mark> : null}
        </pre>
        <pre className={`xp-card${st.step < 3 ? " dim" : ""}`}>
          <span className="xp-card-head">E1 · Few-shot · {fr.fewName}</span>
          {fewText}
          {fewSlot ? <mark aria-label="next item">{"      "}</mark> : null}
        </pre>
      </div>
      <div className={side ? "xp-row2" : undefined}>
        <div>
          <p className="xp-sub-label">E2 · Effective number of surnames</p>
          <p className="small" style={{ margin: "0 0 6px" }}>
            {who.m && <InlineGlyph stage={who.m.stage} size={8} hollow={who.m === B} />} <span className="ink2">{fieldLabel}:</span>{" "}
            {settled ? (
              <Num path={fieldPath} value={fieldValue} fmt="eff" derived={who.m ? `exp(${who.frame === "described" ? "H_desc" : "H_few"})` : "exp(census_entropy_top2000)"} />
            ) : (
              <span aria-hidden="true">{fmtNum(Math.round(lit), "eff")}</span>
            )}{" "}
            <span className="ink3">of {fmtCount(total)}</span>
          </p>
          <Field total={total} lit={lit} pitch={pitch} />
          <p className="xp-tag-line">one dot per effective name, rank 1 top left; outlines mark the Census extent</p>
        </div>
        <div>
          <p className="xp-sub-label">p(Smith) as item 1 · plain frame</p>
          <HBarRows width={side ? W / 2 - 8 : W} rows={smithRows} prog={st.step >= 1 ? at(1) : 0} />
          <p className="xp-sub-label" style={{ marginTop: 10 }}>
            E3 · Top-10 mass · {curM === A ? "A" : "B"} {curM.label}
          </p>
          <HBarRows width={side ? W / 2 - 8 : W} rows={e3Rows} prog={1} />
          <p className="small ink2" style={{ margin: "6px 0 0" }}>
            {topNames ? "Per-name distribution below." : "Per-name distribution not in this bundle."}
          </p>
        </div>
      </div>
      {topNames && (
        <div className="xp-sub">
          <p className="xp-sub-label">Model vs Census over the top names · A {A.label}</p>
          <TopNamesChart data={topNames} />
        </div>
      )}
      <div className={"xp-sub" + (st.step >= 5 ? "" : " future")}>
        <p className="xp-sub-label">E4 · KL(Census ‖ model), every checkpoint</p>
        <Dumbbells width={W} bundle={bundle} A={A} B={B} prog={at(5)} range={range} />
        {nullModels.length > 0 && <p className="small ink3">Not measured: {nullModels.map(full).join(", ")}.</p>}
      </div>
      <div className={"xp-sub" + (st.step >= 6 ? "" : " future")}>
        <p className="xp-sub-label">E5 · Sampled lists at temperature 1</p>
        <div className="tbl-scroll">
          <table className="tbl xp-table">
            <thead>
              <tr>
                <th scope="col">statistic</th>
                <th scope="col" className="n">
                  A · {A.label}
                </th>
                <th scope="col" className="n">
                  B · {B.label}
                </th>
                <th scope="col" className="n">
                  Census
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">distinct share</th>
                <td className="n">
                  <N m={A} k={sk("distinct")} f="pct" />
                </td>
                <td className="n">
                  <N m={B} k={sk("distinct")} f="pct" />
                </td>
                <td className="n ink3">—</td>
              </tr>
              <tr>
                <th scope="row">
                  junk (not among <Num path="method.CENSUS_SURNAMES" value={CENSUS_SURNAMES} fmt="count" def /> Census surnames)
                </th>
                <td className="n">
                  <N m={A} k={sk("junk")} f="pct" />
                </td>
                <td className="n">
                  <N m={B} k={sk("junk")} f="pct" />
                </td>
                <td className="n ink3">—</td>
              </tr>
              <tr>
                <th scope="row">mean −log p_Census, nats</th>
                <td className="n">
                  <N m={A} k={sk("surpr")} f="nats" />
                </td>
                <td className="n">
                  <N m={B} k={sk("surpr")} f="nats" />
                </td>
                <td className="n">
                  <Num path="reference.census_self_entropy_all" fmt="nats1" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const keys: [string, "kl" | "nats" | "pct"][] = [
    ["KL_few", "kl"],
    ["KL_desc", "kl"],
    ["H_few", "nats"],
    ["H_desc", "nats"],
    ["top10_few", "pct"],
    ["top10_desc", "pct"],
    ["top10_r", "pct"],
    ["smith_plain", "pct"],
    ["distinct", "pct"],
    ["junk", "pct"],
    ["surpr", "nats"],
  ];
  return (
    <ExplainerShell
      id="surnames"
      label="Plate E · The surname test"
      standfirst="Described as random, every model recites the genre; shown six real draws, a base model matches the population and a post-trained one does not."
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
        />
      }
      figure={figure}
      figureLabel={`Surname test. Census about ${fmtCount(total)} effective names. ${A.label}: described about ${fmtCount(eff(A, "H_desc"))}, few-shot about ${fmtCount(eff(A, "H_few"))}, KL ${tx(A, sk("KL_few"), "kl")}. ${B.label}: few-shot about ${fmtCount(eff(B, "H_few"))}, KL ${tx(B, sk("KL_few"), "kl")}.`}
      caption={
        <>
          Prompt cards print the frame text exactly ({bundle.reference.surname_frames ? "reference.surname_frames" : "method.ts, mirroring SURNAME_PROMPTS in docs/vh_score.py"}). The
          field has round(exp(census_entropy_top2000)) dots and lights round(exp(H)) of them, H over the same 2 000 names (mean over the three frames
          of each kind). KL is exact, over the top 2 000 Census surnames, Title-case and ALL-CAPS spellings summed.
        </>
      }
      sources={["models[*].surnames.{KL_few, KL_desc, H_few, H_desc, top10_*, smith_plain, distinct, junk, surpr}", "reference.census_entropy_top2000, census_self_entropy_all", "method.SURNAME_PROMPTS, CENSUS_SURNAMES"]}
      data={{
        columns: ["field", `A · ${A.label}`, `B · ${B.label}`],
        numeric: [false, true, true],
        rows: keys.map(([k, f]) => [k, tx(A, sk(k), f), tx(B, sk(k), f)]),
      }}
      numbers={[
        { label: "Census entropy (top 2 000)", path: "reference.census_entropy_top2000", fmt: "nats" },
        ...keys.slice(0, 8).map(([k, f]) => pn(`A ${k}`, A, sk(k), f)),
        ...keys.slice(0, 4).map(([k, f]) => pn(`B ${k}`, B, sk(k), f)),
      ]}
    />
  );
}

