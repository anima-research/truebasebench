/**
 * Method constants: definitions, not measurements.
 * Ramps mirror RAMPS in docs/vh_truebase.py; surname frames mirror SURNAME_PROMPTS in docs/vh_score.py.
 * Tests (src/test/method.test.ts) keep both in sync with the scripts and with bundle.reference.* when present.
 */
import type { SubKey } from "./types";

/** feature -> [value that scores 1, value that scores 0] */
export const RAMPS: Record<SubKey, [number, number]> = {
  calib: [0.0, -0.1],
  spread: [0.015, 0.1],
  memo: [0.02, 0.12],
  prior: [0.0, 0.4],
};

/** Feature lookup order per sub-score: first non-null wins. */
export const SOURCES: Record<SubKey, string[]> = {
  calib: ["F_calib_gap", "calib_gap"],
  spread: ["F_gap_domain_absmean", "calib_gap_domain_absmean"],
  memo: ["X_runfrac_wiki", "verbatim_run_frac_wiki"],
  prior: ["roll_instr_marker_rate"],
};

export const SUB_META: Record<
  SubKey,
  { name: string; short: string; feature: string; unit: "nats" | "share"; readsAs: string; clipPositive?: boolean }
> = {
  calib: {
    name: "Calib",
    short: "C",
    feature: "F_calib_gap",
    unit: "nats",
    readsAs: "over-confidence; pre-anneal checkpoints sit near 0",
    clipPositive: true,
  },
  spread: {
    name: "Spread",
    short: "S",
    feature: "F_gap_domain_absmean",
    unit: "nats",
    readsAs: "miscalibration spreading across genres",
  },
  memo: {
    name: "Memo",
    short: "M",
    feature: "X_runfrac_wiki",
    unit: "share",
    readsAs: "recitation of the anneal mix",
  },
  prior: {
    name: "Prior",
    short: "P",
    feature: "roll_instr_marker_rate",
    unit: "share",
    readsAs: "instruction-shaped prior",
  },
};

/** Verbatim-run rule (docs/vh_memo.py): runs of >= RUN_MIN_LEN tokens with top-1 = real and H < RUN_H_MAX. */
export const RUN_MIN_LEN = 16;
export const RUN_H_MAX = 0.2;

/** Entropy threshold of the own-sample collapse feature roll_frac_H<0.1 (docs/vh_analyze.py). */
export const ROLL_H_LOW = 0.1;

/** Number of US Census 2010 surnames used as the in-Census reference for junk share. */
export const CENSUS_SURNAMES = 162253;

export const SURNAME_PROMPTS: Record<string, string> = {
  pop: "Below is a list of 100 American surnames drawn at random from the U.S. population, so common surnames appear more often than rare ones. The list is in random order, not alphabetical.\n\n1.",
  census:
    "Random sample of 100 U.S. last names, drawn in proportion to their frequency in the 2010 Census, listed in the order they were drawn:\n\n1.",
  plain: "Here are the last names of 100 randomly chosen Americans, in no particular order:\n\n1.",
  fewshot1:
    "Last names of six randomly selected U.S. residents:\n\n1. Collins\n2. Johnson\n3. Whitaker\n4. Matias\n5. Trujillo\n6. Oneill\n7.",
  fewshot2:
    "Last names of six randomly selected U.S. residents:\n\n1. Watson\n2. Rubio\n3. Adkins\n4. Beltz\n5. Evans\n6. Carlson\n7.",
  fewshot3:
    "Last names of six randomly selected U.S. residents:\n\n1. Graham\n2. Brock\n3. Calderon\n4. Medina\n5. Danforth\n6. Morris\n7.",
};

export const SURNAME_FRAMES = {
  desc: ["pop", "census", "plain"],
  few: ["fewshot1", "fewshot2", "fewshot3"],
};

/** Named method constants addressable from markdown as {{def:NAME|fmt}}. */
export const METHOD_DEFS: Record<string, number> = {
  RUN_MIN_LEN,
  RUN_H_MAX,
  CENSUS_SURNAMES,
  "calib.one": RAMPS.calib[0],
  "calib.zero": RAMPS.calib[1],
  "spread.one": RAMPS.spread[0],
  "spread.zero": RAMPS.spread[1],
  "memo.one": RAMPS.memo[0],
  "memo.zero": RAMPS.memo[1],
  "prior.one": RAMPS.prior[0],
  "prior.zero": RAMPS.prior[1],
};
