/** F4 · Collapse. Owner: F4 implementer (this file, the `{#f4}` section of content/findings.md, its plate ids in slots.ts). */
import { Fragment } from "react";
import { Link } from "react-router-dom";
import { Aside, FindingPlate, FindingSection, type FindingNumber } from "../../components/Finding";
import { Glyph } from "../../components/Glyph";
import { Num } from "../../components/Num";
import { NullPlate, type DataTableSpec } from "../../components/Plate";
import { rowLabel } from "../../charts/findings/common";
import { StageDotStrip } from "../../charts/ModelCharts";
import { fp, path } from "../../data/bundle";
import { median, STAGE_CODE, STAGE_NAME, stageOrder } from "../../data/derive";
import { ROLL_H_LOW } from "../../data/method";
import type { Bundle, Model } from "../../data/types";
import { fmtNum, isNum, type Fmt } from "../../lib/numfmt";
import { modelHref, N, numbersOf, proseLabel, type ReadOff } from "../shared/prose";
import type { Findings, FindingView, SectionProps } from "../shared/types";

const REP = "fingerprint.roll_rep8_q4";
const FRAC = 'fingerprint["roll_frac_H<0.1"]';
const REP_KEY = "roll_rep8_q4";
const FRAC_KEY = "roll_frac_H<0.1";
/** the derived path findings.ts reports for the post-trained median (existing path; the snapshot test reads the value) */
const REP_MEDIAN_PATH = `median(models[stage=post-trained].${REP})`;
const FRAC_MEDIAN_PATH = `median(models[stage=post-trained].${FRAC})`;
const REP_WHAT = "late 8-gram repetition";
const FRAC_WHAT = "steps with H < 0.1";

const Hlow = () => <Num path="method.ROLL_H_LOW" value={ROLL_H_LOW} fmt="num2" def />;

/** 'above' / 'below' / 'at' for a value against a reference, so a look-at sentence never states a relation the data does not hold. */
const side = (v: number | null, ref: number | null) => (!isNum(v) || !isNum(ref) ? "against" : v > ref ? "to the right of" : v < ref ? "to the left of" : "on");

/** The stage glyph with its code, inline ('● PRE'). */
function StageWord({ stage }: { stage: Model["stage"] }) {
  return (
    <>
      <Glyph stage={stage} size={8} title={STAGE_NAME[stage]} /> {STAGE_CODE[stage]}
    </>
  );
}

export function useFindingView(bundle: Bundle, F: Findings): FindingView {
  const f4 = F.f4;
  const sp4 = f4.specimen;
  const next4 = sp4 ? f4.family.find((r) => r.order > sp4.order && r.stage !== "post-trained") : undefined;
  const ok = f4.checks.notDiagnostic.ok;
  const readoffs: ReadOff[] = f4.family.flatMap((m) => [
    { model: m, key: FRAC, fmt: "pct" as Fmt, what: FRAC_WHAT },
    { model: m, key: REP, fmt: "pct" as Fmt, what: REP_WHAT },
  ]);
  const ids = f4.family.map((m) => m.id);
  const famName = sp4 ? sp4.family : "";

  // every checkpoint with own-sample statistics, for the Data tables and the axis domains
  const measured = bundle.models.filter((m) => isNum(fp(m, REP_KEY)) || isNum(fp(m, FRAC_KEY)));
  const maxOf = (k: string) => Math.max(0, ...measured.map((m) => fp(m, k)).filter(isNum));
  const domainOf = (k: string): [number, number] => {
    const mx = maxOf(k);
    return [0, mx > 0 ? mx * 1.06 : 1];
  };
  const fracPostMedian = median(bundle.models.filter((m) => m.stage === "post-trained").map((m) => fp(m, FRAC_KEY)).filter(isNum));

  const repMedianNum: FindingNumber = {
    label: "post-trained checkpoints, median late 8-gram repetition",
    path: REP_MEDIAN_PATH,
    value: f4.postRepMedian,
    fmt: "pct",
    derived: "median over post-trained checkpoints",
  };
  const fracMedianNum: FindingNumber = {
    label: "post-trained checkpoints, median share of steps with H < 0.1",
    path: FRAC_MEDIAN_PATH,
    value: fracPostMedian,
    fmt: "pct",
    derived: "median over post-trained checkpoints",
  };
  const hLowNum: FindingNumber = { label: "near-deterministic threshold on H", path: "method.ROLL_H_LOW", value: ROLL_H_LOW, fmt: "num2", def: true };
  const repNumbers = [...numbersOf(readoffs.filter((r) => r.key === REP)), repMedianNum];
  const fracNumbers = [...numbersOf(readoffs.filter((r) => r.key === FRAC)), fracMedianNum, hLowNum];

  // one Data table serves both plates: every checkpoint, both features, stage order then repetition descending
  const data: DataTableSpec = {
    columns: ["checkpoint", "stage", "late 8-gram repetition", "steps with H < 0.1"],
    numeric: [false, false, true, true],
    rows: [...measured]
      .sort((a, b) => stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage) || (fp(b, REP_KEY) ?? -1) - (fp(a, REP_KEY) ?? -1))
      .map((m) => [
        <Link key={m.id} to={modelHref(m)}>
          {m.family} · {m.label}
        </Link>,
        STAGE_CODE[m.stage],
        fmtNum(fp(m, REP_KEY), "pct"),
        fmtNum(fp(m, FRAC_KEY), "pct"),
      ]),
  };

  const tags = sp4 && !ok ? { [sp4.id]: "exception" } : undefined;
  const labelOf = (m: Model) => rowLabel(m, f4.family);

  const strip = (key: string, p: string, axisTitle: string, metricName: string) => (
    <StageDotStrip
      bundle={bundle}
      value={(m) => fp(m, key)}
      valuePath={(m) => path(m, p)}
      fmtKind="pct"
      axisTitle={axisTitle}
      domain={domainOf(key)}
      labelIds={ids}
      labelOf={labelOf}
      highlight={sp4?.id}
      noJoinArrow
      median
      tags={tags}
      metricName={metricName}
    />
  );

  const medianNote = <>Each row's tick is that stage's median, printed under it. Labels name the {famName} triple; the ringed glyph is the specimen. Hover or focus a glyph for its checkpoint, value and path.</>;

  return {
    headline: sp4 ? (
      <>
        Free-running collapse is not diagnostic: the pre-anneal {proseLabel(sp4)} repeats <N m={sp4} k={REP} f="pct" /> of late 8-grams, above the post-trained median
        of{" "}
        {isNum(f4.postRepMedian) ? <Num path={REP_MEDIAN_PATH} value={f4.postRepMedian} fmt="pct" derived="median over post-trained checkpoints" /> : "—"}.
      </>
    ) : (
      "No pre-anneal checkpoint with own-sample statistics in this bundle."
    ),
    standfirst: sp4 ? (
      <>
        It spends <N m={sp4} k={FRAC} f="pct" /> of its own sampling steps below <Hlow /> nats of entropy
        {next4 && (
          <>
            ; annealed, it repeats <N m={next4} k={REP} f="pct" />
          </>
        )}
        . Collapse is shown on model pages and is not scored.
      </>
    ) : undefined,
    detail: sp4 ? (
      <p>
        It is not scored because it does not separate the stages: the pre-anneal rung and the annealed rung after it fall into attractors as readily as the
        post-trained checkpoints do, and a feature that every stage shares cannot place a checkpoint on the ladder. The statistics that expose collapse are the{" "}
        <Link to="/methodology#lexical">own-sample lexical statistics</Link>, reported on every model page; for the specimen they are under{" "}
        <Link to={`${modelHref(sp4)}#samples`}>Own samples</Link>.
      </p>
    ) : undefined,
    aside: sp4 ? (
      <Aside title="How this is checked">
        <p>
          The specimen is the pre-anneal checkpoint with the highest share of own-sample steps below <Hlow /> nats (computed, never named).
        </p>
        <p>
          It{next4 ? " and the next annealed rung" : ""} must repeat at least as much of its late 8-grams as the median post-trained checkpoint,{" "}
          {isNum(f4.postRepMedian) ? <Num path={REP_MEDIAN_PATH} value={f4.postRepMedian} fmt="pct" derived="median over post-trained checkpoints" /> : "—"}. If that
          stops holding, a Data note appears here and the specimen is tagged on the plate.
        </p>
      </Aside>
    ) : undefined,
    plates: {
      "collapse-strip": () =>
        sp4 ? (
          <Fragment>
            <FindingPlate
              label="Plate F4 · Late 8-gram repetition, by stage"
              caption={<>Share of 8-grams in the last quarter of each own sample that already occurred in the sample. {medianNote}</>}
              sources={[`models[*].${REP}`]}
              data={data}
              legend
              look={[
                <Fragment key="pre">
                  The highlighted <StageWord stage={sp4.stage} /> circle, {labelOf(sp4)} at <N m={sp4} k={REP} f="pct" />, sits {side(fp(sp4, REP_KEY), f4.postRepMedian)} the
                  POST median tick.
                </Fragment>,
                ...(next4
                  ? [
                      <Fragment key="next">
                        So does the <StageWord stage={next4.stage} /> {next4.stage === "base" ? "square" : "glyph"} for the rung after it, {labelOf(next4)} at{" "}
                        <N m={next4} k={REP} f="pct" />: it sits {side(fp(next4, REP_KEY), f4.postRepMedian)} the tick.
                      </Fragment>,
                    ]
                  : []),
                <Fragment key="post">
                  The POST tick is the headline's{" "}
                  {isNum(f4.postRepMedian) ? <Num path={REP_MEDIAN_PATH} value={f4.postRepMedian} fmt="pct" derived="median over post-trained checkpoints" /> : "—"}; the
                  triangles spread to both sides of it, as every other row does around its own tick.
                </Fragment>,
              ]}
              numbers={repNumbers}
            >
              {strip(REP_KEY, REP, "repeated 8-grams, last quarter of own samples", REP_WHAT)}
            </FindingPlate>
            <FindingPlate
              label="Plate F4b · Near-deterministic own-sample steps, by stage"
              caption={
                <>
                  Share of own-sample steps where the model's entropy was below <Hlow /> nats. {medianNote}
                </>
              }
              sources={[`models[*].${FRAC}`, "method.ROLL_H_LOW"]}
              data={data}
              legend
              look={[
                <Fragment key="pre">
                  The highlighted <StageWord stage={sp4.stage} /> circle is the specimen by construction: the pre-anneal checkpoint with the largest share, <N m={sp4} k={FRAC} f="pct" />
                  , {side(fp(sp4, FRAC_KEY), fracPostMedian)} the POST median tick{" "}
                  {isNum(fracPostMedian) ? <Num path={FRAC_MEDIAN_PATH} value={fracPostMedian} fmt="pct" derived="median over post-trained checkpoints" /> : "—"}.
                </Fragment>,
                <Fragment key="thr">
                  A step counts when the entropy of the model's own next-token distribution is below <Hlow /> nats: one token holds almost all the mass, which is what a
                  single-glyph attractor looks like step by step.
                </Fragment>,
                ...(next4
                  ? [
                      <Fragment key="next">
                        The rung after it, {labelOf(next4)} (<StageWord stage={next4.stage} />), is at <N m={next4} k={FRAC} f="pct" />.
                      </Fragment>,
                    ]
                  : []),
              ]}
              numbers={fracNumbers}
            >
              {strip(FRAC_KEY, FRAC, `share of own-sample steps with H < ${fmtNum(ROLL_H_LOW, "num2")}`, FRAC_WHAT)}
            </FindingPlate>
          </Fragment>
        ) : (
          <NullPlate>No pre-anneal checkpoint with own-sample statistics in this bundle.</NullPlate>
        ),
    },
    numbers: [...numbersOf(readoffs), repMedianNum, fracMedianNum, hLowNum],
    checks: f4.checks,
  };
}

export default function F4({ bundle, F, section }: SectionProps) {
  return <FindingSection {...section} n={4} view={useFindingView(bundle, F)} />;
}
