/**
 * Plate L's switchable metrics, in switch order, with the one-sentence caption each one prints. Owner: Ladders.
 * `gap` (the default) absorbs the former Plate F1b; `hih` is F6's gap at H > 4 with its ± BASE_HIH_ZERO band.
 */
import type { Metric } from "../../../charts/FindingCharts";
import { get, path } from "../../../data/bundle";
import { FINDING_DEFS } from "../../../findings";
import { eceMetric, gapMetric, klMetric } from "../../shared/metrics";

export const METRIC_KEYS = ["gap", "hih", "kl", "ece"] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];
export const DEFAULT_METRIC: MetricKey = "gap";
export const isMetricKey = (s: string | null | undefined): s is MetricKey => METRIC_KEYS.includes(s as MetricKey);

/** F6's gap where the model is uncertain: tail.tf_fresh.gap_hiH, band ± BASE_HIH_ZERO, no interval in the bundle. */
export const hiHMetric: Metric = {
  key: "hih",
  name: "gap at H > 4",
  value: (m) => get(m, "tail.tf_fresh.gap_hiH"),
  pathOf: (m) => path(m, "tail.tf_fresh.gap_hiH"),
  fmtKind: "gap",
  axis: "calibration gap at positions with H > 4 nats, post-cutoff text, nats",
  zero: true,
  band: FINDING_DEFS.BASE_HIH_ZERO,
  deltaFmt: "signed",
};

export interface LadderMetric {
  key: MetricKey;
  /** switch button text */
  label: string;
  metric: Metric;
  /** bundle field the plate reads (SourceLine, Data) */
  source: string;
  /** `ci.<key>` field carrying the interval, when the bundle has one */
  ciSource?: string;
  /** what the whiskers are: '95% CI' (ci95) or 'range' (over frames) */
  ciLabel?: string;
}

export function ladderMetricList(band?: number): LadderMetric[] {
  return [
    { key: "gap", label: "Calibration gap", metric: gapMetric(band), source: "fingerprint.F_calib_gap", ciSource: "ci.calib_gap.ci95", ciLabel: "95% CI" },
    { key: "hih", label: "Gap at H > 4", metric: hiHMetric, source: "tail.tf_fresh.gap_hiH" },
    { key: "kl", label: "Few-shot surname KL", metric: klMetric, source: "surnames.KL_few", ciSource: "ci.KL_few.range", ciLabel: "range" },
    { key: "ece", label: "ECE", metric: eceMetric, source: "selfboot.reliability.ECE", ciSource: "ci.ECE.ci95", ciLabel: "95% CI" },
  ];
}
