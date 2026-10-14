/** F3 · Distillation. Owner: F3 implementer (this file, f3/, the `{#f3}` section of content/findings.md, its plate ids in slots.ts). */
import { Link } from "react-router-dom";
import { Aside, FindingPlate, FindingSection, joinNodes, type FindingNumber } from "../../components/Finding";
import { Num } from "../../components/Num";
import { NullPlate } from "../../components/Plate";
import { fp, path } from "../../data/bundle";
import { ciBounds } from "../../data/ci";
import { STAGE_CODE, stageIndex } from "../../data/derive";
import type { Bundle, Model } from "../../data/types";
import { fmt, fmtNum, isNum, type Fmt } from "../../lib/numfmt";
import { Count, modelHref, N, numbersOf, type ReadOff } from "../shared/prose";
import type { Findings, FindingView, SectionProps } from "../shared/types";
import { GapStrip } from "./f3/GapStrip";

const gap = (m: Model) => fp(m, "F_calib_gap");

export function useFindingView(bundle: Bundle, F: Findings): FindingView {
  const f3 = F.f3;
  const band = F.f1.band;
  const student = f3.student;
  const sibling = f3.studentPost;
  const lowBase = f3.otherBaseMin;
  const postTop = f3.postMax;
  const others = f3.distilled.filter((m) => m.id !== student?.id);
  const name = (m: Model) => `${m.family} ${m.label}`;
  const posts = bundle.models.filter((m) => m.stage === "post-trained" && isNum(gap(m)));
  const postVals = posts.map((m) => gap(m)!);
  const postRange = postVals.length ? { lo: Math.min(...postVals), hi: Math.max(...postVals), label: "post-trained range" } : null;
  const studentCi = student ? ciBounds(student, "calib_gap") : null;
  const ciClear = !!studentCi && !!lowBase && studentCi[1] < lowBase.value;

  const g = (m: Model, what = "F_calib_gap"): ReadOff => ({ model: m, key: "fingerprint.F_calib_gap", fmt: "gap" as Fmt, what });
  const readoffs: ReadOff[] = [
    ...(student ? [g(student)] : []),
    ...(lowBase ? [g(lowBase.model, "F_calib_gap (lowest other base)")] : []),
    ...(postTop ? [g(postTop.model, "F_calib_gap (highest post-trained)")] : []),
    ...(sibling ? [g(sibling)] : []),
    ...others.map((m) => g(m, "F_calib_gap (also distilled)")),
    ...(student ? [{ model: student, key: "fingerprint.roll_instr_marker_rate", fmt: "pct" as Fmt, what: "instruction-marker rate" }] : []),
    ...(sibling ? [{ model: sibling, key: "fingerprint.roll_instr_marker_rate", fmt: "pct" as Fmt, what: "instruction-marker rate" }] : []),
    ...(student ? [{ model: student, key: "tail.tf_fresh.gap_hiH", fmt: "gap" as Fmt, what: "gap at H > 4" }] : []),
    ...(sibling ? [{ model: sibling, key: "tail.tf_fresh.gap_hiH", fmt: "gap" as Fmt, what: "gap at H > 4" }] : []),
    ...(student ? [{ model: student, key: "fingerprint.X_runfrac_wiki", fmt: "pct" as Fmt, what: "Wikipedia verbatim share" }] : []),
  ];
  const bandNumber: FindingNumber[] = band
    ? [{ label: `${band.model.family} · ${band.model.label}, sets the pre-anneal band`, path: path(band.model, "fingerprint.F_calib_gap"), value: band.band, fmt: "nats", derived: "max |F_calib_gap| over pre-anneal checkpoints" }]
    : [];

  const rows = [...bundle.models]
    .sort((a, b) => stageIndex(a.stage) - stageIndex(b.stage) || (gap(a) ?? Infinity) - (gap(b) ?? Infinity))
    .map((m) => {
      const b = ciBounds(m, "calib_gap");
      return [
        `${m.family} · ${m.label}`,
        STAGE_CODE[m.stage],
        fmtNum(gap(m), "gap"),
        b ? `${fmtNum(b[0], "signed")}, ${fmtNum(b[1], "signed")}` : "—",
        fmt(fp(m, "roll_instr_marker_rate"), "pct"),
      ];
    });

  return {
    headline: student ? (
      <>
        Distillation looks like post-training on the calibration axis: {student.family} {student.label} sits at <N m={student} k="fingerprint.F_calib_gap" f="gap" />, below
        every other base.
      </>
    ) : (
      "Distillation: no distilled base in this bundle."
    ),
    standfirst: student ? (
      <>
        {postTop && (
          <>
            That is inside the post-trained range, which begins at {postTop.model.family} {postTop.model.label}, <N m={postTop.model} k="fingerprint.F_calib_gap" f="signed" />
            {lowBase ? "; " : ". "}
          </>
        )}
        {lowBase && (
          <>
            {postTop ? "the" : "The"} next-lowest base is {lowBase.model.family} {lowBase.model.label} at <N m={lowBase.model} k="fingerprint.F_calib_gap" f="signed" />.{" "}
          </>
        )}
        On the prior axis the student still looks like a base: marker rate <N m={student} k="fingerprint.roll_instr_marker_rate" f="pct" />
        {sibling && (
          <>
            {" "}
            against <N m={sibling} k="fingerprint.roll_instr_marker_rate" f="pct" /> for {name(sibling)}
          </>
        )}
        .
        {others.length > 0 && (
          <>
            {" "}
            Also labelled distilled:{" "}
            {joinNodes(
              others.map((m) => (
                <span key={m.id}>
                  {m.family} {m.label} at <N m={m} k="fingerprint.F_calib_gap" f="signed" />
                </span>
              )),
              "; ",
            )}
            .
          </>
        )}
      </>
    ) : undefined,
    aside: (
      <Aside title="How this is checked">
        <p>
          The student is every released base whose label contains “distilled” (<Count n={f3.distilled.length} of="released bases labelled distilled" /> in this bundle). Its F_calib_gap must be below every other anneal or
          base checkpoint and at or below the least over-confident post-trained checkpoint; otherwise a Data note appears here.
        </p>
      </Aside>
    ),
    detail: student ? (
      <p>
        Where it is uncertain (H &gt; 4) the student's gap is <N m={student} k="tail.tf_fresh.gap_hiH" f="gap" />
        {sibling && (
          <>
            , against <N m={sibling} k="tail.tf_fresh.gap_hiH" f="gap" /> for {name(sibling)}
          </>
        )}
        . Its Wikipedia recitation is clean: <N m={student} k="fingerprint.X_runfrac_wiki" f="pct" /> of Wikipedia tokens sit inside verbatim runs. Every reading for this
        checkpoint is on <Link to={modelHref(student)}>its model page</Link>.
      </p>
    ) : undefined,
    plates: {
      "gap-strip": () =>
        student ? (
          <FindingPlate
            label="Plate F3 · Calibration gap, every checkpoint by stage"
            caption={
              <>
                Linear axis; the shaded band is ± the widest pre-anneal gap and the whisker through each glyph is its 95% bootstrap interval over documents. The distilled base is
                ringed; the dashed line joins it to its post-trained sibling.
              </>
            }
            sources={["models[*].fingerprint.F_calib_gap", "models[*].ci.calib_gap.ci95"]}
            data={{ columns: ["checkpoint", "stage", "F_calib_gap, nats", "95% CI", "marker rate"], numeric: [false, false, true, true, true], rows }}
            legend
            look={[
              <>
                The ringed BASE square, {name(student)}, sits left of every other square at <N m={student} k="fingerprint.F_calib_gap" f="signed" />
                {postRange && postTop ? (
                  <>
                    , inside the span of the POST row, which starts at <N m={postTop.model} k="fingerprint.F_calib_gap" f="signed" />
                  </>
                ) : null}
                .
              </>,
              ...(sibling
                ? [
                    <>
                      Its post-trained sibling, {name(sibling)}, moves further left along the dashed line, to <N m={sibling} k="fingerprint.F_calib_gap" f="signed" />.
                    </>,
                  ]
                : []),
              <>
                {band ? (
                  <>
                    The band is ±<Num path={path(band.model, "fingerprint.F_calib_gap")} value={band.band} fmt="nats" derived="max |F_calib_gap| over pre-anneal checkpoints" />, the
                    widest pre-anneal gap.{" "}
                  </>
                ) : null}
                {ciClear && studentCi && lowBase ? (
                  <>
                    The student's interval, <Num path={path(student, "ci.calib_gap.ci95[0]")} value={studentCi[0]} fmt="signed" /> to{" "}
                    <Num path={path(student, "ci.calib_gap.ci95[1]")} value={studentCi[1]} fmt="signed" />, does not reach the next-lowest base.
                  </>
                ) : (
                  <>Whiskers are 95% intervals; hover or focus a glyph for its interval.</>
                )}
              </>,
            ]}
          >
            <GapStrip
              bundle={bundle}
              band={band}
              highlight={student}
              labelIds={[...f3.distilled.map((m) => m.id), ...(lowBase ? [lowBase.model.id] : []), ...(sibling ? [sibling.id] : [])]}
              tags={Object.fromEntries(f3.distilled.map((m) => [m.id, "distilled"]))}
              join={sibling ? { from: student, to: sibling, label: "post-training" } : null}
              postRange={postRange}
            />
          </FindingPlate>
        ) : (
          <NullPlate>No base checkpoint labelled as distilled in this bundle.</NullPlate>
        ),
    },
    numbers: [...numbersOf(readoffs), ...bandNumber],
    checks: f3.checks,
  };
}

export default function F3({ bundle, F, section }: SectionProps) {
  return <FindingSection {...section} n={3} view={useFindingView(bundle, F)} />;
}
