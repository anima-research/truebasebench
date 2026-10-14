/** F2 · Annealed is not one thing. Owner: F2 implementer (this file, src/findings/sections/f2/, the `{#f2}` section of content/findings.md, its plate ids in slots.ts). */
import { Link } from "react-router-dom";
import { Aside, FindingPlate, FindingSection, type FindingNumber } from "../../components/Finding";
import { GlyphShape } from "../../components/Glyph";
import { Num } from "../../components/Num";
import { fp, path } from "../../data/bundle";
import { ciBounds } from "../../data/ci";
import { ladder, STAGE_CODE } from "../../data/derive";
import { RAMPS, RUN_MIN_LEN, SUB_META } from "../../data/method";
import { SUB_KEYS, type Bundle, type Model, type Stage } from "../../data/types";
import { FINDING_DEFS } from "../../findings";
import { fmtNum, isNum, type Fmt } from "../../lib/numfmt";
import { Def, modelHref, N, numbersOf, type ReadOff } from "../shared/prose";
import type { Findings, FindingView, SectionProps } from "../shared/types";
import { AnnealMoves, type MoveFamily, type MoveFeature } from "./f2/AnnealMoves";
import { ProfileLines } from "./f2/ProfileLines";
import "./f2/f2.css";

/** The Wikipedia verbatim-share field a model carries (X_runfrac_wiki, else the older verbatim_run_frac_wiki). */
export const memoKey = (m: Model) => (isNum(fp(m, "X_runfrac_wiki")) ? "fingerprint.X_runfrac_wiki" : "fingerprint.verbatim_run_frac_wiki");
const wiki = (m: Model) => fp(m, "X_runfrac_wiki") ?? fp(m, "verbatim_run_frac_wiki");
const marker = (m: Model) => fp(m, "roll_instr_marker_rate");
const MARKER = "fingerprint.roll_instr_marker_rate";

const memoFeature: MoveFeature = {
  key: "memo",
  name: "Wikipedia verbatim share",
  short: "Wikipedia verbatim share",
  value: wiki,
  pathOf: (m) => path(m, memoKey(m)),
  ciKey: "memo_wiki",
  fmtKind: "pct",
  ramp: RAMPS.memo,
  axis: "share of Wikipedia tokens inside verbatim runs (X_runfrac_wiki)",
};
const priorFeature: MoveFeature = {
  key: "prior",
  name: "instruction-marker rate",
  short: "marker rate",
  value: marker,
  pathOf: (m) => path(m, MARKER),
  ciKey: "prior_marker",
  fmtKind: "pct",
  ramp: RAMPS.prior,
  axis: "share of bare-BOS samples with a chat marker (roll_instr_marker_rate)",
};

const ci = (m: Model, key: string, f: Fmt) => {
  const b = ciBounds(m, key);
  return b ? `[${fmtNum(b[0], f)}, ${fmtNum(b[1], f)}]` : "—";
};
const sub = (m: Model, k: (typeof SUB_KEYS)[number]) => m.subscores?.[k]?.score ?? null;
const checkpoint = (m: Model) => (
  <span className="stage-tag">
    <svg width="12" height="12" viewBox="-6 -6 12 12" aria-hidden="true">
      <GlyphShape stage={m.stage} size={8} />
    </svg>{" "}
    <Link to={modelHref(m)}>
      {m.family} · {m.label}
    </Link>
  </span>
);

/** A family's rows for the grid: every pre-anneal rung, the annealed rungs after `origin`, then the next post-trained rung. */
function familyRows(bundle: Bundle, origin: Model, annealed: Model[]): MoveFamily {
  const rungs = ladder(bundle, origin.family);
  const pres = rungs.filter((r) => r.stage === "pre-anneal");
  const lastOrder = annealed.length ? Math.max(...annealed.map((r) => r.order)) : origin.order;
  const post = rungs.find((r) => r.stage === "post-trained" && r.order > lastOrder);
  return { family: origin.family, rows: [...pres, ...annealed, ...(post ? [post] : [])], origin };
}

export function useFindingView(bundle: Bundle, F: Findings): FindingView {
  const f2 = F.f2;
  const memo = f2.memo && f2.memo.length >= 2 ? f2.memo : null;
  const memoFam = memo?.[0].family ?? null;
  const priorFam = f2.priorFamily;
  const minAnneal = f2.priorAnneal.reduce<Model | null>((a, m) => (!a || (marker(m) ?? 9) < (marker(a) ?? 9) ? m : a), null);
  const maxAnneal = f2.priorAnneal.reduce<Model | null>((a, m) => (!a || (marker(m) ?? -9) > (marker(a) ?? -9) ? m : a), null);
  const profileFams = [memoFam, priorFam].filter((f, i, a): f is string => !!f && a.indexOf(f) === i);

  // ---- grid rows ----
  const families: MoveFamily[] = [];
  if (memo) {
    const rungs = ladder(bundle, memo[0].family);
    const post = memo[2] ?? null;
    const annealed = rungs.filter((r) => r.order > memo[0].order && (r.stage === "anneal" || r.stage === "base") && (!post || r.order < post.order));
    families.push(familyRows(bundle, memo[0], annealed));
  }
  if (f2.priorPre && priorFam && priorFam !== memoFam) families.push(familyRows(bundle, f2.priorPre, f2.priorAnneal));
  const memoIdx = memo ? 0 : -1;
  const priorIdx = families.findIndex((f) => f.family === priorFam);

  // ---- exception tags (only when a check fails; the arithmetic mirrors findings.ts to find the offending cell) ----
  const tags: Record<string, string> = {};
  if (!f2.checks.memo.ok && memoIdx >= 0) tags[`${memoIdx}:memo`] = "exception";
  if (!f2.checks.prior.ok && priorIdx >= 0) tags[`${priorIdx}:prior`] = "exception";
  if (!f2.checks.different.ok) {
    const memoPriorShift = memo ? Math.abs((marker(memo[1]) ?? 0) - (marker(memo[0]) ?? 0)) : 0;
    const priorMemoShift = f2.priorPre ? Math.max(0, ...f2.priorAnneal.map((r) => Math.abs((wiki(r) ?? 0) - (wiki(f2.priorPre!) ?? 0)))) : 0;
    if (memoIdx >= 0 && memoPriorShift >= FINDING_DEFS.F2_MEMO_PRIOR_STILL) tags[`${memoIdx}:prior`] = "exception";
    if (priorIdx >= 0 && priorMemoShift >= FINDING_DEFS.F2_PRIOR_MEMO_STILL) tags[`${priorIdx}:memo`] = "exception";
    if (!Object.keys(tags).some((k) => k.endsWith(":prior") || k.endsWith(":memo"))) {
      if (memoIdx >= 0) tags[`${memoIdx}:prior`] = "exception";
      if (priorIdx >= 0) tags[`${priorIdx}:memo`] = "exception";
    }
  }

  // ---- numbers ----
  const gridModels = families.flatMap((f) => f.rows);
  const stages = Array.from(new Set(gridModels.map((m) => m.stage))) as Stage[];
  const gridNumbers: FindingNumber[] = [
    ...numbersOf(gridModels.flatMap((m) => [
      { model: m, key: memoKey(m), fmt: "pct" as Fmt, what: "Wikipedia verbatim share" },
      { model: m, key: MARKER, fmt: "pct" as Fmt, what: "marker rate" },
    ])),
    { label: "memo ramp · score 1 at or below", path: "method.RAMPS.memo[0]", value: RAMPS.memo[0], fmt: "pct", def: true },
    { label: "memo ramp · score 0 at or above", path: "method.RAMPS.memo[1]", value: RAMPS.memo[1], fmt: "pct", def: true },
    { label: "prior ramp · score 1 at or below", path: "method.RAMPS.prior[0]", value: RAMPS.prior[0], fmt: "pct", def: true },
    { label: "prior ramp · score 0 at or above", path: "method.RAMPS.prior[1]", value: RAMPS.prior[1], fmt: "pct", def: true },
  ];
  const readoffs: ReadOff[] = [
    ...(memo ?? []).slice(0, 2).map((m) => ({ model: m, key: memoKey(m), fmt: "pct" as Fmt, what: "Wikipedia verbatim share" })),
    ...(f2.priorPre ? [f2.priorPre, ...f2.priorAnneal] : []).map((m) => ({ model: m, key: MARKER, fmt: "pct" as Fmt, what: "marker rate" })),
  ];

  // ---- the two released bases, for 'same overall, different reasons' ----
  const baseOf = (fam: string | null) => (fam ? ladder(bundle, fam).find((r) => r.stage === "base") ?? null : null);
  const memoBase = baseOf(memoFam);
  const priorBase = baseOf(priorFam);
  const priorWikiMax = f2.priorAnneal.reduce<Model | null>((a, m) => (!a || (wiki(m) ?? -1) > (wiki(a) ?? -1) ? m : a), null);
  const rates = f2.priorAnneal.map(marker);
  const monotone = rates.every((r, i) => i === 0 || !isNum(r) || !isNum(rates[i - 1]) || r >= rates[i - 1]!);
  const annealedScores = (fam: string | null) => (fam ? ladder(bundle, fam).filter((r) => r.stage === "anneal" || r.stage === "base") : []);
  const lowest = (ms: Model[], k: (typeof SUB_KEYS)[number]) => ms.reduce<Model | null>((a, m) => (!a || (sub(m, k) ?? 9) < (sub(a, k) ?? 9) ? m : a), null);
  const memoFamLowMemo = lowest(annealedScores(memoFam), "memo");
  const priorFamLowPrior = lowest(annealedScores(priorFam), "prior");
  const priorFamHighPrior = annealedScores(priorFam).reduce<Model | null>((a, m) => (!a || (sub(m, "prior") ?? -9) > (sub(a, "prior") ?? -9) ? m : a), null);

  // ---- comb table (Plate F2b data): both families in ladder order, then every other annealed or released base by overall ----
  const famModels = profileFams.flatMap((f) => ladder(bundle, f));
  const others = bundle.models.filter((m) => (m.stage === "anneal" || m.stage === "base") && !famModels.includes(m)).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const combRow = (m: Model) => [
    checkpoint(m),
    STAGE_CODE[m.stage],
    ...SUB_KEYS.map((k) => {
      const v = sub(m, k);
      return (
        <span className="f2-comb" key={k}>
          <svg width={48} height={8} aria-hidden="true">
            <rect width={48} height={8} fill={isNum(v) ? "var(--track)" : "url(#hatch)"} />
            {isNum(v) && <rect width={48 * v} height={8} fill="var(--bar)" />}
          </svg>
          <span>{fmtNum(v, "score")}</span>
        </span>
      );
    }),
    fmtNum(m.score, "score"),
  ];

  return {
    headline: (
      <>
        “Annealed” is not one thing
        {memoFam || priorFam ? ":" : "."}{" "}
        {memoFam && <>{memoFam}’s anneal memorised its up-weighted sources</>}
        {memoFam && priorFam && ", "}
        {priorFam && <>{priorFam}’s put instruction data into the prior</>}
        {(memoFam || priorFam) && "."}
      </>
    ),
    standfirst:
      memo || (f2.priorPre && minAnneal && maxAnneal) ? (
        <>
          {memo && (
            <>
              Wikipedia verbatim share <N m={memo[0]} k={memoKey(memo[0])} f="pct" /> → <N m={memo[1]} k={memoKey(memo[1])} f="pct" /> from {memo[0].label} to{" "}
              {memo[1].label}
            </>
          )}
          {memo && f2.priorPre && minAnneal && maxAnneal && "; "}
          {f2.priorPre && minAnneal && maxAnneal && (
            <>
              instruction-marker rate <N m={f2.priorPre} k={MARKER} f="pct" /> → <N m={minAnneal} k={MARKER} f="pct" />–<N m={maxAnneal} k={MARKER} f="pct" /> across{" "}
              {priorFam}’s annealed rungs
            </>
          )}
          , while each family’s other feature barely moved.
        </>
      ) : undefined,
    aside: (
      <Aside title="How this is checked">
        <p>
          The memo family’s anneal must raise the Wikipedia verbatim share by more than <Def name="F2_MEMO_RISE" f="pct" />, and the prior family’s anneal must raise
          the marker rate by more than <Def name="F2_PRIOR_RISE" f="pct" /> on every annealed rung.
        </p>
        <p>
          Each anneal must also leave the other feature nearly still: the memo family’s marker rate within <Def name="F2_MEMO_PRIOR_STILL" f="pct" />, the prior
          family’s Wikipedia share within <Def name="F2_PRIOR_MEMO_STILL" f="pct" />. A failed check prints a Data note under the standfirst and tags the cell in the
          figure.
        </p>
      </Aside>
    ),
    detail: (
      <>
        <p>
          The two features read different things. The memo feature is the share of Wikipedia tokens that fall inside verbatim runs: at least{" "}
          <Num path="method.RUN_MIN_LEN" value={RUN_MIN_LEN} fmt="count" def /> consecutive tokens that the model predicts confidently and correctly (
          <Link to="/methodology#verbatim-runs">verbatim runs</Link>). The prior feature is the share of samples written from a bare BOS token that contain a chat or
          instruction marker (<Link to="/methodology#prior">the instruction-shaped prior</Link>). One anneal moved the first and not the second; the other did the
          opposite.
        </p>
        <p>
          A single “base-ness” number would hide this. The two released bases score{" "}
          {memoBase ? (
            <>
              <N m={memoBase} k="score" f="score" /> ({memoBase.family})
            </>
          ) : (
            "—"
          )}{" "}
          and{" "}
          {priorBase ? (
            <>
              <N m={priorBase} k="score" f="score" /> ({priorBase.family})
            </>
          ) : (
            "—"
          )}{" "}
          overall, yet they got there on different axes: the first lost its memo score (
          {memoBase ? <N m={memoBase} k="subscores.memo.score" f="score" /> : "—"}) and kept its prior (
          {memoBase ? <N m={memoBase} k="subscores.prior.score" f="score" /> : "—"}); the second kept its memo score (
          {priorBase ? <N m={priorBase} k="subscores.memo.score" f="score" /> : "—"}) and lost its prior (
          {priorBase ? <N m={priorBase} k="subscores.prior.score" f="score" /> : "—"}). The score page calls this{" "}
          <Link to="/methodology#score">same overall, different reasons</Link>.
        </p>
      </>
    ),
    plates: {
      "anneal-moves": () =>
        families.length ? (
          <FindingPlate
            label="Plate F2 · Two anneals, two axes"
            caption={
              <>
                One linear axis per cell, shared down each column. Filled glyphs are measured rungs; arrows run from the claim’s pre-anneal rung to each annealed rung,
                with the value at the tip and its 95% interval as a whisker. The hollow glyph on a dashed line is the family’s next post-trained rung, for scale. The
                dashed ticks are the feature’s ramp anchors; shaded zones score 1 (left) or 0 (right).
              </>
            }
            sources={[
              `models[family∈{${profileFams.join(", ")}}].fingerprint.X_runfrac_wiki (fallback verbatim_run_frac_wiki)`,
              `models[family∈{${profileFams.join(", ")}}].fingerprint.roll_instr_marker_rate`,
              "models[*].ci.memo_wiki.ci95 · models[*].ci.prior_marker.ci95",
              "method.RAMPS.memo · method.RAMPS.prior",
            ]}
            data={{
              columns: ["checkpoint", "stage", "Wikipedia verbatim share", "95% CI", "marker rate", "95% CI", "memo score", "prior score"],
              numeric: [false, false, true, true, true, true, true, true],
              rows: gridModels.map((m) => [
                checkpoint(m),
                STAGE_CODE[m.stage],
                fmtNum(wiki(m), "pct"),
                ci(m, "memo_wiki", "pct"),
                fmtNum(marker(m), "pct"),
                ci(m, "prior_marker", "pct"),
                fmtNum(sub(m, "memo"), "score"),
                fmtNum(sub(m, "prior"), "score"),
              ]),
            }}
            legend={{ stages, hollowNote: "next post-trained rung, for scale (not part of the claim)" }}
            look={[
              <>
                The two diagonal cells move.{" "}
                {memo && (
                  <>
                    {memoFam}’s Wikipedia share goes <N m={memo[0]} k={memoKey(memo[0])} f="pct" /> → <N m={memo[1]} k={memoKey(memo[1])} f="pct" />, across the memo
                    ramp (score 1 at or below <Num path="method.RAMPS.memo[0]" value={RAMPS.memo[0]} fmt="pct" def />, 0 at or above{" "}
                    <Num path="method.RAMPS.memo[1]" value={RAMPS.memo[1]} fmt="pct" def />).
                  </>
                )}{" "}
                {f2.priorPre && minAnneal && maxAnneal && (
                  <>
                    {priorFam}’s marker rate goes <N m={f2.priorPre} k={MARKER} f="pct" /> → <N m={minAnneal} k={MARKER} f="pct" />–<N m={maxAnneal} k={MARKER} f="pct" />
                    , up the prior ramp (score 0 at or above <Num path="method.RAMPS.prior[1]" value={RAMPS.prior[1]} fmt="pct" def />).
                  </>
                )}
              </>,
              <>
                The two off-diagonal cells do not.{" "}
                {memo && (
                  <>
                    {memoFam}’s marker rate is <N m={memo[0]} k={MARKER} f="pct" /> before and <N m={memo[1]} k={MARKER} f="pct" /> after;
                  </>
                )}{" "}
                {priorWikiMax && (
                  <>
                    {priorFam}’s Wikipedia share never exceeds <N m={priorWikiMax} k={memoKey(priorWikiMax)} f="pct" /> ({priorWikiMax.label}).
                  </>
                )}
              </>,
              ...(f2.priorAnneal.length > 1 && !monotone
                ? [
                    <>
                      {priorFam}’s annealed rungs are not in order:{" "}
                      {f2.priorAnneal.map((m, i) => (
                        <span key={m.id}>
                          {i > 0 && ", "}
                          {m.label} <N m={m} k={MARKER} f="pct" />
                        </span>
                      ))}
                      . The standfirst prints the lowest and highest; the marker rate is read from <N m={f2.priorAnneal[0]} k="ci.prior_marker.n" f="count" /> samples,
                      so its whisker is wide.
                    </>,
                  ]
                : []),
            ]}
            numbers={gridNumbers}
          >
            <AnnealMoves families={families} features={[memoFeature, priorFeature]} tags={tags} />
          </FindingPlate>
        ) : null,
      "anneal-profiles": () =>
        profileFams.length ? (
          <FindingPlate
            label={`Plate F2b · Sub-score profiles, ${profileFams.join(" and ")}`}
            className="f2-profiles"
            caption="Calib solid, spread dashed, memo dotted, prior dash-dot; each line is labelled at its right end, rungs in ladder order. The table holds every rung of both families, then every other annealed or released base by overall score."
            sources={["models[*].subscores.{calib,spread,memo,prior}.score", "models[*].score"]}
            data={{
              columns: ["checkpoint", "stage", ...SUB_KEYS.map((k) => `${SUB_META[k].short} · ${SUB_META[k].name}`), "overall"],
              numeric: [false, false, true, true, true, true, true],
              rows: [...famModels, ...others].map(combRow),
            }}
            legend={{ stages: Array.from(new Set(famModels.map((m) => m.stage))) as Stage[] }}
            look={[
              <>
                {memoFam}: the memo line falls to {memoFamLowMemo ? <N m={memoFamLowMemo} k="subscores.memo.score" f="score" /> : "—"} at the{" "}
                {memoFamLowMemo?.label} while the prior line stays at {memoFamLowMemo ? <N m={memoFamLowMemo} k="subscores.prior.score" f="score" /> : "—"}.
              </>,
              <>
                {priorFam}: the prior line drops to {priorFamLowPrior ? <N m={priorFamLowPrior} k="subscores.prior.score" f="score" /> : "—"}–
                {priorFamHighPrior ? <N m={priorFamHighPrior} k="subscores.prior.score" f="score" /> : "—"} on the annealed rungs while the memo line stays at{" "}
                {priorFamLowPrior ? <N m={priorFamLowPrior} k="subscores.memo.score" f="score" /> : "—"}.
              </>,
            ]}
          >
            <p className="f2-axis-once">sub-score (0–1) · rungs in ladder order</p>
            <div className="grid-2">
              {profileFams.map((f) => (
                <div key={f} className="cell-plate">
                  <h3>{f}</h3>
                  <ProfileLines rungs={ladder(bundle, f)} />
                </div>
              ))}
            </div>
          </FindingPlate>
        ) : null,
    },
    numbers: numbersOf(readoffs),
    checks: f2.checks,
  };
}

export default function F2({ bundle, F, section }: SectionProps) {
  return <FindingSection {...section} n={2} view={useFindingView(bundle, F)} />;
}
