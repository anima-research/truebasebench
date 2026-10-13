# Explainers: mounting point

The Methodology page (`/methodology`) renders `src/content/methodology.md`. A line of the form

```
{{explainer:<id>}}
```

mounts `registry[<id>]` from `src/explainers/index.ts`. An id with no registry entry renders a labelled
"not yet mounted" slot, so the page works before any explainer exists.

## Ids

| id | anchor | DESIGN.md |
|---|---|---|
| `position` | `#position` | §8 (a) One position: H, V, s |
| `teacher-forcing` | `#teacher-forcing` | §8 (b) Teacher forcing vs own samples |
| `calibration-gap` | `#calibration-gap` | §8 (c) The calibration gap |
| `verbatim-runs` | `#verbatim-runs` | §8 (d) Verbatim runs |
| `surnames` | `#surnames` | §8 (e) The surname test |
| `score` | `#score` | §8 (f) Four ramps, one score |

The anchors are the `##` headings in `methodology.md`; keep them when editing the copy.

## Component contract

```ts
import type { ExplainerProps } from "./types";
// ExplainerProps = { bundle: Bundle; reducedMotion: boolean }
export default function Position({ bundle, reducedMotion }: ExplainerProps) { ... }
```

Register it lazily so it is code-split away from the leaderboard:

```ts
// src/explainers/index.ts
import { lazy } from "react";
export const registry: ExplainerRegistry = {
  position: lazy(() => import("./position")),
};
```

Rules (DESIGN §8–§10):

- **Props.** `bundle` is the loaded, validated bundle (`src/data/types.ts`). `reducedMotion` is true under
  `prefers-reduced-motion: reduce` or the site's Reduce motion toggle. When it is true: no autoplay, all
  durations 0, render final states, Step and the step list still work instantly.
- **Numbers.** Every number comes from `bundle` (read with `get()` / `path()` in `src/data/bundle.ts`) or from
  `src/data/method.ts`, and is rendered with `<Num>` (`src/components/Num.tsx`) or formatted with
  `src/lib/numfmt.ts`. Never type a measurement.
- **Specimens.** Choose default models with the rules in `src/data/derive.ts` (`specimenPair`,
  `collapseSpecimen`, `memoTriple`, `rampSpecimen`, `sameScorePair`, `recipeTrio`, `preAnnealBand`), never
  by hardcoded id. Skip models whose required fields are null.
- **Kit.** Use `Plate`, `SourceLine`, `DataTable`, `Glyph`/`GlyphShape`, `ChartFrame`/`Mark`, `XAxis`/`YAxis`,
  `ScoreBar`, `RampCell`, `DivergingBar` from `src/components/`. Colours only from CSS tokens
  (`var(--ink)`, `var(--st-pre)`, …) so both themes work without chart code.
- **Motion.** Discrete steps with a transport (play/pause, step back/forward, replay, "step k of n"),
  play once when ≥ 50% visible for 400 ms, hold the final state, pause off-screen or when
  `document.hidden`, `aria-live="polite"` step summary. Constructed or schematic shapes carry a visible
  `constructed` / `schematic` label in the figure.
- **Self-contained.** An explainer renders its own band content (kicker, figure, step list, caption,
  SourceLine, Data disclosure). The page provides the `##` heading and anchor around it.
- **Errors.** A thrown error is caught by the slot and shown as a one-line note; the page keeps working.

## Implementation (v1)

All six ids are registered in `index.ts` (lazy, one chunk each). Review them together at **`/explainers`**
(`src/pages/ExplainersReview.tsx`, not linked from the navigation; its "Final frames" switch renders them as under
reduced motion without touching the site setting).

| id | file | default specimens (§6.4 rule) |
|---|---|---|
| `position` | `position.tsx` | `specimenPair` A / B |
| `teacher-forcing` | `teacherForcing.tsx` | `collapseSpecimen` vs A |
| `calibration-gap` | `calibrationGap.tsx` | A / B; ladder = `specimenFamily`, dashed = next family with a pre-anneal rung; band = `preAnnealBand` |
| `verbatim-runs` | `verbatimRuns.tsx` | `memoTriple` |
| `surnames` | `surnames.tsx` | A / B; clean KL range from `f5()` in `src/findings.ts` |
| `score` | `score.tsx` | `rampSpecimen`, compare = its `sameScorePair` partner (`recipeTrio` fallback) |

Shared kit in `kit/`:

- `useStepper(durations, reducedMotion)`: the one driver. Discrete steps, `t` = progress of the current step,
  `at(k)` = 1 / t / 0 for past / current / later steps. Autoplays once when ≥ 50% of the figure (or half the viewport)
  has been visible for 400 ms, suspends off-screen and while `document.hidden`, holds the final state. Reduced
  motion: starts on the final state, `t` is always 1, Play dwells 1.5 s per state with no tweening.
- `Shell.tsx`: `ExplainerShell` (plate label, standfirst, figure, Transport, picker, step list, caption, SourceLine,
  Data disclosure, "Numbers in this plate", `aria-live` step summary; Space / ← / → when the figure has focus) and `Tag`
  (the visible `constructed` / `schematic` / `illustrative` label).
- `Picker.tsx` (`ModelPicker`: computed presets + one select per slot), `RampPlot.tsx` (transfer function with
  animatable layers and an optional draggable `role="slider"` glyph), `construct.ts` (p_k ∝ r^k with entropy = F_H),
  `anim.ts` (easing tokens, stagger, seeded PRNG), `num.tsx` (`<N>` and plain-text formatting helpers),
  `InlineGlyph.tsx`, `explainers.css`.

Optional bundle blocks used when present: `explainers.position` (measured top-16 replaces the construction),
`reference.passes` (pass sizes on the chips), `reference.surname_frames` (prompt card text), `surnames.top_names` /
`logp_top50` (per-name chart). Tests: `src/test/explainers.test.ts` (construction, run rule, tape counts, and a server
render of every explainer on the shipped bundle, with a fully-null model added, and with optional blocks stripped).
