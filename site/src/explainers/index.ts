/**
 * Explainer registry: the mounting point for the Methodology animations (DESIGN §8).
 * Each entry is lazily imported so it is code-split away from the leaderboard. See README.md for the contract and
 * the shared kit in ./kit. Ids missing from the registry render a labelled "pending" slot on /methodology.
 */
import { lazy } from "react";
import type { ExplainerComponent, ExplainerId } from "./types";

export type ExplainerRegistry = Partial<Record<ExplainerId, ExplainerComponent>>;

export const registry: ExplainerRegistry = {
  position: lazy(() => import("./position")),
  "teacher-forcing": lazy(() => import("./teacherForcing")),
  "calibration-gap": lazy(() => import("./calibrationGap")),
  "verbatim-runs": lazy(() => import("./verbatimRuns")),
  surnames: lazy(() => import("./surnames")),
  score: lazy(() => import("./score")),
};

export { EXPLAINER_IDS, EXPLAINER_TITLES } from "./types";
export type { ExplainerId, ExplainerProps, ExplainerComponent } from "./types";
