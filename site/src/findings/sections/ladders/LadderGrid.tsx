/**
 * Plate L's figure: one LadderChart cell per family with two or more rungs, on one shared linear y scale that always
 * holds the zero line and the band. Cells are 130px tall in two or three columns and 110px in the single phone column.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { LadderChart, ladderChange, type Metric } from "../../../charts/FindingCharts";
import { ciBounds } from "../../../data/ci";
import type { Model } from "../../../data/types";
import { isNum } from "../../../lib/numfmt";

/** true below 720px (the single-column layout), false during SSR/tests. */
function usePhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(max-width: 719px)");
    const set = () => setPhone(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);
  return phone;
}

/** Shared y domain: every value, zero when the metric has a zero line, ± the band, 6% padding. */
export function sharedDomain(fams: Model[][], metric: Metric): [number, number] {
  const vals = fams.flat().map(metric.value).filter(isNum);
  let lo = Math.min(...vals, metric.zero ? 0 : Infinity);
  let hi = Math.max(...vals, metric.zero ? 0 : -Infinity);
  if (metric.band !== undefined) {
    lo = Math.min(lo, -metric.band);
    hi = Math.max(hi, metric.band);
  }
  const pad = (hi - lo) * 0.06;
  return [lo - pad, hi + pad];
}

/** Families ranked by last − first rung value (largest fall first), ties by name. */
export function orderFamilies(fams: Model[][], metric: Metric): Model[][] {
  const rank = ladderChange(metric);
  return [...fams].sort((a, b) => rank(a) - rank(b) || a[0].family.localeCompare(b[0].family));
}

export function LadderGrid({ fams, metric }: { fams: Model[][]; metric: Metric }) {
  const phone = usePhone();
  const domain = sharedDomain(fams, metric);
  const ci = metric.ciKey ? (m: Model) => ciBounds(m, metric.ciKey!) : undefined;
  return (
    <div className="small-mult ldr-grid">
      {fams.map((rungs) => (
        <div key={rungs[0].family} className="cell-plate">
          <h3>
            <Link to={`/?family=${encodeURIComponent(rungs[0].family)}&view=ladders`}>{rungs[0].family}</Link>
          </h3>
          <LadderChart rungs={rungs} metric={metric} domain={domain} height={phone ? 110 : 130} compact hideTitle labelEnds ci={ci} />
        </div>
      ))}
    </div>
  );
}
