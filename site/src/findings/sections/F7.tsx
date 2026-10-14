/**
 * F7 · Tail reliability, exact prior, noise (bundle v6 blocks). Owner: F7 implementer (this file, the f7/ sub-components,
 * the `{#f7}` section of content/findings.md, its plate ids in slots.ts). Presents the predicates in src/findings.ts:
 * the headline is the two tail-ratio medians; the two side results are shown and asserted as negative / bounded
 * results; a plate whose check is pending renders a NullPlate with the check's note.
 */
import { Link } from "react-router-dom";
import { rowLabel, tipLines } from "../../charts/findings/common";
import { fmtMass } from "../../charts/TailPriorCharts";
import {
  Aside,
  FindingPlate,
  FindingSection,
  joinNodes,
  type FindingNumber,
} from "../../components/Finding";
import { Num } from "../../components/Num";
import { NullPlate, Plate, type DataTableSpec } from "../../components/Plate";
import { get, path } from "../../data/bundle";
import { ciBounds } from "../../data/ci";
import { STAGE_CODE, STAGE_NAME, stageOrder } from "../../data/derive";
import type { Bundle, Model } from "../../data/types";
import { F7_MIN, FINDING_DEFS, type Check } from "../../findings";
import { fmt, fmtNum, isNum, type Fmt } from "../../lib/numfmt";
import { Count, modelHref, N } from "../shared/prose";
import type { Findings, FindingView, SectionProps } from "../shared/types";
import { DotStrip } from "./f7/DotStrip";
import { massOf, PriorScatter, rateOf, unreliable } from "./f7/PriorScatter";

/** Tolerances the F7 checks use (FINDING_DEFS, printed as definitions). */
const TAIL_TOL = FINDING_DEFS.F7_TAIL_TOL;
const NOISE_TOL = FINDING_DEFS.F7_NOISE_TOL;
const RHO_MAX = FINDING_DEFS.F7_RHO_MAX;

const RATIO = "tailmass.ratio3";
const PRED = "tailmass.pred3";
const REAL = "tailmass.real3";
const NPOS = "tailmass.n";
const MASS = "prior.instr_mass";
const CTRL = "prior.ctrl_mass";
const START_H = "prior.start.H";
const RATE = "fingerprint.roll_instr_marker_rate";
const B64 = "ood.base64.gap";
const HEX = "ood.hexdump.gap";
const BASE_MED_PATH = "median(models[stage∈{pre-anneal,base}].tailmass.ratio3)";
const POST_MED_PATH = "median(models[stage=post-trained].tailmass.ratio3)";
const RHO_PATH =
  "spearman(log10(models[*].prior.instr_mass), models[*].fingerprint.roll_instr_marker_rate)";

const isBase = (m: Model) => m.stage === "pre-anneal" || m.stage === "base";
const isDistilled = (m: Model) =>
  /distill/i.test(m.label) || /distill/i.test(m.id);
const byStage = (a: Model, b: Model) =>
  stageOrder.indexOf(a.stage) - stageOrder.indexOf(b.stage);
const stageText = (m: Model) => `${STAGE_CODE[m.stage]} ${STAGE_NAME[m.stage]}`;
const uniq = (ms: (Model | null)[]) =>
  Array.from(
    new Map(ms.filter((m): m is Model => !!m).map((m) => [m.id, m])).values(),
  );

function pick(
  ms: Model[],
  f: (m: Model) => number | null,
  hi: boolean,
): Model | null {
  return ms.reduce<Model | null>((a, m) => {
    const v = f(m);
    if (!isNum(v)) return a;
    if (!a) return m;
    return (hi ? v > f(a)! : v < f(a)!) ? m : a;
  }, null);
}

const numOf = (m: Model, key: string, f: Fmt, what: string): FindingNumber => ({
  label: `${m.family} · ${m.label}, ${what}`,
  path: path(m, key),
  fmt: f,
  href: modelHref(m),
});
const nameOf = (m: Model) => `${m.family} ${m.label}`;
const state = (c: Check) => (
  <strong>{c.pending ? "pending" : c.ok ? "holds" : "fails"}</strong>
);
const Checkpoint = ({ m }: { m: Model }) => (
  <Link to={modelHref(m)}>
    {m.family} · {m.label}
  </Link>
);

function Missing({ ms, what }: { ms: Model[]; what: string }) {
  if (!ms.length) return null;
  return (
    <>
      {" "}
      Not measured for{" "}
      {ms.length === 1 ? (
        "one checkpoint"
      ) : (
        <>
          <Count n={ms.length} of={`checkpoints without ${what}`} /> checkpoints
        </>
      )}
      :{" "}
      {ms.map(nameOf).join(", ")}.
    </>
  );
}

function pendingPlate(label: string, checks: Check[]) {
  return (
    <Plate label={label}>
      <NullPlate>Pending: {checks.map((c) => c.note).join("; ")}.</NullPlate>
    </Plate>
  );
}

export function useFindingView(bundle: Bundle, F: Findings): FindingView {
  const f7 = F.f7;
  const pendings = (cs: Check[]) => cs.filter((c) => c.ok && c.pending);

  // ---- F7a tail reliability ----
  const tailPending = pendings([f7.checks.tailBases, f7.checks.tailPost]);
  const ratio = (m: Model) => get(m, RATIO);
  const tail = [...f7.withTail].sort(byStage);
  const tailMissing = bundle.models.filter((m) => !isNum(ratio(m)));
  const posts = tail.filter((m) => m.stage === "post-trained");
  const bases = tail.filter(isBase);
  const baseMed = f7.ratio3Median.bases;
  const postMed = f7.ratio3Median.posts;
  const postsRight = posts.filter((m) => ratio(m)! > 1 + TAIL_TOL);
  const postsInBand = posts.filter((m) => ratio(m)! <= 1 + TAIL_TOL);
  const basesOut = bases.filter((m) => Math.abs(ratio(m)! - 1) > TAIL_TOL);
  const maxPost = pick(posts, ratio, true);
  const minPost = pick(posts, ratio, false);
  const tailLabelled = uniq([maxPost, minPost, ...postsInBand, ...basesOut]);
  const tailTags = Object.fromEntries(
    basesOut.map((m) => [m.id, isDistilled(m) ? "distilled" : "base outlier"]),
  );
  const tailLabelOf = (m: Model) => rowLabel(m, tail, 26);
  // axis from the data (never a typed range): always holds the band around 1, with room for a label past the last glyph
  const ratioVals = tail.map(ratio).filter(isNum);
  const tailDomain: [number, number] = [Math.min(1 - TAIL_TOL - 0.1, ...ratioVals.map((v) => v - 0.05)), Math.max(1 + TAIL_TOL + 0.2, ...ratioVals.map((v) => v + 0.2))];
  const baseMedNum =
    tailPending.length || !isNum(baseMed) ? (
      "—"
    ) : (
      <Num
        path={BASE_MED_PATH}
        value={baseMed}
        fmt="num2"
        derived="median over pre-anneal and base checkpoints"
      />
    );
  const postMedNum =
    tailPending.length || !isNum(postMed) ? (
      "—"
    ) : (
      <Num
        path={POST_MED_PATH}
        value={postMed}
        fmt="num2"
        derived="median over post-trained checkpoints"
      />
    );
  const tailTolNum = (
    <Num
      path="findings.F7_TAIL_TOL"
      value={TAIL_TOL}
      fmt="pct"
      def
    />
  );
  const tailNumbers: FindingNumber[] = [
    {
      label: "pre-anneal and base checkpoints, median r₃ ÷ m₃",
      path: BASE_MED_PATH,
      value: baseMed,
      fmt: "num2",
      derived: "median over pre-anneal and base checkpoints",
    },
    {
      label: "post-trained checkpoints, median r₃ ÷ m₃",
      path: POST_MED_PATH,
      value: postMed,
      fmt: "num2",
      derived: "median over post-trained checkpoints",
    },
    ...tailLabelled.flatMap((m) => [
      numOf(m, RATIO, "num2", "r₃ ÷ m₃"),
      numOf(m, PRED, "mass", "predicted m₃"),
      numOf(m, REAL, "mass", "realised r₃"),
    ]),
    {
      label: "band half-width around 1",
      path: "findings.F7_TAIL_TOL",
      value: TAIL_TOL,
      fmt: "pct",
      def: true,
    },
  ];
  const tailData: DataTableSpec = {
    columns: [
      "checkpoint",
      "stage",
      "predicted m₃",
      "realised r₃",
      "r₃ ÷ m₃",
      "positions",
    ],
    numeric: [false, false, true, true, true, true],
    rows: [...tail]
      .sort((a, b) => byStage(a, b) || ratio(b)! - ratio(a)!)
      .map((m) => [
        <Checkpoint key={m.id} m={m} />,
        stageText(m),
        fmtMass(get(m, PRED)),
        fmtMass(get(m, REAL)),
        fmtNum(ratio(m), "num2"),
        fmtNum(get(m, NPOS), "count"),
      ]),
  };
  const tailLook = [
    <>
      The PRE and BASE rows sit on the 1 line: their median together is{" "}
      {baseMedNum}, inside the ±{tailTolNum} band.
    </>,
    <>
      <Count n={postsRight.length} of="post-trained checkpoints with ratio3 above 1 + F7_TAIL_TOL" /> of{" "}
      <Count n={posts.length} of="post-trained checkpoints with tailmass.ratio3" /> POST triangles sit right of the band
      (median {postMedNum}); the furthest is{" "}
      {maxPost ? (
        <>
          {nameOf(maxPost)} at <N m={maxPost} k={RATIO} f="num2" />
        </>
      ) : (
        "—"
      )}
      {postsInBand.length > 0 && (
        <>
          . Inside it:{" "}
          {joinNodes(
            postsInBand.map((m) => (
              <span key={m.id}>
                {nameOf(m)} <N m={m} k={RATIO} f="num2" />
              </span>
            )),
          )}
        </>
      )}
      .
    </>,
    basesOut.length ? (
      <>
        Outside the band among pre-anneal and base checkpoints:{" "}
        {joinNodes(
          basesOut.map((m) => (
            <span key={m.id}>
              {nameOf(m)} <N m={m} k={RATIO} f="num2" />
              {isDistilled(m)
                ? " (distilled: it was trained toward a teacher, not the data)"
                : " (tagged base outlier)"}
            </span>
          )),
        )}
        .
      </>
    ) : (
      <>No pre-anneal or base checkpoint falls outside the band.</>
    ),
  ];

  // ---- F7b exact prior vs marker rate ----
  const priorPending = pendings([f7.checks.priorAgrees]);
  // the opener set is read from the bundle, so the caption's count cannot drift from the probe
  const nInstrOpeners = Object.values(bundle.reference.prior_openers ?? {}).filter((o) => o?.set === "instr").length;
  const openersNum = nInstrOpeners ? (
    <Num path="count(reference.prior_openers[set=instr])" value={nInstrOpeners} fmt="count" derived="instruction openers in reference.prior_openers" />
  ) : (
    "the"
  );
  const priorModels = [...f7.withPrior]
    .filter((m) => isNum(rateOf(m)))
    .sort(byStage);
  const priorMissing = bundle.models.filter(
    (m) => !isNum(massOf(m)) || !isNum(rateOf(m)),
  );
  const flagged = priorModels.filter(unreliable);
  const topMass = pick(priorModels, massOf, true);
  const topRate = pick(priorModels, rateOf, true);
  // a post-trained checkpoint whose samples are instruction-shaped but whose exact mass is tiny: its chat template is not one token
  const hidden = pick(
    priorModels.filter(
      (m) =>
        m.stage === "post-trained" && (massOf(m) ?? 1) < 1e-4 && !unreliable(m),
    ),
    rateOf,
    true,
  );
  const priorLabelled = uniq([topMass, topRate, hidden]);
  const priorLabelOf = (m: Model) => rowLabel(m, priorModels, 26);
  const rhoNum = isNum(f7.rho) ? (
    <Num
      path={RHO_PATH}
      value={f7.rho}
      fmt="num2"
      derived="Spearman rank correlation over checkpoints with both measures"
    />
  ) : (
    "—"
  );
  const rhoMaxNum = (
    <Num
      path="findings.F7_RHO_MAX"
      value={RHO_MAX}
      fmt="num2"
      def
    />
  );
  const priorNumbers: FindingNumber[] = [
    {
      label: "checkpoints with both measures, Spearman ρ",
      path: RHO_PATH,
      value: f7.rho,
      fmt: "num2",
      derived: "Spearman rank correlation over checkpoints with both measures",
    },
    ...priorLabelled.flatMap((m) => [
      numOf(m, MASS, "mass", "exact instruction mass"),
      numOf(m, RATE, "pct", "marker rate"),
    ]),
    {
      label: "|ρ| bound for 'do not rank alike'",
      path: "findings.F7_RHO_MAX",
      value: RHO_MAX,
      fmt: "num2",
      def: true,
    },
  ];
  const priorData: DataTableSpec = {
    columns: [
      "checkpoint",
      "stage",
      "instruction mass",
      "control mass",
      "marker rate",
      "start entropy, nats",
      "flag",
    ],
    numeric: [false, false, true, true, true, true, false],
    rows: [...priorModels]
      .sort((a, b) => byStage(a, b) || (massOf(b) ?? 0) - (massOf(a) ?? 0))
      .map((m) => [
        <Checkpoint key={m.id} m={m} />,
        stageText(m),
        fmtMass(massOf(m)),
        fmtMass(get(m, CTRL)),
        fmtNum(rateOf(m), "pct"),
        fmtNum(get(m, START_H), "nats"),
        unreliable(m) ? "unreliable" : "",
      ]),
  };
  const priorLook = [
    <>
      Highest exact mass: {topMass ? nameOf(topMass) : "—"} at{" "}
      {topMass ? <N m={topMass} k={MASS} f="mass" /> : "—"},
      with a marker rate of {topMass ? <N m={topMass} k={RATE} f="pct" /> : "—"}
      .
    </>,
    <>
      Highest marker rate: {topRate ? nameOf(topRate) : "—"} at{" "}
      {topRate ? <N m={topRate} k={RATE} f="pct" /> : "—"}, whose exact mass is{" "}
      {topRate ? <N m={topRate} k={MASS} f="mass" /> : "—"}.
    </>,
    ...(hidden
      ? [
          <>
            {nameOf(hidden)} samples chat markers{" "}
            <N m={hidden} k={RATE} f="pct" /> of the time but reads one document
            start in{" "}
            <Num
              path={`1 / ${path(hidden, MASS)}`}
              value={1 / massOf(hidden)!}
              fmt="count"
              derived="reciprocal of the exact instruction mass"
            />{" "}
            here: its chat template is not one token, so the probe never sees
            it.
          </>,
        ]
      : []),
    <>
      Spearman ρ = {rhoNum} over <Count n={priorModels.length} of="checkpoints with both prior.instr_mass and roll_instr_marker_rate" /> checkpoints; the check
      asserts |ρ| &lt; {rhoMaxNum}.
    </>,
  ];

  // ---- F7c over-confidence on noise ----
  const noisePending = pendings([f7.checks.noise]);
  const gapOf = (m: Model) => get(m, B64);
  const ood = [...f7.withOod].sort(byStage);
  const oodMissing = bundle.models.filter((m) => !isNum(gapOf(m)));
  const oodPosts = ood.filter((m) => m.stage === "post-trained");
  const oodBases = ood.filter(isBase);
  const postsBelow = oodPosts.filter((m) => gapOf(m)! < -NOISE_TOL);
  const lowestPost = pick(oodPosts, gapOf, false);
  const distilledFlagged = oodBases.filter(
    (m) => isDistilled(m) && gapOf(m)! < -NOISE_TOL,
  );
  const cleanBases = oodBases.filter((m) => !isDistilled(m));
  const worstClean = pick(cleanBases, gapOf, false);
  const underConfident = oodBases.filter((m) => gapOf(m)! > NOISE_TOL);
  const oodLabelled = uniq([
    lowestPost,
    ...distilledFlagged,
    worstClean,
    ...underConfident,
  ]);
  const oodTags: Record<string, string> = {
    ...Object.fromEntries(underConfident.map((m) => [m.id, "under-confident"])),
    ...Object.fromEntries(
      oodBases.filter(isDistilled).map((m) => [m.id, "distilled"]),
    ),
  };
  const oodLabelOf = (m: Model) => rowLabel(m, ood, 26);
  const noiseTolNum = (
    <Num
      path="findings.F7_NOISE_TOL"
      value={NOISE_TOL}
      fmt="nats1"
      def
    />
  );
  const oodNumbers: FindingNumber[] = [
    ...oodLabelled.map((m) => numOf(m, B64, "gap", "gap on random base64")),
    {
      label: "over-confidence bound on noise",
      path: "findings.F7_NOISE_TOL",
      value: NOISE_TOL,
      fmt: "nats1",
      def: true,
    },
  ];
  const oodData: DataTableSpec = {
    columns: [
      "checkpoint",
      "stage",
      "gap on base64, nats",
      "gap on hex dump, nats",
    ],
    numeric: [false, false, true, true],
    rows: [...ood]
      .sort((a, b) => byStage(a, b) || gapOf(a)! - gapOf(b)!)
      .map((m) => [
        <Checkpoint key={m.id} m={m} />,
        stageText(m),
        fmtNum(gapOf(m), "gap"),
        fmtNum(get(m, HEX), "gap"),
      ]),
  };
  const oodLook = [
    <>
      <Count n={postsBelow.length} of="post-trained checkpoints with ood.base64.gap below −F7_NOISE_TOL" /> of{" "}
      <Count n={oodPosts.length} of="post-trained checkpoints with ood.base64.gap" /> POST triangles are more than{" "}
      {noiseTolNum} over-confident on noise; the lowest is{" "}
      {lowestPost ? (
        <>
          {nameOf(lowestPost)} at <N m={lowestPost} k={B64} f="gap" />
        </>
      ) : (
        "—"
      )}
      .
    </>,
    <>
      The lowest non-distilled pre-anneal or base checkpoint is{" "}
      {worstClean ? nameOf(worstClean) : "—"} at{" "}
      {worstClean ? <N m={worstClean} k={B64} f="gap" /> : "—"},{" "}
      {worstClean && gapOf(worstClean)! < -NOISE_TOL ? "outside" : "inside"} the
      band.
    </>,
    ...(distilledFlagged.length
      ? [
          <>
            {joinNodes(
              distilledFlagged.map((m) => (
                <span key={m.id}>
                  {nameOf(m)} at <N m={m} k={B64} f="gap" />
                </span>
              )),
            )}{" "}
            {distilledFlagged.length === 1
              ? "is the one square"
              : "are the squares"}{" "}
            beyond the band on the over-confident side: distilled, flagged as
            expected.
          </>,
        ]
      : []),
    ...(underConfident.length
      ? [
          <>
            {joinNodes(
              underConfident.map((m) => (
                <span key={m.id}>
                  {nameOf(m)} at <N m={m} k={B64} f="gap" />
                </span>
              )),
            )}{" "}
            {underConfident.length === 1 ? "is" : "are"} under-confident on
            noise, which the check does not bound.
          </>,
        ]
      : []),
  ];

  // ---- head ----
  const exceptions = [
    ...distilledFlagged.map((m) => (
      <span key={"d" + m.id}>
        distilled base flagged as expected on noise: {nameOf(m)}{" "}
        <N m={m} k={B64} f="gap" /> on base64
      </span>
    )),
    ...(flagged.length
      ? [
          <span key="unrel">
            start-token prior flagged unreliable (hollow on Plate F7b):{" "}
            {flagged.map(nameOf).join(", ")}
          </span>,
        ]
      : []),
  ];

  return {
    headline: (
      <>
        Bases predict their own tail: realised ÷ predicted tail mass at p &lt;
        10⁻³ has median {baseMedNum} across pre-anneal and base checkpoints and{" "}
        {postMedNum} after post-training.
      </>
    ),
    standfirst: (
      <>
        Two more results, shown and not scored: the exact instruction mass on
        chat openers does not rank checkpoints the way the sampled marker rate
        does, because they measure different things; and no non-distilled base
        is over-confident on random base64 by more than {noiseTolNum}
        {distilledFlagged.length
          ? `, while the distilled base${distilledFlagged.length > 1 ? "s are" : " is"}.`
          : "."}
      </>
    ),
    exceptions,
    aside: (
      <Aside title="How this is checked">
        <p>
          Each group needs at least{" "}
          <Num path="findings.F7_MIN" value={F7_MIN} fmt="count" def />{" "}
          checkpoints; below that a claim is pending, not stated.
        </p>
        <p>
          Tail: the median r₃ ÷ m₃ over pre-anneal and base checkpoints within{" "}
          {tailTolNum} of 1 — {state(f7.checks.tailBases)}; the post-trained
          median above it — {state(f7.checks.tailPost)}.
        </p>
        <p>
          Prior: |Spearman ρ| between log instruction mass and marker rate below{" "}
          {rhoMaxNum} (ρ = {rhoNum}) — {state(f7.checks.priorAgrees)}. The
          negative result is what is asserted.
        </p>
        <p>
          Noise: no non-distilled pre-anneal or base checkpoint below −
          {noiseTolNum} on base64 — {state(f7.checks.noise)}.
        </p>
      </Aside>
    ),
    plates: {
      "tail-reliability": () =>
        tailPending.length ? (
          pendingPlate(
            "Plate F7a · Tail reliability at p < 10⁻³, by stage",
            tailPending,
          )
        ) : (
          <FindingPlate
            label="Plate F7a · Tail reliability at p < 10⁻³, by stage"
            caption={
              <>
                Each glyph is one checkpoint on the same post-cutoff subset
                (its positions are in the Data table); the tick under each row is that stage's median.
                Linear axis. The band is the check's tolerance around 1, where
                the realised rate equals the predicted mass. Hover or focus a
                glyph for its predicted mass, realised rate and positions.
                <Missing ms={tailMissing} what="tailmass.ratio3" />
              </>
            }
            sources={[
              "models[*].tailmass.ratio3",
              "models[*].tailmass.pred3",
              "models[*].tailmass.real3",
              "models[*].tailmass.n",
            ]}
            data={tailData}
            legend
            look={tailLook}
            numbers={tailNumbers}
          >
            <DotStrip
              models={tail}
              value={ratio}
              valuePath={(m) => path(m, RATIO)}
              fmtKind="num2"
              axisTitle="realised rate ÷ predicted tail mass at p < 10⁻³, post-cutoff text (linear)"
              domain={tailDomain}
              reference={{ value: 1, label: "tail as predicted" }}
              band={{
                lo: 1 - TAIL_TOL,
                hi: 1 + TAIL_TOL,
                label: "±",
                num: {
                  path: "findings.F7_TAIL_TOL",
                  value: TAIL_TOL,
                  fmt: "pct",
                },
              }}
              median
              labelIds={tailLabelled.map((m) => m.id)}
              tags={tailTags}
              labelOf={tailLabelOf}
              ci={(m) => ciBounds(m, "tail_ratio3")}
              tipLines={(m) => [
                ...tipLines(m, "ratio", ratio(m), "num2", "tail_ratio3"),
                `predicted ${fmtMass(get(m, PRED))}, realised ${fmtMass(get(m, REAL))}, ${fmtNum(get(m, NPOS), "count")} positions`,
              ]}
              ariaLabel={
                `Realised over predicted tail mass at p < 10⁻³, by stage: ` +
                stageOrder
                  .filter((s) => tail.some((m) => m.stage === s))
                  .map(
                    (s) =>
                      `${s}: ${tail
                        .filter((m) => m.stage === s)
                        .map((m) => `${m.label} ${fmtNum(ratio(m), "num2")}`)
                        .join(", ")}`,
                  )
                  .join("; ")
              }
            />
          </FindingPlate>
        ),
      "prior-exact": () =>
        priorPending.length ? (
          pendingPlate(
            "Plate F7b · Exact instruction mass against the sampled marker rate",
            priorPending,
          )
        ) : (
          <FindingPlate
            label="Plate F7b · Exact instruction mass against the sampled marker rate"
            caption={
              <>
                No fitted line: the two do not rank checkpoints alike. The exact
                mass is the probability that a document starts with one of {openersNum}{" "}
                chat openers, summed in one teacher-forced pass: a measure for
                bases (instruction data in the pretraining mix). A post-trained
                checkpoint whose chat template splits into several tokens reads
                near zero here; its start entropy carries that signal instead (
                <Link to="/methodology#prior-exact">how the probe works</Link>).
                Whiskers are the marker rate's 95% interval.
                {flagged.length > 0 && (
                  <>
                    {" "}
                    Hollow = flagged unreliable (no start token):{" "}
                    {flagged.map(nameOf).join(", ")}.
                  </>
                )}
                <Missing ms={priorMissing} what="prior.instr_mass or roll_instr_marker_rate" />
              </>
            }
            sources={[
              "models[*].prior.instr_mass",
              "models[*].fingerprint.roll_instr_marker_rate",
              "models[*].prior.unreliable",
              "models[*].ci.prior_marker",
            ]}
            data={priorData}
            legend={{ hollowNote: "flagged unreliable" }}
            look={priorLook}
            numbers={priorNumbers}
          >
            <PriorScatter
              models={priorModels}
              labelIds={priorLabelled.map((m) => m.id)}
              labelOf={priorLabelOf}
            />
          </FindingPlate>
        ),
      "ood-noise": () =>
        noisePending.length ? (
          pendingPlate(
            "Plate F7c · Over-confidence on random base64, by stage",
            noisePending,
          )
        ) : (
          <FindingPlate
            label="Plate F7c · Over-confidence on random base64, by stage"
            caption={
              <>
                Calibration gap, mean(H − s), teacher-forced on random base64,
                where the only right answer is near-uniform over the admissible
                symbols: a negative gap is over-confidence with no excuse (
                <Link to="/methodology#ood">
                  the out-of-distribution corpus
                </Link>
                ). Linear axis clamped to {fmt(-1, "signed")} …{" "}
                {fmt(0.2, "signed")}; values beyond it are pinned to the end and
                annotated. The band is the check's bound either side of zero.
                <Missing ms={oodMissing} what="ood.base64.gap" />
              </>
            }
            sources={["models[*].ood.base64.gap", "models[*].ood.hexdump.gap"]}
            data={oodData}
            legend
            look={oodLook}
            numbers={oodNumbers}
          >
            <DotStrip
              models={ood}
              value={gapOf}
              valuePath={(m) => path(m, B64)}
              fmtKind="gap"
              axisTitle="calibration gap on random base64, mean(H − s), nats (linear, clamped)"
              domain={[-1, 0.2]}
              ticks={[-1, -0.8, -0.6, -0.4, -0.2, 0, 0.2]}
              reference={{ value: 0, label: "calibrated" }}
              band={{
                lo: -NOISE_TOL,
                hi: NOISE_TOL,
                label: "±",
                num: {
                  path: "findings.F7_NOISE_TOL",
                  value: NOISE_TOL,
                  fmt: "nats1",
                },
              }}
              median
              labelIds={oodLabelled.map((m) => m.id)}
              tags={oodTags}
              labelOf={oodLabelOf}
              tipLines={(m) => [
                ...tipLines(m, "gap on base64", gapOf(m), "gap"),
                `gap on hex dump ${fmt(get(m, HEX), "gap")}`,
              ]}
              ariaLabel={
                `Calibration gap on random base64, by stage: ` +
                stageOrder
                  .filter((s) => ood.some((m) => m.stage === s))
                  .map(
                    (s) =>
                      `${s}: ${ood
                        .filter((m) => m.stage === s)
                        .map((m) => `${m.label} ${fmt(gapOf(m), "gap")}`)
                        .join(", ")}`,
                  )
                  .join("; ")
              }
            />
          </FindingPlate>
        ),
    },
    numbers: [...tailNumbers, ...priorNumbers, ...oodNumbers],
    checks: f7.checks,
  };
}

export default function F7({ bundle, F, section }: SectionProps) {
  return <FindingSection {...section} n={7} view={useFindingView(bundle, F)} />;
}
