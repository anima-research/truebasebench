/** Types for the bench bundle (docs/SPEC.md, "Data contract"). Every block may be null. */

export type Stage = "pre-anneal" | "anneal" | "base" | "post-trained";
export const STAGES: Stage[] = ["pre-anneal", "anneal", "base", "post-trained"];

export type SubKey = "calib" | "spread" | "memo" | "prior";
export const SUB_KEYS: SubKey[] = ["calib", "spread", "memo", "prior"];

export interface SubScore {
  score: number | null;
  value: number | null;
  source: string | null;
  /** score v1 (bundle v7+): false = validation probe, computed with its ramp but not a term of the overall. Absent = scored (v0). */
  scored?: boolean;
}

/** [lo, hi, count, mean_confidence, accuracy] */
export type ReliabilityBin = [number, number, number, number | null, number | null];

export interface Reliability {
  ECE?: number | null;
  top1_acc?: number | null;
  mean_p1?: number | null;
  "frac_p1>0.9"?: number | null;
  "acc_minus_conf_p1>0.9"?: number | null;
  bins?: ReliabilityBin[] | null;
  [k: string]: unknown;
}

export interface Lexical {
  ttr?: number | null;
  hapax?: number | null;
  distinct4?: number | null;
  zipf_slope?: number | null;
  gzip_ratio?: number | null;
  [k: string]: unknown;
}

export interface TailPass {
  "s>7"?: number | null;
  "s>10"?: number | null;
  "rank>100"?: number | null;
  "rank>1000"?: number | null;
  CE?: number | null;
  H?: number | null;
  s_p99?: number | null;
  gap_hiH?: number | null;
  [k: string]: number | null | undefined;
}

export type TailKey = "tf" | "tf_fresh" | "tf_weird";

export interface TopName {
  name: string;
  p_census?: number | null;
  p_desc?: number | null;
  p_few?: number | null;
}

export interface Surnames {
  KL_desc?: number | null;
  KL_few?: number | null;
  H_desc?: number | null;
  H_few?: number | null;
  H_r?: number | null;
  top10_desc?: number | null;
  top10_few?: number | null;
  top10_r?: number | null;
  smith_plain?: number | null;
  junk?: number | null;
  distinct?: number | null;
  surpr?: number | null;
  top_names?: TopName[] | null;
  /** name -> log P(name | frame); flat, or keyed by frame. Optional. */
  logp_top50?: Record<string, number> | Record<string, Record<string, number>> | null;
  [k: string]: unknown;
}

/** A statistic with a 95% bootstrap interval (ci95) or a min/max over frames (range). */
export interface Interval {
  value: number | null;
  ci95?: [number | null, number | null];
  range?: [number | null, number | null];
  n_docs?: number;
  n?: number;
  n_frames?: number;
  [k: string]: unknown;
}
/** keys as written by docs/vh_boot.py: calib_gap, spread, ECE, memo_wiki, tail_ratio2..4, prior_marker, KL_few, KL_desc */
export type CI = Record<string, Interval>;

/** [mean predicted tail mass, mean realised rate, positions] per quartile of predicted mass */
export type TailBin = [number | null, number | null, number | null];

/** Predicted tail mass vs realised rate on one corpus (docs/vh_tailmass.py). */
export interface TailStats {
  n?: number | null;
  CE?: number | null;
  H?: number | null;
  gap?: number | null;
  pred2?: number | null;
  real2?: number | null;
  ratio2?: number | null;
  pred3?: number | null;
  real3?: number | null;
  ratio3?: number | null;
  pred4?: number | null;
  real4?: number | null;
  ratio4?: number | null;
  bins2?: TailBin[] | null;
  bins3?: TailBin[] | null;
  bins4?: TailBin[] | null;
  [k: string]: unknown;
}

/** Exact prior mass on chat/instruction openers after the start token. */
export interface Prior {
  /** template name -> log P(opener | start) */
  logp: Record<string, number | null>;
  instr_logmass?: number | null;
  ctrl_logmass?: number | null;
  instr_mass?: number | null;
  ctrl_mass?: number | null;
  instr_max?: number | null;
  instr_argmax?: string | null;
  [k: string]: unknown;
}

/** genre -> [gap, verbatim share, CE] */
export type Weird = Record<string, [number | null, number | null, number | null] | null>;

export interface Model {
  id: string;
  family: string;
  stage: Stage;
  label: string;
  order: number;
  score: number | null;
  subscores: Record<SubKey, SubScore | null>;
  fingerprint: Record<string, number | null> | null;
  surnames: Surnames | null;
  weird: Weird | null;
  selfboot: { reliability?: Reliability | null; lexical?: Lexical | null } | null;
  tail: Partial<Record<TailKey, TailPass | null>> | null;
  /** bootstrap intervals (bundle v6+; absent in older bundles) */
  ci?: CI | null;
  tailmass?: TailStats | null;
  prior?: Prior | null;
  /** OOD genre -> tail stats (plus "ALL") */
  ood?: Record<string, TailStats | null> | null;
  params?: { total_b?: number | null; active_b?: number | null } | null;
  [k: string]: unknown;
}

export interface Reference {
  census_entropy_top2000?: number | null;
  census_self_entropy_all?: number | null;
  pile_lexical?: Lexical | null;
  ramps?: Record<string, [number, number]> | null;
  method?: { run_min_len?: number; run_H_max?: number; marker_list?: string[] } | null;
  surname_frames?: { desc?: string[]; few?: string[] } | null;
  /** 0 (absent, bundles v1–v6: all four sub-scores in the mean) or 1 (calib, spread, prior; memo is a probe) */
  score_version?: number | null;
  scored_subscores?: SubKey[] | null;
  /** template name -> {set: instr|ctrl, text} for the prior probe */
  prior_openers?: Record<string, { set: "instr" | "ctrl"; text: string }> | null;
  passes?: Record<string, unknown> | null;
  [k: string]: unknown;
}

export interface Bundle {
  schema_version: number;
  generated: string;
  n_models: number;
  reference: Reference;
  models: Model[];
  explainers?: Record<string, unknown> | null;
  [k: string]: unknown;
}

export interface ManifestEntry {
  file: string;
  schema_version?: number;
  generated?: string;
  n_models?: number;
}

export interface Manifest {
  manifest_version?: number;
  latest?: string;
  bundles: (ManifestEntry | string)[];
}

/** A loaded bundle plus where it came from. */
export interface LoadedBundle {
  bundle: Bundle;
  file: string;
  url: string;
  /** true when the live source failed and the repo copy is shown */
  fallback: boolean;
}
