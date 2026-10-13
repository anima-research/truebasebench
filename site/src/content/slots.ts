/**
 * The named slots each markdown page in src/content may use. The pages build their BlockMap / ValueMap with exactly
 * these keys (typed), and src/test/content.test.ts checks that every slot in the markdown is provided and that every
 * provided figure is placed somewhere.
 */
export const FINDING_IDS = ["f1", "f2", "f3", "f4", "f5", "f6"] as const;
export const FINDINGS_PLATES = [
  "ladder-calib",
  "ladder-calib-families",
  "anneal-profiles",
  "subscore-matrix",
  "gap-prior",
  "collapse-strip",
  "surname-kl",
  "ladder-surname-kl",
  "tail-arrows",
  "tail-strip",
  "ladders",
] as const;
export type FindingsPlate = (typeof FINDINGS_PLATES)[number];
/** f1-claim, f1-detail, f1-readoff, ... (detail is optional per finding) */
export const FINDINGS_BLOCKS: string[] = [...FINDINGS_PLATES, ...FINDING_IDS.flatMap((f) => [`${f}-claim`, `${f}-detail`, `${f}-readoff`])];

export const METHODOLOGY_BLOCKS = ["anchors"] as const;
export const METHODOLOGY_VALUES = ["pre-band", "pre-domain-min", "spec-a", "spec-b", "spec-a-gap", "spec-b-gap"] as const;
export type MethodologyValue = (typeof METHODOLOGY_VALUES)[number];

export const MEASURE_BLOCKS = ["corpora", "datacontract"] as const;

export const ABOUT_BLOCKS = ["citation"] as const;
export const ABOUT_VALUES = ["bundle"] as const;
