import { Fragment, useMemo, useState, type ReactNode } from "react";
import source from "../content/findings.md?raw";
import { Markdown, sectionsOf, splitTitle, type BlockMap } from "../components/Markdown";
import type { FindingsPlate } from "../content/slots";
import { Link } from "react-router-dom";
import { useBundle } from "../data/BundleContext";
import { fp, get, path } from "../data/bundle";
import { ladder } from "../data/derive";
import { ROLL_H_LOW, RUN_MIN_LEN } from "../data/method";
import type { Model } from "../data/types";
import { allFindings, FINDING_DEFS, type Check } from "../findings";
import { Num } from "../components/Num";
import { Chevron, DataNote, Plate } from "../components/Plate";
import { StageLegend } from "../components/Glyph";
import { CombMatrix, GapPriorScatter, KLDumbbells, LadderChart, LadderSmallMultiples, PairedArrows, ProfileChart, type Metric } from "../charts/FindingCharts";
import { StageDotStrip } from "../charts/ModelCharts";
import { useScrollSpy } from "../lib/useScrollSpy";
import { fmt, isNum, type Fmt } from "../lib/numfmt";

interface ReadOff {
  model: Model;
  key: string;
  fmt: Fmt;
  what: string;
}

function N({ m, k, f }: { m: Model; k: string; f: Fmt }) {
  return <Num path={path(m, k)} fmt={f} />;
}

function ReadOffList({ items }: { items: ReadOff[] }) {
  const seen = new Set<string>();
  const uniq = items.filter((i) => {
    const key = i.model.id + i.key;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <details className="disclosure" style={{ marginTop: 8 }}>
      <summary>
        <Chevron /> Read-off: {uniq.length} values used
      </summary>
      <ul className="readoff">
        {uniq.map((i) => (
          <li key={i.model.id + i.key}>
            <Link to={`/model/${encodeURIComponent(i.model.id)}`}>
              {i.model.family} · {i.model.label}
            </Link>{" "}
            {i.what}: <Num path={path(i.model, i.key)} fmt={i.fmt} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function Notes({ checks }: { checks: Record<string, Check> }) {
  return (
    <>
      {Object.entries(checks)
        .filter(([, c]) => !c.ok)
        .map(([k, c]) => (
          <DataNote key={k}>In this bundle, {c.note}.</DataNote>
        ))}
    </>
  );
}

function joinList(nodes: ReactNode[], sep: ReactNode = ", "): ReactNode {
  return nodes.map((n, i) => (
    <Fragment key={i}>
      {i > 0 && sep}
      {n}
    </Fragment>
  ));
}

function Def({ name, f }: { name: keyof typeof FINDING_DEFS; f: Fmt }) {
  return <Num path={`findings.${name}`} value={FINDING_DEFS[name]} fmt={f} def />;
}

export default function Findings() {
  const bundle = useBundle();
  const F = useMemo(() => allFindings(bundle), [bundle]);
  // Plate L opens on surname KL: the calibration-gap view repeats Plate F1b, so it is one click away, not the default
  const [metricKey, setMetricKey] = useState<"gap" | "kl" | "ece">("kl");

  const band = F.f1.band?.band;
  const gapMetric: Metric = {
    key: "gap",
    name: "calibration gap",
    value: (m) => fp(m, "F_calib_gap"),
    pathOf: (m) => path(m, "fingerprint.F_calib_gap"),
    fmtKind: "gap",
    axis: "calibration gap on post-cutoff text, mean(H − s), nats",
    zero: true,
    band,
  };
  const metrics: Record<string, Metric> = {
    gap: gapMetric,
    kl: {
      key: "kl",
      name: "few-shot surname KL",
      value: (m) => get(m, "surnames.KL_few"),
      pathOf: (m) => path(m, "surnames.KL_few"),
      fmtKind: "kl",
      axis: "KL(Census‖model), few-shot frames, nats",
      zero: true,
    },
    ece: {
      key: "ece",
      name: "ECE",
      value: (m) => get(m, "selfboot.reliability.ECE"),
      pathOf: (m) => path(m, "selfboot.reliability.ECE"),
      fmtKind: "num3",
      axis: "expected calibration error of top-1, post-cutoff text",
      zero: true,
    },
  };

  // ---------- F1 ----------
  const f1 = F.f1;
  const famRungs = f1.family ? ladder(bundle, f1.family) : [];
  const gapVals = famRungs.map((m) => fp(m, "F_calib_gap")).filter(isNum);
  const f1Domain: [number, number] = [Math.min(-1.0, Math.min(...gapVals) - 0.05), Math.max(0.1, Math.max(...gapVals) + 0.02)];
  const nPre = bundle.models.filter((m) => m.stage === "pre-anneal").length;
  const r1: ReadOff[] = [
    ...(f1.band ? [{ model: f1.band.model, key: "fingerprint.F_calib_gap", fmt: "gap" as Fmt, what: "F_calib_gap (sets the band)" }] : []),
    ...f1.steps.map((m) => ({ model: m, key: "fingerprint.F_calib_gap", fmt: "gap" as Fmt, what: "F_calib_gap" })),
  ];

  // ---------- F2 ----------
  const f2 = F.f2;
  const memoKey = (m: Model) => (isNum(fp(m, "X_runfrac_wiki")) ? "fingerprint.X_runfrac_wiki" : "fingerprint.verbatim_run_frac_wiki");
  const minAnneal = f2.priorAnneal.reduce<Model | null>((a, m) => (!a || (fp(m, "roll_instr_marker_rate") ?? 9) < (fp(a, "roll_instr_marker_rate") ?? 9) ? m : a), null);
  const maxAnneal = f2.priorAnneal.reduce<Model | null>((a, m) => (!a || (fp(m, "roll_instr_marker_rate") ?? -9) > (fp(a, "roll_instr_marker_rate") ?? -9) ? m : a), null);
  const profileFams = [f2.memo?.[0].family, f2.priorFamily].filter((f, i, a): f is string => !!f && a.indexOf(f) === i);
  const r2: ReadOff[] = [
    ...(f2.memo ?? []).map((m) => ({ model: m, key: memoKey(m), fmt: "pct" as Fmt, what: "Wikipedia verbatim share" })),
    ...(f2.priorPre ? [f2.priorPre, ...f2.priorAnneal] : []).map((m) => ({ model: m, key: "fingerprint.roll_instr_marker_rate", fmt: "pct" as Fmt, what: "marker rate" })),
  ];

  // ---------- F3 ----------
  const f3 = F.f3;
  const r3: ReadOff[] = [
    ...(f3.student ? [{ model: f3.student, key: "fingerprint.F_calib_gap", fmt: "gap" as Fmt, what: "F_calib_gap" }] : []),
    ...(f3.otherBaseMin ? [{ model: f3.otherBaseMin.model, key: "fingerprint.F_calib_gap", fmt: "gap" as Fmt, what: "F_calib_gap (lowest other base)" }] : []),
    ...(f3.postMax ? [{ model: f3.postMax.model, key: "fingerprint.F_calib_gap", fmt: "gap" as Fmt, what: "F_calib_gap (highest post-trained)" }] : []),
    ...(f3.studentPost ? [{ model: f3.studentPost, key: "fingerprint.F_calib_gap", fmt: "gap" as Fmt, what: "F_calib_gap" }] : []),
  ];

  // ---------- F4 ----------
  const f4 = F.f4;
  const sp4 = f4.specimen;
  const next4 = sp4 ? f4.family.find((r) => r.order > sp4.order && r.stage !== "post-trained") : undefined;
  const r4: ReadOff[] = f4.family.flatMap((m) => [
    { model: m, key: 'fingerprint["roll_frac_H<0.1"]', fmt: "pct" as Fmt, what: "steps with H < 0.1" },
    { model: m, key: "fingerprint.roll_rep8_q4", fmt: "pct" as Fmt, what: "late 8-gram repetition" },
  ]);

  // ---------- F5 ----------
  const f5 = F.f5;
  const cleanLo = f5.clean.reduce<Model | null>((a, m) => (!a || m.surnames!.KL_few! < a.surnames!.KL_few! ? m : a), null);
  const cleanHi = f5.clean.reduce<Model | null>((a, m) => (!a || m.surnames!.KL_few! > a.surnames!.KL_few! ? m : a), null);
  const effMetric: Metric = {
    key: "eff",
    name: "exp(H_few)",
    value: (m) => (isNum(get(m, "surnames.H_few")) ? Math.exp(get(m, "surnames.H_few")!) : null),
    pathOf: (m) => `exp(${path(m, "surnames.H_few")})`,
    fmtKind: "eff",
    axis: "effective number of surnames, exp(H_few), linear",
    ref: isNum(bundle.reference.census_entropy_top2000) ? { value: Math.exp(bundle.reference.census_entropy_top2000), label: "Census, top 2,000" } : undefined,
  };
  const r5: ReadOff[] = [
    ...f5.clean.map((m) => ({ model: m, key: "surnames.KL_few", fmt: "kl" as Fmt, what: "few-shot KL" })),
    ...(f5.B ? [{ model: f5.B, key: "surnames.KL_few", fmt: "kl" as Fmt, what: "few-shot KL" }, { model: f5.B, key: "surnames.H_few", fmt: "nats" as Fmt, what: "few-shot entropy" }] : []),
  ];

  // ---------- F6 ----------
  const f6 = F.f6;
  const rLo = f6.rateSupport.reduce<(typeof f6.pairs)[number] | null>((a, p) => (!a || p.rise < a.rise ? p : a), null);
  const rHi = f6.rateSupport.reduce<(typeof f6.pairs)[number] | null>((a, p) => (!a || p.rise > a.rise ? p : a), null);
  const gLo = f6.gapSupport.reduce<(typeof f6.pairs)[number] | null>((a, p) => (!a || -p.hiDelta! < -a.hiDelta! ? p : a), null);
  const gHi = f6.gapSupport.reduce<(typeof f6.pairs)[number] | null>((a, p) => (!a || -p.hiDelta! > -a.hiDelta! ? p : a), null);
  const r6: ReadOff[] = f6.pairs.flatMap((p) => [
    { model: p.base, key: 'tail.tf_fresh["s>10"]', fmt: "pct" as Fmt, what: "s > 10 rate" },
    { model: p.post, key: 'tail.tf_fresh["s>10"]', fmt: "pct" as Fmt, what: "s > 10 rate" },
    { model: p.base, key: "tail.tf_fresh.gap_hiH", fmt: "gap" as Fmt, what: "gap at H > 4" },
    { model: p.post, key: "tail.tf_fresh.gap_hiH", fmt: "gap" as Fmt, what: "gap at H > 4" },
  ]);

  // ---------- claims (computed sentences with live numbers), keyed by finding id ----------
  const claims: Record<string, ReactNode> = {
    f1: (
      <>
        Pre-anneal checkpoints are calibrated on unseen text: all {nPre} sit within ±
        {f1.band ? <Num path={path(f1.band.model, "fingerprint.F_calib_gap")} value={f1.band.band} fmt="nats" derived="max |F_calib_gap| over pre-anneal checkpoints" /> : "—"}{" "}
        of zero. Every later stage pushes the gap negative, monotonically along {f1.family}:{" "}
        {joinList(
          f1.steps.map((m) => <N key={m.id} m={m} k="fingerprint.F_calib_gap" f="signed" />),
          " → ",
        )}
        .
      </>
    ),
    f2: (
      <>
        “Annealed” is not one thing.{" "}
        {joinList(
          [
            f2.memo && f2.memo.length >= 2 ? (
              <span key="memo">
                {f2.memo[0].family}’s anneal memorised its up-weighted sources (Wikipedia verbatim share <N m={f2.memo[0]} k={memoKey(f2.memo[0])} f="pct" /> →{" "}
                <N m={f2.memo[1]} k={memoKey(f2.memo[1])} f="pct" />)
              </span>
            ) : null,
            f2.priorPre && minAnneal && maxAnneal ? (
              <span key="prior">
                {f2.priorFamily}’s kept calibration but put instruction data into the prior (marker rate{" "}
                <N m={f2.priorPre} k="fingerprint.roll_instr_marker_rate" f="pct" /> → <N m={minAnneal} k="fingerprint.roll_instr_marker_rate" f="pct" />–
                <N m={maxAnneal} k="fingerprint.roll_instr_marker_rate" f="pct" />)
              </span>
            ) : null,
          ].filter(Boolean),
          "; ",
        )}
        .
      </>
    ),
    f3: f3.student ? (
      <>
        Distillation looks like post-training on the calibration axis: {f3.student.family} {f3.student.label} sits at <N m={f3.student} k="fingerprint.F_calib_gap" f="gap" />,
        below every other base
        {f3.otherBaseMin && (
          <>
            {" "}
            (the next lowest is {f3.otherBaseMin.model.family} {f3.otherBaseMin.model.label}, <N m={f3.otherBaseMin.model} k="fingerprint.F_calib_gap" f="signed" />)
          </>
        )}{" "}
        and inside the post-trained range.
      </>
    ) : (
      "Distillation: no distilled base in this bundle."
    ),
    f4: sp4 ? (
      <>
        Free-running collapse is not diagnostic: the pre-anneal {sp4.family} {sp4.label} spends <N m={sp4} k='fingerprint["roll_frac_H<0.1"]' f="pct" /> of its own sampling steps
        below <Num path="method.ROLL_H_LOW" value={ROLL_H_LOW} fmt="num2" def /> nats of entropy and repeats <N m={sp4} k="fingerprint.roll_rep8_q4" f="pct" /> of late 8-grams
        {next4 && (
          <>
            ; annealed, it repeats <N m={next4} k="fingerprint.roll_rep8_q4" f="pct" />
          </>
        )}
        , against a post-trained median of{" "}
        {isNum(f4.postRepMedian) ? (
          <Num path="median(models[stage=post-trained].fingerprint.roll_rep8_q4)" value={f4.postRepMedian} fmt="pct" derived="median over post-trained checkpoints" />
        ) : (
          "—"
        )}
        .
      </>
    ) : (
      "No pre-anneal checkpoint with own-sample statistics in this bundle."
    ),
    f5: (
      <>
        Asked for random surnames, every model answers with the ranked list of common surnames. Shown six genuine draws, pre-anneal checkpoints and clean bases match
        the population (KL {cleanLo ? <N m={cleanLo} k="surnames.KL_few" f="kl" /> : "—"}–{cleanHi ? <N m={cleanHi} k="surnames.KL_few" f="kl" /> : "—"}); post-training
        thins the tail
        {f5.B && (
          <>
            {" "}
            ({f5.B.family} {f5.B.label}: KL <N m={f5.B} k="surnames.KL_few" f="kl" />, entropy <N m={f5.B} k="surnames.H_few" f="num2" /> vs Census{" "}
            <Num path="reference.census_entropy_top2000" fmt="num2" />)
          </>
        )}
        .
      </>
    ),
    f6: (
      <>
        Post-training raises the rate of real tokens the model found “impossible” (s &gt; 10 nats) by{" "}
        {rLo && rHi ? (
          <>
            <Num path={`${path(rLo.post, 'tail.tf_fresh["s>10"]')} / ${path(rLo.base, 'tail.tf_fresh["s>10"]')} − 1`} value={rLo.rise} fmt="pct" derived={`${rLo.post.label} vs ${rLo.base.label}`} />–
            <Num path={`${path(rHi.post, 'tail.tf_fresh["s>10"]')} / ${path(rHi.base, 'tail.tf_fresh["s>10"]')} − 1`} value={rHi.rise} fmt="pct" derived={`${rHi.post.label} vs ${rHi.base.label}`} />
          </>
        ) : (
          "—"
        )}{" "}
        and makes the model{" "}
        {gLo && gHi ? (
          <>
            <Num path={`${path(gLo.base, "tail.tf_fresh.gap_hiH")} − ${path(gLo.post, "tail.tf_fresh.gap_hiH")}`} value={-gLo.hiDelta!} fmt="num2" derived={`${gLo.post.label} vs ${gLo.base.label}`} />–
            <Num path={`${path(gHi.base, "tail.tf_fresh.gap_hiH")} − ${path(gHi.post, "tail.tf_fresh.gap_hiH")}`} value={-gHi.hiDelta!} fmt="num2" derived={`${gHi.post.label} vs ${gHi.base.label}`} /> nats
          </>
        ) : (
          "—"
        )}{" "}
        more over-confident exactly where it is uncertain (H &gt; 4)
        {f6.gapExceptions.length > 0 && (
          <>
            , except{" "}
            {joinList(
              f6.gapExceptions.map((p) => (
                <span key={p.post.id}>
                  {p.post.family} {p.post.label}, <N m={p.post} k="tail.tf_fresh.gap_hiH" f="signed" />
                  {p.hiDelta !== null && (
                    <>
                      {" "}
                      (<Num path={`${path(p.post, "tail.tf_fresh.gap_hiH")} − ${path(p.base, "tail.tf_fresh.gap_hiH")}`} value={p.hiDelta} fmt="signed" derived={`change vs ${p.base.label}`} /> vs
                      its base)
                    </>
                  )}
                </span>
              )),
              "; ",
            )}
          </>
        )}
        . Bases sit near zero (median{" "}
        {isNum(f6.baseHiMedian) ? (
          <Num path="median(models[stage≠post-trained].tail.tf_fresh.gap_hiH)" value={f6.baseHiMedian} fmt="signed" derived="median over pre-anneal, anneal and base" />
        ) : (
          "—"
        )}
        {f6.baseHiExceptions.length > 0 && (
          <>
            ; except{" "}
            {joinList(
              f6.baseHiExceptions.map((x) => (
                <span key={x.model.id}>
                  {x.model.family} {x.model.label}, <N m={x.model} k="tail.tf_fresh.gap_hiH" f="signed" />
                </span>
              )),
              "; ",
            )}
          </>
        )}
        ).
      </>
    ),
  };
  const checks: Record<string, Record<string, Check>> = { f1: f1.checks, f2: f2.checks, f3: f3.checks, f4: f4.checks, f5: f5.checks, f6: f6.checks };
  const readoffs: Record<string, ReadOff[]> = { f1: r1, f2: r2, f3: r3, f4: r4, f5: r5, f6: r6 };

  // ---------- computed detail paragraphs ----------
  const details: Record<string, ReactNode> = {
    f1: (
      <p>
        The steps in the claim are the last rung of each stage, then each post-training stage in order ({f1.steps.map((m) => m.label).join(" → ")}); inside a stage, rises
        up to <Def name="STAGE_TOL" f="nats" /> are tolerated. The most negative per-domain gap of any pre-anneal checkpoint is{" "}
        {f1.preDomainMin.length ? <N m={f1.preDomainMin.reduce((a, b) => (b.value < a.value ? b : a)).model} k="fingerprint.F_gap_domain_min" f="gap" /> : "—"}.
      </p>
    ),
    f2: (
      <p>
        The memo score reads recitation of the anneal mix (verbatim runs of at least <Num path="method.RUN_MIN_LEN" value={RUN_MIN_LEN} fmt="count" def /> confident,
        correct tokens); the prior score reads instruction-shaped text in samples from a bare BOS token. One anneal moved the first and not the second; the other did
        the opposite.
      </p>
    ),
    f3: (
      <p>
        On the prior axis the student still looks like a base: its instruction-marker rate is{" "}
        {f3.student ? <N m={f3.student} k="fingerprint.roll_instr_marker_rate" f="pct" /> : "—"}
        {f3.studentPost && (
          <>
            , against <N m={f3.studentPost} k="fingerprint.roll_instr_marker_rate" f="pct" /> for its instruction-tuned sibling ({f3.studentPost.label})
          </>
        )}
        . Where it is uncertain (H &gt; 4) its gap is {f3.student ? <N m={f3.student} k="tail.tf_fresh.gap_hiH" f="gap" /> : "—"}
        {f3.studentPost && (
          <>
            , against <N m={f3.studentPost} k="tail.tf_fresh.gap_hiH" f="gap" /> for the sibling
          </>
        )}
        .
      </p>
    ),
    f5: (
      <p>
        Under a verbal description (“random”, “in proportion to the Census”), every checkpoint puts more mass on the top ten names than the Census does; post-training
        sharpens that into recitation in {f5.sharpenPairs.length} of the base → post pairs with surname data. “Clean bases” here means base checkpoints with an overall
        score of at least <Def name="CLEAN_BASE_MIN_OVERALL" f="score" />:{" "}
        {f5.clean
          .filter((m) => m.stage === "base")
          .map((m) => `${m.family} ${m.label}`)
          .join(", ") || "none in this bundle"}
        .
      </p>
    ),
    f6: (
      <p>
        Each post-trained rung is paired with the nearest preceding rung of its family that is not post-trained. The rate range covers the {f6.rateSupport.length} of{" "}
        {f6.pairs.length} pairs where the rise is at least <Def name="F6_RATE_SUPPORT" f="pct" />
        {f6.rateExceptions.length > 0 && (
          <>
            {" "}
            (smaller:{" "}
            {joinList(
              f6.rateExceptions.map((p) => (
                <span key={p.post.id}>
                  {p.post.family} {p.post.label}{" "}
                  <Num path={`${path(p.post, 'tail.tf_fresh["s>10"]')} / ${path(p.base, 'tail.tf_fresh["s>10"]')} − 1`} value={p.rise} fmt="pctSigned" derived="relative change" />
                </span>
              )),
            )}
            )
          </>
        )}
        ; the gap range covers the {f6.gapSupport.length} pairs whose gap at H &gt; 4 falls by more than <Def name="F6_GAP_SUPPORT" f="nats" />.
      </p>
    ),
  };

  // ---------- plates, by the slot names used in content/findings.md ----------
  const plates: Record<FindingsPlate, () => ReactNode> = {
    "ladder-calib": () =>
      f1.family ? (
        <Plate
          label={`Plate F1a · Calibration gap along the ${f1.family} ladder`}
          caption="Linear axis; the shaded band is ± the widest pre-anneal gap. The lens repeats the region near zero on its own linear scale; rungs outside the lens are hollow and marked with an arrow."
          sources={[`models[family=${f1.family}].fingerprint.F_calib_gap`]}
          data={{
            columns: ["rung", "stage", "F_calib_gap"],
            numeric: [false, false, true],
            rows: famRungs.map((m) => [m.label, m.stage, fmt(fp(m, "F_calib_gap"), "gap")]),
          }}
        >
          <LadderChart rungs={famRungs} metric={gapMetric} domain={f1Domain} lens={[-0.12, 0.04]} height={220} />
        </Plate>
      ) : null,
    "ladder-calib-families": () => (
      <Plate
        label="Plate F1b · Calibration gap, every family with two or more rungs"
        caption="Shared linear y scale across panels; ladder order left to right; parallel releases share a column."
        sources={["models[*].fingerprint.F_calib_gap"]}
      >
        <LadderSmallMultiples bundle={bundle} metric={gapMetric} />
      </Plate>
    ),
    "anneal-profiles": () => (
      <Plate
        label="Plate F2a · Sub-score profiles across rungs"
        caption="Calib solid, spread dashed, memo dotted, prior dash-dot; each line is labelled at its right end."
        sources={["models[*].subscores.{calib,spread,memo,prior}.score"]}
      >
        <div className="grid-2">
          {profileFams.map((f) => (
            <div key={f} className="cell-plate">
              <h3>{f}</h3>
              <ProfileChart rungs={ladder(bundle, f)} />
            </div>
          ))}
        </div>
      </Plate>
    ),
    "subscore-matrix": () => (
      <Plate label="Plate F2b · Sub-score comb, anneal and base checkpoints" sources={["models[stage∈{anneal,base}].subscores"]}>
        <CombMatrix models={bundle.models.filter((m) => m.stage === "anneal" || m.stage === "base").sort((a, b) => (b.score ?? 0) - (a.score ?? 0))} />
      </Plate>
    ),
    "gap-prior": () => (
      <Plate
        label="Plate F3 · Calibration gap against instruction-shaped prior"
        caption="Every checkpoint as its stage glyph. The distilled base is highlighted and labelled; the arrow joins it to its post-trained sibling."
        sources={["models[*].fingerprint.F_calib_gap", "models[*].fingerprint.roll_instr_marker_rate"]}
      >
        <GapPriorScatter bundle={bundle} label={f3.student} arrowTo={f3.studentPost} />
      </Plate>
    ),
    "collapse-strip": () => (
      <div className="grid-2">
        <Plate label="Plate F4a · Near-deterministic own-sample steps" sources={['models[*].fingerprint["roll_frac_H<0.1"]']}>
          <StageDotStrip
            bundle={bundle}
            value={(m) => fp(m, "roll_frac_H<0.1")}
            valuePath={(m) => path(m, 'fingerprint["roll_frac_H<0.1"]')}
            fmtKind="pct"
            axisTitle="share of own-sample steps with H < 0.1"
            labelIds={f4.family.map((m) => m.id)}
            joinIds={f4.family.map((m) => m.id)}
          />
        </Plate>
        <Plate label="Plate F4b · Late 8-gram repetition" sources={["models[*].fingerprint.roll_rep8_q4"]}>
          <StageDotStrip
            bundle={bundle}
            value={(m) => fp(m, "roll_rep8_q4")}
            valuePath={(m) => path(m, "fingerprint.roll_rep8_q4")}
            fmtKind="pct"
            axisTitle="repeated 8-grams, last quarter of samples"
            labelIds={f4.family.map((m) => m.id)}
            joinIds={f4.family.map((m) => m.id)}
          />
        </Plate>
      </div>
    ),
    "surname-kl": () => (
      <Plate
        label="Plate F5a · KL(Census‖model): described (hollow) and few-shot (filled)"
        caption="Log axis with labelled decades. Rows grouped by stage, sorted by few-shot KL."
        sources={["models[*].surnames.KL_few", "models[*].surnames.KL_desc"]}
      >
        <KLDumbbells bundle={bundle} />
      </Plate>
    ),
    "ladder-surname-kl": () =>
      f1.family ? (
        <Plate
          label={`Plate F5b · Effective number of surnames along the ${f1.family} ladder`}
          caption="exp(H_few) per rung against the Census over the same 2,000 names (dashed line)."
          sources={[`models[family=${f1.family}].surnames.H_few`, "reference.census_entropy_top2000"]}
        >
          <LadderChart
            rungs={famRungs}
            metric={effMetric}
            domain={[0, Math.max(effMetric.ref?.value ?? 0, ...famRungs.map(effMetric.value).filter(isNum)) * 1.08]}
            height={180}
          />
        </Plate>
      ) : null,
    "tail-arrows": () => (
      <Plate label="Plate F6a · Impossible tokens, base → post-trained" sources={['models[*].tail.tf_fresh["s>10"]']}>
        <PairedArrows pairs={f6.pairs} />
      </Plate>
    ),
    "tail-strip": () => (
      <Plate label="Plate F6b · Gap where the model is uncertain (H > 4)" sources={["models[*].tail.tf_fresh.gap_hiH"]}>
        <StageDotStrip
          bundle={bundle}
          value={(m) => get(m, "tail.tf_fresh.gap_hiH")}
          valuePath={(m) => path(m, "tail.tf_fresh.gap_hiH")}
          fmtKind="gap"
          axisTitle="gap at H > 4, nats (post-cutoff)"
          zero
        />
      </Plate>
    ),
    ladders: () => (
      <>
        <div className="seg metric-switch" role="group" aria-label="Metric">
          {(
            [
              ["kl", "Few-shot surname KL"],
              ["ece", "ECE"],
              ["gap", "Calibration gap"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" className="btn" aria-pressed={metricKey === k} onClick={() => setMetricKey(k)}>
              {l}
            </button>
          ))}
        </div>
        <Plate
          label={`Plate L · ${metrics[metricKey].name} per family`}
          caption="Families with two or more rungs; shared linear y scale; rungs left to right in ladder order (pre-anneal → anneal → base → post-trained)."
          sources={[`models[*].${metricKey === "gap" ? "fingerprint.F_calib_gap" : metricKey === "kl" ? "surnames.KL_few" : "selfboot.reliability.ECE"}`]}
          data={{
            columns: ["family", "rung", "stage", metrics[metricKey].name],
            numeric: [false, false, false, true],
            rows: bundle.models
              .filter((m) => ladder(bundle, m.family).length > 1)
              .sort((a, b) => a.family.localeCompare(b.family) || a.order - b.order)
              .map((m) => [m.family, m.label, m.stage, fmt(metrics[metricKey].value(m), metrics[metricKey].fmtKind)]),
          }}
        >
          <LadderSmallMultiples bundle={bundle} metric={metrics[metricKey]} />
        </Plate>
      </>
    ),
  };

  const blockMap: BlockMap = { ...plates };
  for (const fid of Object.keys(claims)) {
    blockMap[`${fid}-claim`] = () => (
      <>
        <p className="claim" id={`${fid}-claim`}>
          {claims[fid]}
        </p>
        <Notes checks={checks[fid]} />
      </>
    );
    blockMap[`${fid}-detail`] = () => details[fid] ?? null;
    blockMap[`${fid}-readoff`] = () => <ReadOffList items={readoffs[fid]} />;
  }

  const { intro, sections } = sectionsOf(splitTitle(source).body);
  const activeId = useScrollSpy(sections.map((s) => s.id));
  const fIndex = (id: string) => (/^f(\d)$/.exec(id)?.[1] ? Number(/^f(\d)$/.exec(id)![1]) : null);
  const railLabel = (s: { id: string; title: string }) => (fIndex(s.id) ? `F${fIndex(s.id)} ${s.title}` : s.title);

  return (
    <div className="container">
      <div className="reading">
        <nav className="rail" aria-label="Findings">
          <div className="rail-inner">
            <ol>
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} aria-current={activeId === s.id ? "true" : undefined}>
                    {railLabel(s)}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>
        <div className="wide">
          <header className="page-head">
            <h1>{splitTitle(source).title ?? "Findings"}</h1>
            <p className="lede">
              What the <Num path="n_models" fmt="count" /> checkpoints in this bundle show.
            </p>
            <ul className="chiprow" aria-label="Findings">
              {sections.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} aria-current={activeId === s.id ? "true" : undefined}>
                    {fIndex(s.id) ? `F${fIndex(s.id)}` : s.id === "ladders" ? "Ladders" : s.title}
                  </a>
                </li>
              ))}
            </ul>
            <Markdown source={intro} />
            <StageLegend />
          </header>
          {sections.map((s) => {
            const n = fIndex(s.id);
            return (
              <section key={s.id} id={s.id} className="finding" aria-labelledby={`${s.id}-h`}>
                {n ? (
                  <h2 id={`${s.id}-h`} className="kicker finding-title">
                    <span className="mono">F{n}</span> · {s.title}
                  </h2>
                ) : (
                  <>
                    <p className="kicker">Ladders</p>
                    <h2 id={`${s.id}-h`}>{s.title}</h2>
                  </>
                )}
                <Markdown source={s.body} blocks={blockMap} />
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
