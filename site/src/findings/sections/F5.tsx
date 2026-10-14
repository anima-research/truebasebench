/** F5 · Surnames. Owner: F5 implementer (this file, src/findings/sections/f5/, the `{#f5}` section of content/findings.md, its plate ids in slots.ts). */
import { Link } from "react-router-dom";
import { Aside, FindingPlate, FindingSection } from "../../components/Finding";
import { Num } from "../../components/Num";
import { NullPlate } from "../../components/Plate";
import { LadderChart } from "../../charts/FindingCharts";
import { rowLabel } from "../../charts/findings/common";
import { StageDotStrip } from "../../charts/ModelCharts";
import { get, path } from "../../data/bundle";
import { ciBounds } from "../../data/ci";
import { basePairFor, ladder, STAGE_CODE } from "../../data/derive";
import type { Bundle, Model } from "../../data/types";
import { FINDING_DEFS } from "../../findings";
import { fmt, isNum, type Fmt } from "../../lib/numfmt";
import { effMetric } from "../shared/metrics";
import { Count, Def, joinList, modelHref, N, numbersOf, type ReadOff } from "../shared/prose";
import type { FindingNumber, Findings, FindingView, SectionProps } from "../shared/types";
import { KLDumbbellsPlate, klRows } from "./f5/KLDumbbellsPlate";


const few = (m: Model) => m.surnames?.KL_few ?? null;
const desc = (m: Model) => m.surnames?.KL_desc ?? null;
const name = (m: Model) => `${m.family} ${m.label}`;
const link = (m: Model) => (
  <Link key={m.id} to={modelHref(m)}>
    {name(m)}
  </Link>
);
const extremum = (ms: Model[], v: (m: Model) => number | null, lo: boolean) =>
  ms.reduce<Model | null>((a, m) => (!isNum(v(m)) ? a : !a || (lo ? v(m)! < v(a)! : v(m)! > v(a)!) ? m : a), null);

export function useFindingView(bundle: Bundle, F: Findings): FindingView {
  const f5 = F.f5;
  const B = f5.B;
  const family = F.f1.family;
  const famRungs = family ? ladder(bundle, family) : [];
  const eff = effMetric(bundle);
  const range = f5.cleanRange;
  const cleanIds = new Set(f5.clean.map((m) => m.id));
  const cleanLo = extremum(f5.clean, few, true);
  const cleanHi = extremum(f5.clean, few, false);
  const rows = klRows(bundle.models);
  const measured = new Set(rows.map((m) => m.id));
  const missing = bundle.models.filter((m) => !measured.has(m.id));
  const cleanBases = f5.clean.filter((m) => m.stage === "base");
  const pairsN = bundle.models.filter((m) => m.stage === "post-trained" && m.surnames).filter((p) => basePairFor(bundle, p)?.surnames).length;

  // what the figure shows, computed so the margin text cannot drift from the marks
  const posts = rows.filter((m) => m.stage === "post-trained" && isNum(few(m)));
  const postRight = range ? posts.filter((m) => few(m)! > range[1]) : [];
  const postInside = posts.filter((m) => !postRight.includes(m));
  const postMax = extremum(posts, few, false);
  const otherBases = rows.filter((m) => m.stage === "base" && !cleanIds.has(m.id) && isNum(few(m)));
  const otherOutside = range ? otherBases.filter((m) => few(m)! < range[0] || few(m)! > range[1]) : otherBases;
  const both = rows.filter((m) => isNum(few(m)) && isNum(desc(m)));
  const hollowLeft = both.filter((m) => desc(m)! <= few(m)!);

  // exceptions: a failed check names its checkpoint in the head and tags its row in the figure
  const cleanOffenders = f5.checks.clean.ok ? [] : f5.clean.filter((m) => isNum(few(m)) && few(m)! >= FINDING_DEFS.CLEAN_KL_MAX);
  const tags: Record<string, string> = {};
  for (const m of cleanOffenders) tags[m.id] = "exception";
  if (B && !f5.checks.thinned.ok) tags[B.id] = "exception";
  const exceptions = [
    ...cleanOffenders.map((m) => (
      <span key={"c" + m.id}>
        {name(m)} <N m={m} k="surnames.KL_few" f="kl" /> (clean, yet above the range ceiling)
      </span>
    )),
    ...(B && !f5.checks.thinned.ok
      ? [
          <span key={"t" + B.id}>
            {name(B)} <N m={B} k="surnames.KL_few" f="kl" /> (not above twice the clean maximum)
          </span>,
        ]
      : []),
  ];

  // described frame (plate F5c)
  const descModels = bundle.models.filter((m) => m.surnames && isNum(m.surnames.top10_desc) && isNum(m.surnames.top10_r));
  const descBundle: Bundle = { ...bundle, models: descModels };
  const censusRef = descModels[0] ?? null;
  const top10 = (m: Model) => get(m, "surnames.top10_desc");
  const descLo = extremum(descModels, top10, true);
  const descHi = extremum(descModels, top10, false);
  const descBelow = descModels.filter((m) => (m.surnames!.top10_desc as number) <= (m.surnames!.top10_r as number));

  const readoffs: ReadOff[] = [
    ...f5.clean.map((m) => ({ model: m, key: "surnames.KL_few", fmt: "kl" as Fmt, what: "few-shot KL" })),
    ...(B
      ? [
          { model: B, key: "surnames.KL_few", fmt: "kl" as Fmt, what: "few-shot KL" },
          { model: B, key: "surnames.KL_desc", fmt: "kl" as Fmt, what: "described KL" },
          { model: B, key: "surnames.H_few", fmt: "num2" as Fmt, what: "few-shot entropy, nats" },
        ]
      : []),
    ...(descLo ? [{ model: descLo, key: "surnames.top10_desc", fmt: "pct" as Fmt, what: "described top-10 mass (lowest)" }] : []),
    ...(descHi ? [{ model: descHi, key: "surnames.top10_desc", fmt: "pct" as Fmt, what: "described top-10 mass (highest)" }] : []),
  ];
  const plateNumbers: FindingNumber[] = [
    ...(cleanLo ? numbersOf([{ model: cleanLo, key: "surnames.KL_few", fmt: "kl", what: "few-shot KL (clean minimum)" }]) : []),
    ...(cleanHi ? numbersOf([{ model: cleanHi, key: "surnames.KL_few", fmt: "kl", what: "few-shot KL (clean maximum)" }]) : []),
    ...(B
      ? numbersOf([
          { model: B, key: "surnames.KL_few", fmt: "kl", what: "few-shot KL" },
          { model: B, key: "surnames.KL_desc", fmt: "kl", what: "described KL" },
        ])
      : []),
  ];

  return {
    headline: (
      <>
        Shown six genuine Census draws, pre-anneal checkpoints and clean bases match the population (KL{" "}
        {cleanLo ? <N m={cleanLo} k="surnames.KL_few" f="kl" /> : "—"}–{cleanHi ? <N m={cleanHi} k="surnames.KL_few" f="kl" /> : "—"}); post-training thins the tail.
      </>
    ),
    standfirst: (
      <>
        {B && (
          <>
            {name(B)} reaches KL <N m={B} k="surnames.KL_few" f="kl" />, with a few-shot entropy of <N m={B} k="surnames.H_few" f="num2" /> nats against the Census{" "}
            <Num path="reference.census_entropy_top2000" fmt="num2" />.{" "}
          </>
        )}
        Asked in words for a random list, every checkpoint answers with the ranked list of common surnames
        {f5.checks.genre.ok ? (
          <>
            {" "}
            — top-10 mass above the Census in all <Count n={f5.nWithSurnames} of="checkpoints with a surname block" /> measured —{" "}
          </>
        ) : (
          ", "
        )}
        and post-training sharpens that into recitation in <Count n={f5.sharpenPairs.length} of="base → post pairs whose few-shot KL rises" /> of the{" "}
        <Count n={pairsN} of="base → post pairs with surname blocks on both rungs" /> base → post pairs.
      </>
    ),
    exceptions,
    aside: (
      <Aside title="How this is checked">
        <p>
          A checkpoint is <em>clean</em> when it is pre-anneal, or a released base with overall ≥ <Def name="CLEAN_BASE_MIN_OVERALL" f="score" />. Clean bases in this
          bundle: {cleanBases.length ? joinList(cleanBases.map(link)) : "none"}.
        </p>
        <p>
          The claim holds while every clean few-shot KL stays below <Def name="CLEAN_KL_MAX" f="kl" />, while {B ? `${B.label}’s` : "the specimen’s"} few-shot KL exceeds
          twice the clean maximum, and while every measured checkpoint’s described top-10 mass exceeds the Census share.
        </p>
      </Aside>
    ),
    plates: {
      "surname-kl": () => (
        <FindingPlate
          label="Plate F5a · KL(Census‖model), described and few-shot"
          caption={
            <>
              Log axis with labelled decades; rows grouped by stage and sorted by few-shot KL. The whisker on the filled end is the range over the few-shot frames. A{" "}
              <span aria-hidden="true" style={{ display: "inline-block", width: 2, height: 11, background: "var(--ink)", verticalAlign: "-1px" }} /> tick marks a row
              counted in the clean range: PRE, or BASE with overall ≥ <Def name="CLEAN_BASE_MIN_OVERALL" f="score" />. The highlighted row is specimen B.
            </>
          }
          sources={["models[*].surnames.KL_few", "models[*].surnames.KL_desc", "models[*].ci.KL_few.range"]}
          legend={{ hollowNote: "hollow = described · filled = few-shot" }}
          look={[
            <>
              Every PRE circle and every ticked BASE square sits inside the band: they define it. The unticked BASE squares sit inside it too
              {otherOutside.length > 0 && (
                <>
                  , except{" "}
                  {joinList(
                    otherOutside.map((m) => (
                      <span key={m.id}>
                        {name(m)} at <N m={m} k="surnames.KL_few" f="kl" />
                      </span>
                    )),
                  )}
                </>
              )}
              .
            </>,
            <>
              <Count n={postRight.length} of="post-trained checkpoints with few-shot KL above the clean range" /> of the{" "}
              <Count n={posts.length} of="post-trained checkpoints with a few-shot KL" /> POST triangles sit right of the band
              {postInside.length > 0 && (
                <>
                  ; {joinList(postInside.map((m) => <span key={m.id}>{name(m)}</span>))} {postInside.length === 1 ? "falls" : "fall"} inside it
                </>
              )}
              .
              {postMax && (
                <>
                  {" "}
                  The farthest is {name(postMax)} at <N m={postMax} k="surnames.KL_few" f="kl" />.
                </>
              )}
            </>,
            <>
              The hollow end sits right of the filled end on{" "}
              {hollowLeft.length === 0 ? (
                "every row"
              ) : (
                <>
                  <Count n={both.length - hollowLeft.length} of="checkpoints with KL_desc above KL_few" /> of{" "}
                  <Count n={both.length} of="checkpoints with both KL_few and KL_desc" /> rows
                </>
              )}
              : the
              described frame is further from the Census than the few-shot frame
              {hollowLeft.length > 0 && <> (not for {joinList(hollowLeft.map((m) => <span key={m.id}>{name(m)}</span>))})</>}.
            </>,
          ]}
          numbers={plateNumbers}
          data={{
            columns: ["checkpoint", "stage", "KL_few", "range lo", "range hi", "KL_desc", "clean"],
            numeric: [false, false, true, true, true, true, false],
            rows: rows.map((m) => {
              const b = ciBounds(m, "KL_few");
              return [name(m), STAGE_CODE[m.stage], fmt(few(m), "kl"), b ? fmt(b[0], "kl") : "—", b ? fmt(b[1], "kl") : "—", fmt(desc(m), "kl"), cleanIds.has(m.id) ? "yes" : "no"];
            }),
          }}
        >
          <KLDumbbellsPlate rows={rows} range={range} cleanIds={cleanIds} specimenId={B?.id} tags={tags} />
          {missing.length > 0 && <NullPlate>Surname test not run for this checkpoint: {joinList(missing.map(link))}.</NullPlate>}
        </FindingPlate>
      ),
      "surname-top10": () =>
        censusRef ? (
          <FindingPlate
            label="Plate F5c · Top-10 mass under the described frame"
            caption={
              <>
                Linear axis; the band ends at the Census top-10 share, <N m={censusRef} k="surnames.top10_r" f="pct" />. Every glyph right of it puts more mass on the ten most common
                names than the population does.
              </>
            }
            sources={["models[*].surnames.top10_desc", "models[*].surnames.top10_r"]}
            legend
            look={[
              <>
                {descBelow.length === 0 ? (
                  <>
                    All <Count n={descModels.length} of="checkpoints with a described top-10 mass" />
                  </>
                ) : (
                  <>
                    <Count n={descModels.length - descBelow.length} of="checkpoints with described top-10 mass above the Census share" /> of{" "}
                    <Count n={descModels.length} of="checkpoints with a described top-10 mass" />
                  </>
                )}{" "}
                measured checkpoints sit right of the band
                {descBelow.length > 0 && <> (not {joinList(descBelow.map((m) => <span key={m.id}>{name(m)}</span>))})</>}
                {descLo && descHi && (
                  <>
                    , from {name(descLo)} at <N m={descLo} k="surnames.top10_desc" f="pct" /> to {name(descHi)} at <N m={descHi} k="surnames.top10_desc" f="pct" />
                  </>
                )}
                .
              </>,
            ]}
            data={{
              columns: ["checkpoint", "stage", "top-10 mass, described", "top-10 mass, few-shot", "Census"],
              numeric: [false, false, true, true, true],
              rows: descModels.map((m) => [name(m), STAGE_CODE[m.stage], fmt(top10(m), "pct"), fmt(get(m, "surnames.top10_few"), "pct"), fmt(get(m, "surnames.top10_r"), "pct")]),
            }}
          >
            <StageDotStrip
              bundle={descBundle}
              value={top10}
              valuePath={(m) => path(m, "surnames.top10_desc")}
              fmtKind="pct"
              axisTitle="mass on the ten most common surnames under the described frame, share of the 2,000-name set, linear"
              domain={[0, 1]}
              ticks={[0, 0.25, 0.5, 0.75, 1]}
              band={{ lo: 0, hi: censusRef.surnames!.top10_r as number, label: "at or below the Census share" }}
              labelIds={[...(B ? [B.id] : []), ...(descLo ? [descLo.id] : [])]}
              labelOf={(m) => rowLabel(m, descModels)}
              metricName="top-10 mass"
            />
            {missing.length > 0 && <NullPlate>Surname test not run for this checkpoint: {joinList(missing.map(link))}.</NullPlate>}
          </FindingPlate>
        ) : null,
      "ladder-surname-kl": () =>
        family ? (
          <FindingPlate
            label={`Plate F5b · Effective number of surnames along the ${family} ladder`}
            caption="exp(H_few) per rung, linear; the dashed line is the Census over the same 2,000 names."
            sources={[`models[family=${family}].surnames.H_few`, "reference.census_entropy_top2000"]}
            legend={{ stages: Array.from(new Set(famRungs.map((m) => m.stage))) }}
            look={
              famRungs.length
                ? [
                    <>
                      From{" "}
                      <Num path={eff.pathOf(famRungs[0])} value={eff.value(famRungs[0])} fmt="eff" derived={`exp(H_few) of ${famRungs[0].label}`} /> effective names at{" "}
                      {famRungs[0].label} to{" "}
                      <Num path={eff.pathOf(famRungs[famRungs.length - 1])} value={eff.value(famRungs[famRungs.length - 1])} fmt="eff" derived={`exp(H_few) of ${famRungs[famRungs.length - 1].label}`} />{" "}
                      at {famRungs[famRungs.length - 1].label}; the Census line is{" "}
                      {eff.ref ? <Num path="reference.census_entropy_top2000" value={eff.ref.value} fmt="eff" derived="exp(census_entropy_top2000)" /> : "—"}.
                    </>,
                  ]
                : []
            }
            data={{
              columns: ["rung", "stage", "H_few, nats", "exp(H_few)"],
              numeric: [false, false, true, true],
              rows: famRungs.map((m) => [m.label, STAGE_CODE[m.stage], fmt(get(m, "surnames.H_few"), "num3"), fmt(eff.value(m), "eff")]),
            }}
          >
            <LadderChart rungs={famRungs} metric={eff} domain={[0, Math.max(eff.ref?.value ?? 0, ...famRungs.map(eff.value).filter(isNum)) * 1.08]} height={180} />
          </FindingPlate>
        ) : null,
    },
    numbers: numbersOf(readoffs),
    checks: f5.checks,
  };
}

export default function F5({ bundle, F, section }: SectionProps) {
  return <FindingSection {...section} n={5} view={useFindingView(bundle, F)} />;
}
