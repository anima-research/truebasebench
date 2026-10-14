/** F1 · Calibration ladder. Owner: F1 implementer (this file, ./f1/, the `{#f1}` section of content/findings.md, its plate ids in slots.ts). */
import { Link } from "react-router-dom";
import { Aside, FindingPlate, FindingSection } from "../../components/Finding";
import { Num } from "../../components/Num";
import { fp, path } from "../../data/bundle";
import { ladder } from "../../data/derive";
import type { Bundle, Model } from "../../data/types";
import { FINDING_DEFS } from "../../findings";
import { fmt, fmtNum, isNum, type Fmt } from "../../lib/numfmt";
import { ciBounds } from "../../data/ci";
import { gapMetric } from "../shared/metrics";
import { Def, joinList, N, numbersOf, type ReadOff } from "../shared/prose";
import type { FindingNumber, Findings, FindingView, SectionProps } from "../shared/types";
import { CalibLadderChart, type BandLabel } from "./f1/CalibLadderChart";
import "./f1/f1.css";

const LENS: [number, number] = [-0.12, 0.04];

export function useFindingView(bundle: Bundle, F: Findings): FindingView {
  const f1 = F.f1;
  const metric = gapMetric(f1.band?.band);
  const g = (m: Model) => fp(m, "F_calib_gap");
  const famRungs = f1.family ? ladder(bundle, f1.family) : [];
  const gapVals = famRungs.map(g).filter(isNum);
  const domain: [number, number] = [Math.min(-1.0, Math.min(...gapVals) - 0.05), Math.max(0.1, Math.max(...gapVals) + 0.02)];
  const pres = bundle.models.filter((m) => m.stage === "pre-anneal");
  const nPre = pres.length;
  // the 'every PRE' column: pre-anneal checkpoints that are not rungs of the specimen ladder, largest gap first
  const others = pres.filter((m) => m.family !== f1.family).sort((a, b) => (g(b) ?? -Infinity) - (g(a) ?? -Infinity));
  const steps = f1.steps;
  const lastAnneal = [...steps].reverse().find((m) => m.stage === "anneal") ?? null;
  const firstPost = steps.find((m) => m.stage === "post-trained") ?? null;
  const last = steps.length ? steps[steps.length - 1] : null;
  const domMin = f1.preDomainMin.length ? f1.preDomainMin.reduce((a, b) => (b.value < a.value ? b : a)) : null;

  // exceptions: recomputed from the rungs with the predicate's own rule, so the offending glyph is tagged on the figure
  const tags: Record<string, string> = {};
  if (!f1.checks.monotone.ok) {
    for (let i = 1; i < steps.length; i++) {
      const a = g(steps[i - 1]);
      const c = g(steps[i]);
      if (isNum(a) && isNum(c) && c > a) tags[steps[i].id] = "exception";
    }
    for (let i = 1; i < famRungs.length; i++) {
      if (famRungs[i].stage !== famRungs[i - 1].stage || famRungs[i].stage === "post-trained") continue;
      const a = g(famRungs[i - 1]);
      const c = g(famRungs[i]);
      if (isNum(a) && isNum(c) && c - a > FINDING_DEFS.STAGE_TOL) tags[famRungs[i].id] = "exception";
    }
  }
  if (!f1.checks.domains.ok) {
    for (const m of pres) {
      const lo = fp(m, "F_gap_domain_min");
      const hi = fp(m, "F_gap_domain_max");
      if ((isNum(lo) && lo < -FINDING_DEFS.PRE_DOMAIN_BAND_MAX) || (isNum(hi) && hi > FINDING_DEFS.PRE_DOMAIN_BAND_MAX)) tags[m.id] = "exception";
    }
  }

  const bandNum = f1.band ? { path: path(f1.band.model, "fingerprint.F_calib_gap"), value: f1.band.band, derived: "max |F_calib_gap| over pre-anneal checkpoints" } : null;
  const bandLabel: BandLabel | null =
    f1.band && bandNum
      ? f1.checks.band.ok
        ? {
            num: bandNum,
            after: <>, the widest pre-anneal gap ({f1.band.model.label})</>,
            chars: 8 + 28 + f1.band.model.label.length + 2,
            short: { after: <>, the widest pre-anneal gap</>, chars: 8 + 28 },
          }
        : {
            num: bandNum,
            after: (
              <>
                {" "}
                (outside ±<Def name="PRE_BAND_MAX" f="num3" />)
              </>
            ),
            chars: 8 + 16,
          }
      : null;

  const readoffs: ReadOff[] = [
    ...(f1.band ? [{ model: f1.band.model, key: "fingerprint.F_calib_gap", fmt: "gap" as Fmt, what: "F_calib_gap (sets the band)" }] : []),
    ...steps.map((m) => ({ model: m, key: "fingerprint.F_calib_gap", fmt: "gap" as Fmt, what: "F_calib_gap" })),
    ...others.map((m) => ({ model: m, key: "fingerprint.F_calib_gap", fmt: "gap" as Fmt, what: "F_calib_gap (every PRE)" })),
    ...(domMin ? [{ model: domMin.model, key: "fingerprint.F_gap_domain_min", fmt: "gap" as Fmt, what: "F_gap_domain_min (most negative single-domain gap)" }] : []),
  ];
  const numbers: FindingNumber[] = [
    { label: "pre-anneal checkpoints", path: "count(models[stage=pre-anneal])", value: nPre, fmt: "count", derived: "pre-anneal checkpoints in the bundle" },
    ...(bandNum ? [{ label: "band", path: bandNum.path, value: bandNum.value, fmt: "nats" as Fmt, derived: bandNum.derived }] : []),
    ...numbersOf(readoffs),
  ];
  const tableRows = [...others, ...famRungs].map((m) => {
    const b = ciBounds(m, "calib_gap");
    return [m.family === f1.family ? m.label : `${m.family} · ${m.label}`, m.stage, fmt(g(m), "gap"), b ? fmtNum(b[0], "signed") : "—", b ? fmtNum(b[1], "signed") : "—"];
  });

  const bandN = bandNum ? <Num path={bandNum.path} value={bandNum.value} fmt="nats" derived={bandNum.derived} /> : "—";

  return {
    headline: (
      <>
        Pre-anneal checkpoints are calibrated on unseen text: all{" "}
        <Num path="count(models[stage=pre-anneal])" value={nPre} fmt="count" derived="pre-anneal checkpoints in the bundle" /> sit within ±{bandN} of zero, and every
        later stage pushes the gap negative.
      </>
    ),
    standfirst: steps.length ? (
      <>
        Along {f1.family} the gap falls monotonically through the stages:{" "}
        {joinList(
          steps.map((m) => <N key={m.id} m={m} k="fingerprint.F_calib_gap" f="signed" />),
          " → ",
        )}
        ; the most negative single-domain gap of any pre-anneal checkpoint is {domMin ? <N m={domMin.model} k="fingerprint.F_gap_domain_min" f="gap" /> : "—"}.
      </>
    ) : undefined,
    detail: (
      <>
        <div className="with-margin f1-detail">
          <div className="wm-main">
            <p>
              The gap is mean(H − s) on post-cutoff text, the model's expected surprise minus the surprise the real next token gave it; at zero, expected surprise equals
              realised surprise (<Link to="/methodology#calibration-gap">how it is measured</Link>). A checkpoint trained only toward the data sits at zero because
              cross-entropy is a proper scoring rule: a model that matches the data expects exactly as much surprise as fresh text from that data brings.
            </p>
          </div>
          <div className="wm-margin">
            <Aside title="How this is checked">
              <p>
                The steps of the claim are the last rung of each stage, then every post-trained rung in order{steps.length ? ` (${steps.map((m) => m.label).join(" → ")})` : ""}.
                Inside a stage a rise of up to <Def name="STAGE_TOL" f="nats" /> is tolerated.
              </p>
              <p>
                The band must stay within ±<Def name="PRE_BAND_MAX" f="nats" />, and no pre-anneal checkpoint may have a single-domain gap beyond ±
                <Def name="PRE_DOMAIN_BAND_MAX" f="nats" />.
              </p>
            </Aside>
          </div>
        </div>
        <p>
          A gap of most of a nat per token means the model's real surprisal on fresh text exceeds its entropy by that much on average: it is confidently wrong far more
          often than its own distribution admits. The anneal barely moves it; SFT, DPO and RLVR each move it further.
        </p>
      </>
    ),
    plates: {
      "ladder-calib": () =>
        f1.family ? (
          <FindingPlate
            label={`Plate F1 · Calibration gap along the ${f1.family} ladder`}
            caption={
              <>
                Linear axis; the lens repeats {fmtNum(LENS[0], "signed")} to {fmtNum(LENS[1], "signed")} on its own linear scale, with the 95% bootstrap interval of each rung as a whisker.
                Ringed glyphs are the stage steps of the claim; the leading column holds every pre-anneal checkpoint of another family; rungs below the lens are hollow and
                marked ↓.
              </>
            }
            sources={[`models[family=${f1.family}].fingerprint.F_calib_gap`, "models[stage=pre-anneal].fingerprint.F_calib_gap", "models[*].ci.calib_gap.ci95"]}
            data={{
              columns: ["rung", "stage", "F_calib_gap", "ci lo", "ci hi"],
              numeric: [false, false, true, true, true],
              rows: tableRows,
            }}
            legend={{ hollowNote: "hollow = pre-anneal checkpoints of other families" }}
            look={[
              <>
                The shaded band, ±{bandN}, holds every pre-anneal glyph: the {f1.family} rungs and the hollow circles of the other families in the leading column.
              </>,
              <>
                The anneal rungs stay inside it{lastAnneal ? <>: the last, {lastAnneal.label}, reads <N m={lastAnneal} k="fingerprint.F_calib_gap" f="signed" /></> : null}.
              </>,
              <>
                {firstPost ? (
                  <>
                    {firstPost.label} is the first step out, at <N m={firstPost} k="fingerprint.F_calib_gap" f="signed" />
                  </>
                ) : (
                  "No post-trained rung"
                )}
                {last && last !== firstPost ? (
                  <>
                    ; {last.label} ends the ladder at <N m={last} k="fingerprint.F_calib_gap" f="signed" />
                  </>
                ) : null}
                .
              </>,
            ]}
            numbers={numbers}
          >
            <CalibLadderChart rungs={famRungs} others={others} steps={steps} metric={metric} domain={domain} lens={LENS} band={bandLabel} tags={tags} />
          </FindingPlate>
        ) : null,
    },
    // the numbers list is rendered in the plate's margin (above), not at the section's read-off slot
    numbers: [],
    checks: f1.checks,
  };
}

export default function F1({ bundle, F, section }: SectionProps) {
  return <FindingSection {...section} n={1} view={useFindingView(bundle, F)} />;
}
