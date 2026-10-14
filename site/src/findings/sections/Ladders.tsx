/**
 * Ladders · every family in stage order, switchable metric. Owner: Ladders implementer (this file, the ladders/ folder,
 * the `{#ladders}` section of content/findings.md). Plate L absorbs the former Plate F1b: calibration gap is its default.
 */
import { useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { FindingSection } from "../../components/Finding";
import { Num } from "../../components/Num";
import { ciBounds } from "../../data/ci";
import { familiesOf, ladder, STAGE_CODE, stageOrder } from "../../data/derive";
import type { Bundle, Model } from "../../data/types";
import { fmt, fmtNum, isNum } from "../../lib/numfmt";
import { Def, joinList, modelHref } from "../shared/prose";
import type { Findings, FindingView, SectionProps } from "../shared/types";
import { LadderGrid, orderFamilies } from "./ladders/LadderGrid";
import { LadderPlate } from "./ladders/LadderPlate";
import { DEFAULT_METRIC, isMetricKey, ladderMetricList, type LadderMetric, type MetricKey } from "./ladders/metrics";
import "./ladders/ladders.css";

/** '900 docs' / '3 frames' for a ci entry; '—' when the field has none. */
function ciN(m: Model, key: string): string {
  const e = m.ci?.[key];
  if (!e) return "—";
  if (isNum(e.n_docs)) return `${fmtNum(e.n_docs, "count")} docs`;
  if (isNum(e.n_frames)) return `${fmtNum(e.n_frames, "count")} frames`;
  return "—";
}

/** The sentence under each metric's grid (one per metric), before the shared order sentence. */
function captionOf(lm: LadderMetric, F: Findings) {
  switch (lm.key) {
    case "gap":
      return (
        <>
          Calibration gap on post-cutoff text, mean(H − s); the band is ± the widest pre-anneal gap (
          {F.f1.band ? <Num path={`models[${F.f1.band.model.id}].fingerprint.F_calib_gap`} value={F.f1.band.band} fmt="nats" derived="max |F_calib_gap| over pre-anneal checkpoints" /> : "—"}
          ), and the whiskers are 95% bootstrap intervals over documents, mostly narrower than the glyph.
        </>
      );
    case "hih":
      return (
        <>
          Gap at positions where the model's entropy exceeds 4 nats; within ± <Def name="BASE_HIH_ZERO" f="nats" /> of zero a base counts as calibrated (F6), and the
          bundle carries no interval for this field.
        </>
      );
    case "kl":
      return <>KL from the Census to the model's surname distribution under the few-shot frames; the whiskers span the three frames.</>;
    case "ece":
      return <>Expected calibration error of the top-1 token on post-cutoff text; the whiskers are 95% bootstrap intervals over documents, mostly narrower than the glyph.</>;
  }
}

export function useFindingView(bundle: Bundle, F: Findings): FindingView {
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const loc = useLocation();
  const fromUrl = sp.get("metric");
  const [metricKey, setMetricKey] = useState<MetricKey>(isMetricKey(fromUrl) ? fromUrl : DEFAULT_METRIC);
  const list = ladderMetricList(F.f1.band?.band);
  const lm = list.find((x) => x.key === metricKey) ?? list[0];
  const { metric } = lm;
  /** the switch is mirrored to ?metric= (replace, hash kept) so a view can be linked */
  const select = (k: MetricKey) => {
    setMetricKey(k);
    const n = new URLSearchParams(sp);
    if (k === DEFAULT_METRIC) n.delete("metric");
    else n.set("metric", k);
    const s = n.toString();
    navigate({ pathname: loc.pathname, search: s ? `?${s}` : "", hash: loc.hash }, { replace: true });
  };

  const fams = orderFamilies(
    familiesOf(bundle)
      .map((f) => ladder(bundle, f))
      .filter((r) => r.length >= 2),
    metric,
  );
  const rungs = fams.flat();
  const stages = stageOrder.filter((s) => rungs.some((m) => m.stage === s));
  const unmeasured = rungs.filter((m) => metric.value(m) === null);
  const ciKey = metric.ciKey;

  const switchEl = (
    <div className="seg" role="group" aria-label="Metric">
      {list.map((x) => (
        <button key={x.key} type="button" className="btn" aria-pressed={x.key === metricKey} onClick={() => select(x.key)}>
          {x.label}
        </button>
      ))}
    </div>
  );

  return {
    headline: null,
    standfirst: (
      <>
        Each family's rungs left to right for one metric on a shared axis:{" "}
        <Num path="count(distinct models[*].family where the family has ≥ 2 rungs)" value={fams.length} fmt="count" derived="families with two or more rungs" /> families
        with two or more rungs.
      </>
    ),
    plates: {
      ladders: () => (
        <LadderPlate
          id="plate-l"
          label={`Plate L · ${metric.name} per family`}
          axisTitle={metric.axis}
          stages={stages}
          switchEl={switchEl}
          unmeasured={
            unmeasured.length ? (
              <p className="ldr-unmeasured">
                Not measured ({metric.name}):{" "}
                {joinList(
                  unmeasured.map((m) => (
                    <Link key={m.id} to={modelHref(m)}>
                      {m.family} · {m.label}
                    </Link>
                  )),
                  "; ",
                )}
                .
              </p>
            ) : undefined
          }
          caption={
            <>
              {captionOf(lm, F)} Families are ordered by last rung minus first, largest fall first; rungs run left to right in stage order and parallel releases share
              a column.
            </>
          }
          sources={[`models[*].${lm.source}`, ...(lm.ciSource ? [`models[*].${lm.ciSource}`] : [])]}
          data={{
            columns: ["family", "rung", "stage", metric.name, ...(ciKey ? [lm.ciLabel ?? "interval", "n"] : [])],
            numeric: [false, false, false, true, ...(ciKey ? [true, true] : [])],
            rows: rungs.map((m) => {
              const b = ciKey ? ciBounds(m, ciKey) : null;
              return [
                m.family,
                m.label,
                STAGE_CODE[m.stage],
                fmt(metric.value(m), metric.fmtKind),
                ...(ciKey ? [b ? `[${fmtNum(b[0], metric.fmtKind)}, ${fmtNum(b[1], metric.fmtKind)}]` : "—", ciN(m, ciKey)] : []),
              ];
            }),
          }}
        >
          <LadderGrid fams={fams} metric={metric} />
        </LadderPlate>
      ),
    },
    numbers: [],
    checks: {},
  };
}

export default function Ladders({ bundle, F, section }: SectionProps) {
  return <FindingSection {...section} n={null} view={useFindingView(bundle, F)} />;
}
