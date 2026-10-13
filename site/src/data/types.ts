/** Types for the bench bundle (docs/SPEC.md, "Data contract"). Every block may be null. */

export type Stage = "pre-anneal" | "anneal" | "base" | "post-trained";
export const STAGES: Stage[] = ["pre-anneal", "anneal", "base", "post-trained"];

export type SubKey = "calib" | "spread" | "memo" | "prior";
export const SUB_KEYS: SubKey[] = ["calib", "spread", "memo", "prior"];

export interface SubScore {
  score: number | null;
  value: number | null;
  source: string | null;
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
