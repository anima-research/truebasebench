/** Short descriptions for fingerprint keys and bundle fields (model page §7, Measure data contract). */
import { domainName } from "./derive";

const G: Record<string, string> = {
  chars_per_tok: "characters per token on the Pile pass",
  CE_tok: "cross-entropy per token, Pile (nats)",
  CE_char: "cross-entropy per character, Pile (nats)",
  H_tok: "mean entropy per token, Pile (nats)",
  H_char: "mean entropy per character, Pile (nats)",
  calib_gap: "calibration gap mean(H − s), Pile (nats)",
  H_over_s: "mean H / mean s, Pile",
  "frac_H<0.1": "share of positions with H < 0.1, Pile",
  "frac_p1>0.99": "share of positions with top-1 p > 0.99, Pile",
  "frac_H>3": "share of positions with H > 3, Pile",
  "Vmed|H1-2": "median varentropy where 1 ≤ H < 2",
  "Vmed|H2-3": "median varentropy where 2 ≤ H < 3",
  "Vmed|H3-4": "median varentropy where 3 ≤ H < 4",
  "V/H|H>1": "mean V/H where H > 1, Pile",
  "H_pos<64": "mean H in the first 64 positions",
  "H_pos>512": "mean H after position 512",
  H_ctx_drop: "entropy drop from early to late context",
  CE_web: "cross-entropy on Pile-CC web text",
  "CE_wiki/web": "Wikipedia CE relative to web CE",
  "CE_github/web": "GitHub CE relative to web CE",
  "CE_stackex/web": "StackExchange CE relative to web CE",
  "CE_pubmed/web": "PubMed CE relative to web CE",
  calib_gap_domain_min: "most negative per-domain gap, Pile",
  calib_gap_domain_absmean: "mean |per-domain gap|, Pile",
  verbatim_run_frac: "share of Pile tokens in verbatim runs",
  verbatim_run_frac_wiki: "share of Pile Wikipedia tokens in verbatim runs (24 docs)",
  verbatim_run_frac_nocode: "share of non-code Pile tokens in verbatim runs",
  "doc_CE_p5/med": "5th-percentile document CE / median",
  "frac_docs_CE<0.33med": "share of documents with CE below a third of the median",
  "frac_s>8": "share of real tokens with surprisal > 8",
  roll_H_bos: "mean entropy of own samples from bare BOS",
  roll_V_bos: "mean varentropy of own samples from bare BOS",
  "roll/TF_H": "own-sample H / teacher-forced H",
  roll_H_q1: "own-sample H, first quarter of steps",
  roll_H_q4: "own-sample H, last quarter of steps",
  roll_H_slope: "own-sample H change, q4 − q1",
  "roll_frac_H<0.1": "share of own-sample steps with H < 0.1",
  roll_rep8_q4: "8-gram repetition in the last quarter of own samples",
  roll_seqH_std: "std of per-sequence mean H in own samples",
  "W1(TF_H, roll_H)": "Wasserstein-1 between teacher-forced and own-sample H",
  "W1(TF_V, roll_V)": "Wasserstein-1 between teacher-forced and own-sample V",
  roll_H_open: "mean H of samples continued from document openers",
  "W1(TF_H, open_H)": "Wasserstein-1 between teacher-forced and opener-continuation H",
  roll_instr_marker_rate: "share of bare-BOS samples with chat/instruction markers",
  roll_instr_marker_rate_open: "share of opener samples with chat/instruction markers",
  X_CE_wiki: "cross-entropy, Wikipedia (150 docs)",
  X_gap_wiki: "calibration gap, Wikipedia",
  X_runfrac_wiki: "share of Wikipedia tokens inside verbatim runs",
  "X_docCE_p10/med_wiki": "10th-percentile doc CE / median, Wikipedia",
  "X_frac_docs_CE<0.33med_wiki": "share of very-low-CE Wikipedia docs",
  X_CE_gh: "cross-entropy, GitHub (60 docs)",
  X_gap_gh: "calibration gap, GitHub",
  X_runfrac_gh: "share of GitHub tokens inside verbatim runs",
  "X_docCE_p10/med_gh": "10th-percentile doc CE / median, GitHub",
  "X_frac_docs_CE<0.33med_gh": "share of very-low-CE GitHub docs",
  "X_CE_wiki/web": "Wikipedia CE relative to Pile web CE",
  F_CE: "cross-entropy on post-cutoff text (nats)",
  F_H: "mean entropy on post-cutoff text (nats)",
  F_calib_gap: "calibration gap mean(H − s), post-cutoff text",
  F_H_over_s: "mean H / mean s, post-cutoff text",
  F_gap_domain_min: "most negative per-domain gap, post-cutoff",
  F_gap_domain_absmean: "mean |per-domain gap|, post-cutoff",
  F_verbatim_run_frac: "share of post-cutoff tokens in verbatim runs",
  "F_frac_H<0.1": "share of post-cutoff positions with H < 0.1",
  "F_V/H|H>1": "mean V/H where H > 1, post-cutoff",
};

export function describe(key: string): string | null {
  if (G[key]) return G[key];
  if (key.startsWith("F_CE_")) {
    const d = domainName(key);
    return d ? `cross-entropy on post-cutoff ${d}` : null;
  }
  if (key.startsWith("F_gap_")) {
    const d = domainName(key);
    return d ? `calibration gap on post-cutoff ${d}` : null;
  }
  return null;
}

export const FIELD_DOCS: Record<string, string> = {
  id: "unique checkpoint id",
  family: "model family (ladder)",
  stage: "pre-anneal | anneal | base | post-trained",
  label: "human label of the rung",
  order: "position within the family ladder",
  score: "overall: mean of available sub-scores",
  subscores: "calib, spread, memo, prior → {score, value, source}",
  fingerprint: "all scalar features (teacher-forced, wiki/GitHub, post-cutoff, own samples)",
  surnames: "surname test: KL, entropy, top-10 mass, sampled-list stats",
  weird: "rare-genre Pile pass: genre → [gap, verbatim share, CE]",
  selfboot: "reliability (top-1, post-cutoff) and own-sample lexical stats",
  tail: "tail statistics per pass (tf, tf_fresh, tf_weird)",
  params: "optional {total_b, active_b}",
};

export const GROUPS: { name: string; test: (k: string) => boolean }[] = [
  { name: "Post-cutoff (F_)", test: (k) => k.startsWith("F_") },
  { name: "Wikipedia / GitHub (X_)", test: (k) => k.startsWith("X_") },
  { name: "Own samples (roll_, W1)", test: (k) => k.startsWith("roll") || k.startsWith("W1(") },
  { name: "Pile teacher-forced", test: () => true },
];
