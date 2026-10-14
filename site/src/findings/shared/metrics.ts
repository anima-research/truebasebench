/** Metrics (FindingCharts `Metric`) shared by F1, F5 and the Ladders section. */
import type { Metric } from "../../charts/FindingCharts";
import { fp, get, path } from "../../data/bundle";
import type { Bundle } from "../../data/types";
import { isNum } from "../../lib/numfmt";

export function gapMetric(band?: number): Metric {
  return {
    key: "gap",
    name: "calibration gap",
    value: (m) => fp(m, "F_calib_gap"),
    pathOf: (m) => path(m, "fingerprint.F_calib_gap"),
    fmtKind: "gap",
    axis: "calibration gap on post-cutoff text, mean(H − s), nats",
    zero: true,
    band,
    ciKey: "calib_gap",
    deltaFmt: "signed",
  };
}

export const klMetric: Metric = {
  key: "kl",
  name: "few-shot surname KL",
  value: (m) => get(m, "surnames.KL_few"),
  pathOf: (m) => path(m, "surnames.KL_few"),
  fmtKind: "kl",
  axis: "KL(Census‖model), few-shot frames, nats",
  zero: true,
  ciKey: "KL_few",
  deltaFmt: "signed",
};

export const eceMetric: Metric = {
  key: "ece",
  name: "ECE",
  value: (m) => get(m, "selfboot.reliability.ECE"),
  pathOf: (m) => path(m, "selfboot.reliability.ECE"),
  fmtKind: "num3",
  axis: "expected calibration error of top-1, post-cutoff text",
  zero: true,
  ciKey: "ECE",
  deltaFmt: "signed",
};

export function effMetric(bundle: Bundle): Metric {
  return {
    key: "eff",
    name: "exp(H_few)",
    value: (m) => (isNum(get(m, "surnames.H_few")) ? Math.exp(get(m, "surnames.H_few")!) : null),
    pathOf: (m) => `exp(${path(m, "surnames.H_few")})`,
    fmtKind: "eff",
    axis: "effective number of surnames, exp(H_few), linear",
    ref: isNum(bundle.reference.census_entropy_top2000) ? { value: Math.exp(bundle.reference.census_entropy_top2000), label: "Census, top 2,000" } : undefined,
  };
}

/** The Ladders plate's switchable metrics, keyed as the switch labels them. */
export function ladderMetrics(band?: number): Record<"gap" | "kl" | "ece", Metric> {
  return { gap: gapMetric(band), kl: klMetric, ece: eceMetric };
}
