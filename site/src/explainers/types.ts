import type { ComponentType } from "react";
import type { Bundle } from "../data/types";

/** The six explainer ids, matching the Methodology anchors (DESIGN §7.3, §8). */
export const EXPLAINER_IDS = ["position", "teacher-forcing", "calibration-gap", "verbatim-runs", "surnames", "score"] as const;
export type ExplainerId = (typeof EXPLAINER_IDS)[number];

export const EXPLAINER_TITLES: Record<ExplainerId, string> = {
  position: "One position: entropy, varentropy, surprisal",
  "teacher-forcing": "Teacher forcing on a fixed corpus vs the model's own samples",
  "calibration-gap": "The calibration gap, and why pre-anneal checkpoints sit at zero",
  "verbatim-runs": "Verbatim runs: recitation of the anneal mix",
  surnames: "The surname test: described vs few-shot frames",
  score: "Four ramps, one score",
};

/** Component contract: see src/explainers/README.md. */
export interface ExplainerProps {
  /** the loaded, validated bundle; every number shown must come from here or src/data/method.ts */
  bundle: Bundle;
  /** true under prefers-reduced-motion or the site's Reduce motion toggle: render final states, no autoplay */
  reducedMotion: boolean;
}

export type ExplainerComponent = ComponentType<ExplainerProps>;
