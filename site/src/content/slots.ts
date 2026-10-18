/**
 * The named slots each markdown page in src/content may use. The pages build their BlockMap / ValueMap with exactly
 * these keys (typed), and src/test/content.test.ts checks that every slot in the markdown is provided and that every
 * provided figure is placed somewhere.
 */
export const FINDING_IDS = ["f1", "f2", "f3", "f4", "f5", "f6", "f7"] as const;
export const FINDINGS_PLATES = [
  "ladder-calib",
  "anneal-moves",
  "anneal-profiles",
  "gap-strip",
  "collapse-strip",
  "surname-kl",
  "surname-top10",
  "ladder-surname-kl",
  "tail-arrows",
  "tail-hiH-arrows",
  "tail-reliability",
  "prior-exact",
  "ood-noise",
  "ladders",
] as const;
export type FindingsPlate = (typeof FINDINGS_PLATES)[number];
/** f1-claim, f1-detail, f1-readoff, ... (detail is optional per finding) */
export const FINDINGS_BLOCKS: string[] = [...FINDINGS_PLATES, ...FINDING_IDS.flatMap((f) => [`${f}-claim`, `${f}-detail`, `${f}-readoff`])];

export const METHODOLOGY_BLOCKS = ["anchors", "quant-pairs", "probes", "temp", "pit"] as const;
export const METHODOLOGY_VALUES = [
  "pre-band", "pre-domain-min", "spec-a", "spec-b", "spec-a-gap", "spec-b-gap",
  "n-scored", "scored-list", "rho-memo", "n-memo", "rho-kl", "n-kl",
  "quant-control", "quant-release", "quant-control-gap", "quant-release-gap", "quant-delta",
  "recite-anchor", "recite-elevated-anchor", "recite-list", "recite-n", "memo-verdict", "kl-verdict",
  "temp-a", "temp-b", "temp-a-C", "temp-b-C", "temp-a-range", "temp-base-range", "temp-base-tstar", "temp-n-base", "temp-post-range", "temp-n-post", "temp-n-bound",
  "pit-best", "pit-best-ks", "pit-a-ks", "pit-b-ks", "pit-base-range", "pit-n-base", "pit-post-range", "pit-n-post", "pit-base-q10", "pit-post-q90", "pit-base-q", "pit-post-q", "pit-ci-half",
] as const;
export type MethodologyValue = (typeof METHODOLOGY_VALUES)[number];

export const MEASURE_BLOCKS = ["corpora", "datacontract"] as const;

export const ABOUT_BLOCKS = ["citation"] as const;
export const ABOUT_VALUES = ["bundle"] as const;
