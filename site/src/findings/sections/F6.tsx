/** F6 · Tail. Owner: F6 implementer (this file, src/findings/sections/f6/, the `{#f6}` section of content/findings.md, its plate ids in slots.ts). */
import type { ReactNode } from "react";
import { Aside, FindingPlate, FindingSection } from "../../components/Finding";
import { Num } from "../../components/Num";
import { PairedArrows, type Metric } from "../../charts/FindingCharts";
import { get, path } from "../../data/bundle";
import type { Bundle, Model, Stage } from "../../data/types";
import { stageIndex } from "../../data/derive";
import { FINDING_DEFS, type TailPair } from "../../findings";
import { isNum, type Fmt } from "../../lib/numfmt";
import { Def, joinList, N, numbersOf, type ReadOff } from "../shared/prose";
import type { Findings, FindingView, SectionProps } from "../shared/types";
import { HiHArrows, HIH_KEY, HIH_NAME, type HiHOutlier, type HiHRow } from "./f6/HiHArrows";

const S10_KEY = 'tail.tf_fresh["s>10"]';

/** tail.tf_fresh["s>10"] as a paired-arrows metric (base → post-trained, relative change). */
export const s10Metric: Metric = {
  key: "s10",
  name: "s > 10 rate",
  value: (m) => get(m, ["tail", "tf_fresh", "s>10"]),
  pathOf: (m) => path(m, ["tail", "tf_fresh", "s>10"]),
  fmtKind: "pct",
  axis: "share of post-cutoff tokens with s > 10 nats",
  zero: true,
  deltaFmt: "pctSigned",
};

/** 'Family label' for prose; a post-trained label's parenthetical repeats its stage, so it is dropped there. */
const name = (m: Model) => `${m.family} ${m.stage === "post-trained" ? m.label.replace(/\s*\(.*?\)\s*/g, " ").trim() : m.label}`;

const riseNum = (p: TailPair, fmt: Fmt = "pct") => (
  <Num path={`${path(p.post, S10_KEY)} / ${path(p.base, S10_KEY)} − 1`} value={p.rise} fmt={fmt} derived={`${p.post.label} vs ${p.base.label}, relative change`} />
);
const fallNum = (p: TailPair) => (
  <Num path={`${path(p.base, HIH_KEY)} − ${path(p.post, HIH_KEY)}`} value={-p.hiDelta!} fmt="num2" derived={`${p.post.label} vs ${p.base.label}, fall of the gap at H > 4`} />
);
const deltaNum = (p: TailPair) => (
  <Num path={`${path(p.post, HIH_KEY)} − ${path(p.base, HIH_KEY)}`} value={p.hiDelta} fmt="signed" derived={`${p.post.label} vs ${p.base.label}, change of the gap at H > 4`} />
);
const countNum = (value: number, derived: string) => <Num path={`count(${derived})`} value={value} fmt="count" derived={derived} />;

export function useFindingView(_bundle: Bundle, F: Findings): FindingView {
  const f6 = F.f6;
  const pick = (ps: TailPair[], key: (p: TailPair) => number, lo: boolean) => ps.reduce<TailPair | null>((a, p) => (!a || (lo ? key(p) < key(a) : key(p) > key(a)) ? p : a), null);
  const rLo = pick(f6.rateSupport, (p) => p.rise, true);
  const rHi = pick(f6.rateSupport, (p) => p.rise, false);
  const gLo = pick(f6.gapSupport, (p) => -p.hiDelta!, true);
  const gHi = pick(f6.gapSupport, (p) => -p.hiDelta!, false);
  const nPairs = countNum(f6.pairs.length, "base → post-trained pairs with tail.tf_fresh in the bundle");
  const nRate = countNum(f6.rateSupport.length, `pairs whose s > 10 rate rises by at least findings.F6_RATE_SUPPORT`);
  const nGap = countNum(f6.gapSupport.length, `pairs whose gap at H > 4 falls by more than findings.F6_GAP_SUPPORT`);
  const rateRange = rLo && rHi ? <>{riseNum(rLo)}–{riseNum(rHi)}</> : "—";
  const gapRange = gLo && gHi ? <>{fallNum(gLo)}–{fallNum(gHi)} nats</> : "—";
  const medianNum = isNum(f6.baseHiMedian) ? (
    <Num path="median(models[stage≠post-trained].tail.tf_fresh.gap_hiH)" value={f6.baseHiMedian} fmt="signed" derived="median over pre-anneal, anneal and base" />
  ) : (
    "—"
  );

  // ----- plate F6a: gap at H > 4 -----
  const gapExc = new Set(f6.gapExceptions.map((p) => p.post.id));
  const hiRows: HiHRow[] = f6.pairs
    .filter((p): p is TailPair & { hiBase: number; hiPost: number; hiDelta: number } => isNum(p.hiBase) && isNum(p.hiPost) && isNum(p.hiDelta))
    .map((p) => ({ base: p.base, post: p.post, vBase: p.hiBase, vPost: p.hiPost, delta: p.hiDelta, tag: gapExc.has(p.post.id) ? "exception" : undefined }))
    .sort((a, b) => a.delta - b.delta || a.post.family.localeCompare(b.post.family));
  const hiMissing = f6.pairs.filter((p) => !isNum(p.hiDelta));
  const outliers: HiHOutlier[] = f6.baseHiExceptions.map((x) => ({ model: x.model, value: x.value, tag: "base outlier" }));
  const stagesOf = (ms: Model[]): Stage[] => Array.from(new Set(ms.map((m) => m.stage))).sort((a, b) => stageIndex(a) - stageIndex(b));
  const hiStages = stagesOf([...hiRows.flatMap((r) => [r.base, r.post]), ...outliers.map((o) => o.model)]);
  const hiReadoffs: ReadOff[] = [
    ...hiRows.flatMap((r) => [
      { model: r.base, key: HIH_KEY, fmt: "gap" as Fmt, what: HIH_NAME },
      { model: r.post, key: HIH_KEY, fmt: "gap" as Fmt, what: HIH_NAME },
    ]),
    ...outliers.map((o) => ({ model: o.model, key: HIH_KEY, fmt: "gap" as Fmt, what: HIH_NAME })),
  ];
  const hiData = {
    columns: ["pair", "base", "post-trained", "Δ", "tag"],
    numeric: [false, true, true, true, false],
    rows: [
      ...hiRows.map((r) => [`${r.post.family} · ${r.base.label} → ${r.post.label}`, <N m={r.base} k={HIH_KEY} f="gap" />, <N m={r.post} k={HIH_KEY} f="gap" />, deltaNum(f6.pairs.find((p) => p.post.id === r.post.id)!), r.tag ?? ""]),
      ...outliers.map((o) => [`${o.model.family} · ${o.model.label}`, <N m={o.model} k={HIH_KEY} f="gap" />, "—", "—", o.tag]),
    ] as ReactNode[][],
  };
  const hiLook: ReactNode[] = [
    <>
      Every arrow but the tagged ones points left out of the band: at H &gt; 4 the post-trained rung is {gapRange} more over-confident than the base it was trained from.
    </>,
    <>
      The band holds every hollow glyph{outliers.length > 0 && <> except the base outlier{outliers.length > 1 ? "s" : ""}</>}: bases sit at zero there (median {medianNum}).
    </>,
    ...(f6.gapExceptions.length > 0
      ? [
          <>
            The {f6.gapExceptions.length === 1 ? "tagged row is the exception" : "tagged rows are the exceptions"} named above,{" "}
            {joinList(
              f6.gapExceptions.map((p) => (
                <span key={p.post.id}>
                  {name(p.post)} at <N m={p.post} k={HIH_KEY} f="signed" />
                </span>
              )),
            )}
            .
          </>,
        ]
      : []),
  ];

  // ----- plate F6b: s > 10 rate -----
  const rateExc = new Set(f6.rateExceptions.map((p) => p.post.id));
  const rateRows = f6.pairs.map((p) => ({ base: p.base, post: p.post, vBase: p.rateBase, vPost: p.ratePost, delta: p.rise }));
  const rateTags = Object.fromEntries(f6.rateExceptions.map((p) => [p.post.id, "exception"]));
  const rateStages = stagesOf(f6.pairs.flatMap((p) => [p.base, p.post]));
  const rateReadoffs: ReadOff[] = f6.pairs.flatMap((p) => [
    { model: p.base, key: S10_KEY, fmt: "pct" as Fmt, what: "s > 10 rate" },
    { model: p.post, key: S10_KEY, fmt: "pct" as Fmt, what: "s > 10 rate" },
  ]);
  const rateData = {
    columns: ["pair", "base", "post-trained", "Δ", "tag"],
    numeric: [false, true, true, true, false],
    rows: [...f6.pairs]
      .sort((a, b) => b.rise - a.rise)
      .map((p) => [`${p.post.family} · ${p.base.label} → ${p.post.label}`, <N m={p.base} k={S10_KEY} f="pct" />, <N m={p.post} k={S10_KEY} f="pct" />, riseNum(p, "pctSigned"), rateExc.has(p.post.id) ? "exception" : ""]) as ReactNode[][],
  };
  const rateLook: ReactNode[] = [
    <>
      Every arrow points right: the share of real tokens the model rated near-impossible rises in {nRate} of {nPairs} pairs by at least <Def name="F6_RATE_SUPPORT" f="pct" />
      {rHi && (
        <>
          , up to {riseNum(rHi, "pctSigned")} for {name(rHi.post)}
        </>
      )}
      .
    </>,
    ...(f6.rateExceptions.length > 0
      ? [
          <>
            The tagged {f6.rateExceptions.length === 1 ? "row rises" : "rows rise"} less:{" "}
            {joinList(
              f6.rateExceptions.map((p) => (
                <span key={p.post.id}>
                  {name(p.post)} {riseNum(p, "pctSigned")}
                </span>
              )),
            )}
            .
          </>,
        ]
      : []),
  ];

  // ----- head -----
  const exceptionGroups: ReactNode[] = [];
  if (f6.gapExceptions.length)
    exceptionGroups.push(
      <span key="gap">
        gap at H &gt; 4:{" "}
        {joinList(
          f6.gapExceptions.map((p) => (
            <span key={p.post.id}>
              {name(p.post)} <N m={p.post} k={HIH_KEY} f="signed" />
              {p.hiDelta !== null && <> ({deltaNum(p)} vs base)</>}
            </span>
          )),
          "; ",
        )}
        .
      </span>,
    );
  if (f6.rateExceptions.length)
    exceptionGroups.push(
      <span key="rate">
        Rate:{" "}
        {joinList(
          f6.rateExceptions.map((p) => (
            <span key={p.post.id}>
              {name(p.post)} {riseNum(p, "pctSigned")}
            </span>
          )),
          "; ",
        )}
        .
      </span>,
    );
  if (f6.baseHiExceptions.length)
    exceptionGroups.push(
      <span key="base">
        Base outlier{f6.baseHiExceptions.length > 1 ? "s" : ""}:{" "}
        {joinList(
          f6.baseHiExceptions.map((x) => (
            <span key={x.model.id}>
              {name(x.model)} <N m={x.model} k={HIH_KEY} f="signed" />
            </span>
          )),
          "; ",
        )}
        .
      </span>,
    );
  // one item: the groups are sentences, not a ';'-joined list
  const exceptions: ReactNode[] = exceptionGroups.length ? [joinList(exceptionGroups, " ")] : [];

  return {
    headline: (
      <>
        Post-training thickens the tail of mistakes: tokens the model rated near-impossible become {rateRange} more common, and where the model is uncertain it is{" "}
        {gapRange} more over-confident.
      </>
    ),
    standfirst: (
      <>
        Near-impossible is a surprisal above 10 nats; uncertain is an entropy above 4 nats, where bases sit at zero (median {medianNum}). The ranges cover the {nRate} of{" "}
        {nPairs} pairs whose s &gt; 10 rate rises by at least <Def name="F6_RATE_SUPPORT" f="pct" /> and the {nGap} pairs whose gap at H &gt; 4 falls by more than{" "}
        <Def name="F6_GAP_SUPPORT" f="nats" />.
      </>
    ),
    exceptions,
    aside: (
      <Aside title="How this is checked">
        <p>
          Each post-trained rung is paired with the nearest preceding rung of its family that is not post-trained (<code>basePairFor</code>).
        </p>
        <p>
          A pair supports the rate claim when its s &gt; 10 rate rises by at least <Def name="F6_RATE_SUPPORT" f="pct" />, and the gap claim when its gap at H &gt; 4 falls by more than{" "}
          <Def name="F6_GAP_SUPPORT" f="nats" />. Bases count as ≈ 0 within ±<Def name="BASE_HIH_ZERO" f="num2" /> nats.
        </p>
        <p>Each claim needs at least half of the {nPairs} pairs.</p>
      </Aside>
    ),
    detail: (
      <p>
        A surprisal above 10 nats is a probability below 1 in <Num path="exp(10)" value={Math.exp(10)} fmt="eff" derived="1 / p at s = 10 nats, e^10" />. On post-cutoff text these are real
        tokens the model treated as near-impossible, and their share rises in {nRate} of {nPairs} base → post-trained pairs.
      </p>
    ),
    plates: {
      "tail-hiH-arrows": () => (
        <FindingPlate
          label="Plate F6a · Gap where the model is uncertain, base → post-trained"
          caption={
            <>
              One row per base → post-trained pair, largest fall first; hollow = the paired base, filled = the post-trained rung, Δ = post − base in nats. The band is where bases sit; base
              outliers are listed last with a single hollow glyph.
              {hiMissing.length > 0 && <> Not measured at H &gt; 4: {hiMissing.map((p) => name(p.post)).join(", ")}.</>}
            </>
          }
          sources={["models[*].tail.tf_fresh.gap_hiH", "findings.BASE_HIH_ZERO"]}
          data={hiData}
          legend={{ stages: hiStages, hollowNote: "hollow = the paired base" }}
          look={hiLook}
          numbers={numbersOf(hiReadoffs)}
        >
          <HiHArrows
            rows={hiRows}
            outliers={outliers}
            band={{ half: FINDING_DEFS.BASE_HIH_ZERO, path: "findings.BASE_HIH_ZERO", label: "bases ≈ 0, within ±", derived: "definition · findings.BASE_HIH_ZERO" }}
          />
        </FindingPlate>
      ),
      "tail-arrows": () => (
        <FindingPlate
          label="Plate F6b · Impossible tokens, base → post-trained"
          caption="One row per base → post-trained pair, largest rise first; hollow = the paired base, filled = the post-trained rung, Δ = the relative change of the s > 10 rate."
          sources={['models[*].tail.tf_fresh["s>10"]']}
          data={rateData}
          legend={{ stages: rateStages, hollowNote: "hollow = the paired base" }}
          look={rateLook}
          numbers={numbersOf(rateReadoffs)}
        >
          <PairedArrows rows={rateRows} metric={s10Metric} tags={rateTags} />
        </FindingPlate>
      ),
    },
    numbers: numbersOf([...rateReadoffs, ...hiReadoffs]),
    checks: f6.checks,
  };
}

export default function F6({ bundle, F, section }: SectionProps) {
  return <FindingSection {...section} n={6} view={useFindingView(bundle, F)} />;
}
