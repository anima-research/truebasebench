# True Base Bench — design brief (v1)

**True Base Bench, by Anima Labs.** This file is the single design source for the site. If it conflicts with `docs/SPEC.md`, SPEC.md wins for *what* is measured and shipped; this file wins for *how it looks, moves and reads*. Change this file before you build something that departs from it.

---

## 0. Decision

Two directions were proposed: **A, "Monograph"** (a typeset research report with scroll-driven explainers and provenance shown as citations) and **B, "Strip Chart"** (an observatory instrument with the leaderboard first, plates with a transport bar, and every mark to scale).

**Winner: B, "Strip Chart".** Grafts from A are listed below.

Why B wins:
- **Leaderboard as the product.** A researcher citing the bench lands on the readings. B's ladder strip, its Ranked/Ladders views and its raw-feature-on-ramp cells are the densest legible presentation in either brief.
- **Explainers grounded in v1 data.** B draws its explainers from fields that already exist. Plate A uses a distribution constructed so that its H equals `F_H` and its s equals `F_CE`. The teacher-forcing histogram fills to the real `selfboot.reliability.bins` counts. The surname dot field thins to the real `exp(H)`. The run tape fills to the real `X_runfrac_wiki`. A's explainers (a) and (b) mostly fall back to unlabelled schematics until new bundle fixtures exist.
- **Honest axes.** For the gap range of +0.016 to −0.917, B's linked lens panel is more honest than A's piecewise axis with a break. SPEC asks for charts to scale.
- **Feasibility.** A plate with discrete steps and a transport bar is far easier to build and test in Vite + TS than sticky scrollytelling. It also works at 400px without a 48vh sticky figure fighting the scroll.

Grafted from A:
1. **Visible provenance.** Every live number is a `<Num>` with a dotted underline. Hover or focus pops out its exact bundle path and raw value. Every plate ends with a `Source:` line. A's "nothing is hardcoded, and you can see it" device becomes the house signature.
2. **The margin column.** On reading pages at ≥1100px there is a 280px margin for sidenotes, narrow captions and provenance pop-outs, and step text in the explainers.
3. **Stepped states over a free timeline.** Explainers are lists of discrete states. Every step has a paragraph of prose with `<Num>`s, and all step paragraphs stay readable without motion.
4. **Pedagogical beats.** Entropy as a *balance point* (the fulcrum). Bars dropping onto the surprisal axis. The counter reset and the too-short streak in the run rule. The ball settling onto the ramp. "Same overall, different reasons".
5. **Computed specimens.** Every default model or pair in an explainer is chosen by a rule over the bundle, never by a hardcoded id (§6.4).
6. **Programmatic checks on findings.** Every finding claim has a check. If a future bundle breaks it, a visible **Data note** appears. A claim is never silently left standing.
7. **Model-page details.** A default "compare" sibling, the arithmetic line, an "Explained in Methodology §n" link on every section, and the full fingerprint grouped by prefix.
8. **Surname frames as real text.** Prompt cards show the actual frame strings from `SURNAME_PROMPTS` in `docs/vh_score.py`, and a test keeps them in sync. They are not paraphrases.
9. **Colophon.** The footer prints the bundle provenance: file, schema_version, generated, n_models, n_families.

Rejected from A: scroll-triggered sticky scrollytelling, the progressively filled circle glyphs (a half-filled circle is unreadable at 7px and clashes with "hollow = comparison"), and the piecewise axis. Rejected from B: ±0.02 hardcoded as the band (it is computed now, see §6.4), and the paraphrased surname frame.

---

## 1. Principles

1. **An instrument, not a pitch.** No hero, no gradient, no glass, no illustration, no emoji. Nothing is centred: text is left-aligned and numbers are right-aligned in tables.
2. **Every number points to its source.** Any numeral rendered from data is a `<Num>` that knows its bundle path. Prose never contains a typed measurement. Method constants (ramp anchors, run length 16, H < 0.2, Census reference values) come from `src/method.ts` or `reference.*`, are labelled "definition", and are covered by tests (§12).
3. **To scale or labelled.** Scales are linear unless an axis label says otherwise. A log axis is allowed only with labelled decade ticks and the word "log" in the axis title. There are no broken axes. Extreme ranges use a lens panel.
4. **Colour carries one variable.** Training stage only, always paired with a glyph and a text code. Score bars are monochrome. Diverging values use direction plus the U+2212 sign, never red/green.
5. **Motion only depicts a process from the measurement.** The leaderboard and the model page animate only state changes.
6. **Illustrations say so.** Any element whose *shape* is constructed or schematic (plate A's distribution, plate D's run arrangement, C1's simulated draws) carries a visible label, either `constructed` or `schematic`. It prints no number that does not come from the bundle or `method.ts`.
7. **"Higher is not better".** The score measures distance from a pre-anneal base. Copy and the column header must say so. 1 = indistinguishable from a pre-anneal checkpoint.

---

## 2. Identity tokens

### 2.1 Palette

Tokens are defined on `:root`. The dark set is defined under `@media (prefers-color-scheme: dark)`, guarded by `:root:not([data-theme="light"])`, and again under `:root[data-theme="dark"]`. `body { background: var(--bg); color: var(--ink); }` is set explicitly. Charts read every colour from tokens, so the dark theme needs no chart code.

```css
:root {
  /* paper */
  --bg: #F5F3EE;          /* page */
  --bg-plate: #ECE8DF;    /* figure plates, explainer bands */
  --bg-raised: #FBFAF7;   /* sticky thead, tooltips, menus, prompt cards */
  --ink: #1A1D21;         /* 15.3:1 on bg */
  --ink-2: #4A4F57;       /* secondary text, 7.4:1 */
  --ink-3: #5F646C;       /* ticks, captions, source lines; 5.4:1 bg, 4.9:1 plate */
  --rule: #D8D2C4;        /* hairlines, gridlines (decorative) */
  --rule-strong: #B9B1A0; /* axis lines, null hatch (decorative only, 1.9:1) */
  --control: #5F646C;     /* form-control borders, must meet 3:1 */
  --track: #E3DED3;       /* empty bar track */
  --bar: #2A2E35;         /* score bar fill, monochrome */
  --hl: #F3DD86;          /* highlighter: token/row/rung under study; text on it is --ink only */
  --focus: #0B5CAD;       /* 2px ring, 2px offset; 6.0:1 */
  --link: #0B5CAD;
  --zero: #4A4F57;        /* zero lines, 1px (1.5px on gap axes) */
  --band: rgba(30,122,106,0.12); /* pre-anneal band on gap axes */
  /* stage — marks only, never text */
  --st-pre:  #1E7A6A;  /* verdigris, 4.7:1 */
  --st-anl:  #A86B00;  /* ochre, 4.0:1 */
  --st-base: #3B5B9A;  /* slate blue, 6.0:1 */
  --st-post: #B23A26;  /* brick, 5.4:1 */
}
/* night slate (not pure black) */
--bg #111417; --bg-plate #181C20; --bg-raised #1E2328;
--ink #E8E4DA; --ink-2 #B5B0A5; --ink-3 #8C887F (5.2:1);
--rule #2C3238; --rule-strong #434B53; --control #8C887F; --track #262C31; --bar #DCD7CB;
--hl #5C4E14; --focus #7FB2FF; --link #7FB2FF; --zero #B5B0A5;
--band: rgba(79,191,168,0.14);
--st-pre #4FBFA8; --st-anl #E0A63A; --st-base #8EA8E8; --st-post #F07C62;  /* all ≥ 6.8:1 */
```

Why these stage colours rather than an ordinal ramp: 26 of the 32 v1 checkpoints are `base` or `post-trained`. Slate blue against brick stays far apart (ΔE ≥ 66) under deuteranopia, protanopia and tritanopia simulation. Stage order is already carried by position (strip rows, ladder order). Anneal (ochre) against post (brick) is the weakest pair under deuteranopia (ΔE 16), so shape always backs it.

Text on `--hl` is always `--ink` (in dark mode `--ink-3` on `--hl` fails). Stage colours are never used for text.

### 2.2 Stage glyphs (redundant encoding)

| stage | glyph | code |
|---|---|---|
| pre-anneal | filled circle | PRE |
| anneal | filled diamond | ANL |
| base | filled square | BASE |
| post-trained | filled triangle (apex up) | POST |

- A **hollow** glyph (1.5px stroke, same colour) means a *comparison or ghost*: a sibling, a compare model, or specimen B against A.
- Size is 8px in tables, 7px in charts, and 10px in legends and titles. A single `<Glyph stage hollow size>` SVG component draws all of them.
- An inline legend row (glyph, code and name) appears wherever stage colour appears on a page. The stage name is also always available in text: a table column, an aria-label or a tooltip.

### 2.3 Wordmark and icon

- The wordmark is "True Base Bench" in Source Serif 4, 600, 18px, preceded by a 16px **ramp glyph**: an SVG polyline drawn flat, then slope, then flat, which is the clipped linear ramp. The stroke is 1.5px `--ink`.
- The same glyph, on a transparent background, is the favicon (`favicon.svg`, with a `prefers-color-scheme` style inside).
- A hairline separates the wordmark from "by Anima Labs", set in Plex Sans Condensed 12px `--ink-2` and linking to https://github.com/anima-research. The footer repeats it. There is no other branding.

### 2.4 Other tokens

```
--radius: 2px            (controls only; plates, tables and bars are 0)
--hair: 1px
--space: 4 8 12 16 24 32 48 64
--dur-1: 120ms  (hover, focus, UI)
--dur-2: 180ms  (FLIP row reorder, disclosure)
--dur-step: 160ms (one token step in explainers)
--dur-3: 600ms  (explainer state tween)
--ease-settle: cubic-bezier(.2,0,0,1)   (marks settling)
--ease-inout: cubic-bezier(.65,0,.35,1) (state tweens)
linear for cursors and tapes
```

There are no shadows, gradients or icons, except the stage glyphs, the ramp glyph, a 12px disclosure chevron, the sort triangle and the transport icons (play, pause, step back, step forward, replay, drawn as simple SVG).

---

## 3. Type

All fonts are self-hosted through **Fontsource** npm packages (exact pinned versions, latin subset, `font-display: swap`) and bundled by Vite. There is no runtime font CDN. Preload only Plex Sans Condensed 400 and Source Serif 4 (variable). The total budget is 7 files.

| family | use | fallback |
|---|---|---|
| **Source Serif 4** (variable, opsz; 400, 400 italic, 600) | page titles, finding headlines, prose, step text, wordmark | "Iowan Old Style", Georgia, serif |
| **IBM Plex Sans Condensed** (400, 500, 600) | all UI: tables, nav, ticks, labels, buttons, captions | "Arial Narrow", "Roboto Condensed", system-ui, sans-serif (with a `size-adjust` fallback face to limit layout shift) |
| **IBM Plex Mono** (400, 500) | field paths, model ids, source lines, prompt cards, code, bundle stamp | ui-monospace, "SF Mono", Menlo, Consolas, monospace |

Plex Sans Condensed always sets `font-variant-numeric: tabular-nums lining-nums`. Serif numerals inside prose `<Num>` also switch to tabular lining figures.

Scale (px/line-height):

| size | use |
|---|---|
| 11/14 | ticks, source lines (mono), plate labels |
| 12/16 | captions, table line 2 |
| 13/18 | table body (desktop) |
| 14/20 | UI, phone table, margin notes |
| 17/27 | serif prose, max 64ch (16/26 under 720px) |
| 20/28 | lede, finding standfirst (serif italic) |
| 26/32 | h2, finding headlines (serif 600) |
| 34/40 | h1 and the overall score on the model page |

- **Plate labels** are Plex Sans Condensed 500, 11px, uppercase, letter-spacing 0.08em, `--ink-3`, for example `PLATE C2 · CALIBRATION GAP ALONG THE OLMO-2 LADDER`. Finding kickers use the same style (`F1`), and so do section kickers on reading pages (`§3`).

### 3.1 Number formatting (`src/lib/numfmt.ts`, the only formatter)

| kind | format | example |
|---|---|---|
| overall and sub-scores | 3 decimals | 0.983 |
| gaps, nats, signed quantities | signed, 3 decimals, U+2212 minus, unit in `--ink-3` | −0.917 nats, +0.016 |
| unsigned nats (H, CE, KL) | 2 decimals for KL, 3 for H/CE | KL 2.55; H 1.865 nats |
| shares and rates | percent, 1 decimal; 2 decimals below 1% | 10.2%, 0.19% |
| ratios | ×1.9 |
| counts | thin-space (U+2009) thousands | 1 356 458 |
| exp(H) "effective names" | integer with ≈ | ≈ 757 |
| rank ties | "=" prefix, ties judged on the *displayed* 3-decimal value | =29 |
| null | "—" with `title="not measured for this checkpoint"` |

---

## 4. Layout

### 4.1 Grid

The container has max-width 1280px and is centred in the viewport. Content inside it is left-aligned. Side gutters are 16px under 720px, 24px from 720 to 1099px, and 32px from 1100px up.

Reading pages (Model, Methodology, Findings, Measure) at ≥1100px use named tracks:

```
[rail 176px] 40px [main 640px] 48px [margin 280px]
```

- **rail**: a sticky in-page index (model sections, explainer list, F1–F6, measure steps). The current item has a 2px `--ink` left rule. It is hidden under 1100px and replaced by a horizontal scroll-snapped chip row under the page title.
- **main**: prose, at most 64ch.
- **margin**: sidenotes, narrow captions, `<Num>` provenance pop-outs, definitions and explainer step text.
- **wide** = main + gap + margin (968px), used for plates. Full-bleed is never used.
- From 720 to 1099px, margin notes become inline asides: 14px Plex Sans Condensed `--ink-2`, with a 2px `--rule-strong` left border and a 12px indent.
- Under 720px there is a single column.

The Leaderboard uses the full container width with a 12-column, 24px-gutter grid.

### 4.2 Chrome

- **Top bar** (48px, sticky, `--bg` with a 1px `--rule` bottom border). On the left: the wordmark and "by Anima Labs". Then the nav: Leaderboard · Findings · Methodology · Measure your model. Nav items are plain 14px links; the current page has a 2px `--ink` underline, with no pills. On the right: the **bundle stamp** in mono 11px, `bench_v1 · 2026-10-13 · 32 models` (from the manifest/bundle `schema_version`, `generated` and `n_models`), and a 3-state theme switch (System / Light / Dark).
- Under 720px the nav collapses into a disclosure button labelled "Menu". The stamp moves to the footer.
- **Footer (colophon)**: "True Base Bench by Anima Labs" with a GitHub link · bundle file name · schema_version · generated · n_models · n_families (all read from the bundle) · "Download bundle (JSON)" · "Data: OVH Object Storage, manifest.json" · theme switch · **Reduce motion** toggle.
- Both the theme and the reduce-motion setting live in `localStorage` with every access in try/catch. The page renders correctly with storage unavailable.

### 4.3 Plates

A **Plate** has a `--bg-plate` background, a 1px `--rule` top border, 0 radius, and 20px padding (12px on phones). It contains:
1. a plate label (`PLATE C2 · …`);
2. the figure (SVG, `role="img"`, and an `aria-label` sentence generated from the data);
3. a caption (12/16 Plex Sans Condensed `--ink-2`), which goes in the margin column for narrow figures;
4. a **SourceLine** in mono 11px `--ink-3`: `Source: bench_v1.json · models[*].fingerprint.F_calib_gap` (one path per line if there are several);
5. a **"Data" disclosure** that reveals the plotted numbers as a real `<table>`. This is also the text alternative.

---

## 5. Components (shared kit, `src/components/`)

| component | contract |
|---|---|
| `Num` | `<Num path="models[id].fingerprint.F_calib_gap" fmt="gap" />`. It renders the formatted value with a 1px dotted `--ink-3` underline. It is focusable (tabindex 0). On hover or focus it shows a pop-out: in the margin column on desktop, otherwise as a tooltip. The pop-out reads `models[olmo2-7b_instruct].fingerprint.F_calib_gap = −0.91682` (raw value to 5 significant figures). A null renders as "—". This is the **only** way prose shows a measurement. |
| `SourceLine` | the field paths a figure reads |
| `Glyph` | stage, hollow, size |
| `StageLegend` | one inline row of glyph, code and name for each stage present |
| `Axis`, `Track`, `Bar` | linear by default. Ticks are 11px `--ink-3`, gridlines 1px `--rule`, the axis line `--rule-strong`. The axis title always states the quantity and unit (`calibration gap, mean(H − s), nats`). |
| `DivergingBar` | grows from a 1px `--zero` line in `--bar`, with the sign in the label |
| `RampCell` | the raw feature drawn on its ramp's own axis: the track is shaded `--band` from the 1-anchor outward, a tick marks the 0-anchor, and the value is a 2px `--ink` tick |
| `LensPanel` | a main linear axis plus a second linear axis below it for a sub-range, joined by 1px `--rule-strong` connector lines from the sub-range ends. Both are labelled. |
| `NullPlate` | a 45° `--rule-strong` hatch with one sentence, for example "Surname test not run for this checkpoint." |
| `Tooltip` | `--bg-raised`, 1px `--rule`, 0 radius. It shows label, value and field path. It is reachable by keyboard because marks are focusable; arrow keys move between marks within a chart, and Esc closes the tooltip. |
| `Transport` | Play/Pause · Step back · Step forward · Replay · `step k of n`. Each control is a `<button>` with an aria-label. When the plate has focus, Space toggles play and the arrow keys step. |
| `ModelPicker` | a segmented control for the computed defaults plus an "any model…" combobox (type-ahead over label, family and id) |
| `CopyButton` | copies an id, a code block or JSON, and confirms through `aria-live` |

Charts are hand-written SVG with pinned `d3-scale`, `d3-shape` and `d3-array`, bundled. No charting library is used. The 1 000-cell tapes and the ~1 022-dot field are SVG as well. Canvas is allowed only if profiling on a mid-range phone shows frames longer than 16ms; in that case the SVG Data table remains the accessible path.

---

## 6. Data layer

### 6.1 Loading

1. Fetch `${VITE_DATA_BASE_URL}/manifest.json` and pick the bundle `bench_v<N>.json` with the highest N. Then fetch that bundle.
2. Validate it: check the `schema_version` is supported and that the required top-level keys and per-model `id/family/stage/label/order/score/subscores` are present.
3. If any step fails, fall back to the shipped `/data/manifest.json` and `/data/bench_v1.json`, and show a one-line `--ink-3` notice under the top bar: "Showing bundled copy of bench_v1; live data unavailable."
4. If both fail, show an error paragraph with a Retry link.
5. While loading, show hairline skeleton rows, not spinners.
6. Memoise the bundle once per session.

### 6.2 Accessor

`src/data/bundle.ts` exposes `get(model, "fingerprint.F_calib_gap"): number | null` and `path(model, key)` (the provenance string). Every component accepts null at any depth. A missing block such as `surnames`, `weird` or `tail.tf_weird` is normal and has a designed empty state (§11.6).

### 6.3 Derived helpers (`src/data/derive.ts`)

- `stageOrder = ["pre-anneal","anneal","base","post-trained"]`.
- `ladder(family)` returns rungs sorted by `order`. **Parallel rungs**: consecutive rungs with the *same stage* (Llama 3.1 405B base at order 0 and 70B base at order 1) are parallel releases, not steps. Ladder views stack them in one column labelled "parallel" and draw no connector between them.
- `params(model)`: use `models[].params {total_b, active_b}` when present. Otherwise apply `/(\d+(?:\.\d+)?)([BT])(?:-A(\d+)B)?/` to the **family** string. Fall back to the label only for a `B` match (Llama 3.1 "405B base"), never a `T` match, because labels carry token counts (`10T`, `2.9T`, `17T`). If nothing matches, the result is "—"/unknown (MiMo V2.5).
- `sizeBucket`: `<15B | 15–100B | >100B | unknown`, on total params.
- `domainName(key)`: a display map for truncated keys (`F_CE_ao3_englis` → "AO3 (English)", `F_CE_github_mar` → "GitHub (Markdown)", `F_CE_arxiv_othe` → "arXiv (other)", `F_CE_wikipedia_` → "Wikipedia", and so on). Unknown keys render raw in mono and are never dropped.
- `basePairFor(postModel)`: the nearest preceding rung in the same family whose stage is not post-trained. This is used by F6 and by tail deltas. DeepSeek Cogito and Chat both pair with the Base rung. Llama 70B Instruct pairs with the 70B base.

### 6.4 Computed specimens (never hardcode ids)

The comment beside each rule shows what it selects in v1. These selections are expected values for tests, not inputs.

| name | rule | v1 result |
|---|---|---|
| **specimen family** | the family with the most rungs that has both a pre-anneal and a post-trained rung | OLMo-2 7B |
| **A / B** | A = the lowest-`order` pre-anneal rung of the specimen family; B = its highest-`order` post-trained rung | stage1-2928B / Instruct (RLVR) |
| **pre-anneal band** | ± max abs(F_calib_gap) over pre-anneal models, printed via `<Num>`. SPEC states "within ±0.02". Findings checks that the computed band ≤ 0.02 and raises a Data note if not. | ±0.016 |
| **collapse specimen** | the pre-anneal model with the highest `roll_frac_H<0.1` | Trinity-Large-TrueBase |
| **memo triple** | among families that have a pre-anneal rung, the (last pre-anneal rung → first following non-post rung) pair with the largest rise in `X_runfrac_wiki`, plus the next post-trained rung. Families without a pre-anneal rung are excluded, so the Llama 405B/70B parallel pair cannot win. | Trinity TrueBase / Base / Preview |
| **ramp specimen** | the model with the most sub-scores strictly inside (0, 1); ties go to the overall closest to 0.5 | Trinity-Large-Base |
| **same-score pair** | among pairs with abs(Δoverall) < 0.005, the pair with the largest L1 distance between sub-score vectors | Trinity-Large-Base vs DeepSeek-V3 Chat (both 0.458; L1 distance 1.62) |
| **recipe trio** (fallback if no same-score pair) | A, plus the base with the lowest memo score, plus the base with the lowest prior score | OLMo stage1, Llama-3.1-405B, Qwen2.5-72B |

Explainer specimen selection skips any model whose required fields for that explainer are null.

### 6.5 Method constants (`src/method.ts`)

Ramp anchors mirror `RAMPS` in `docs/vh_truebase.py`: calib (0 → 1, −0.10 → 0, applied to `min(gap, 0)`), spread (0.015, 0.10), memo (0.02, 0.12), prior (0, 0.40), together with the source fallbacks (`F_calib_gap` → `calib_gap`; `F_gap_domain_absmean` → `calib_gap_domain_absmean`; `X_runfrac_wiki` → `verbatim_run_frac_wiki`).

The same file holds the run rule (length ≥ 16, H < 0.2) and the surname frames, which mirror `SURNAME_PROMPTS`. When `reference.ramps`, `reference.method` or `reference.surname_frames` exist in a bundle, they take precedence and a test asserts they match `method.ts`.

These values are **definitions**, not measurements. The UI labels them "definition" in pop-outs.

### 6.6 Optional bundle additions (`tools/export_bundle.py` writes them; the UI degrades without them; flag them in SPEC.md)

- `reference.ramps`, `reference.method {run_min_len, run_H_max, marker_list}`, `reference.surname_frames {desc: [..], few: [..]}`
- `reference.passes {tf, tf_wiki, tf_fresh, tf_weird: {docs, tokens, source}, rollouts: {bos, openers, steps}}`
- `models[].params {total_b, active_b}`
- `models[].surnames.top_names [{name, p_census, p_desc, p_few}]` (top 30)
- `models[].fingerprint.F_gap_<domain>`: per-domain post-cutoff gaps. These are computed in `vh_analyze` but only min/absmean are stored.
- `explainers.position {context, real_token, models: {<id>: {top: [[tok, p]…16], other_mass, H, V, s, rank}}}`: one fixed `tf_fresh` position for the specimen pair. Explainer (a) uses it in place of the constructed distribution when present.

---

## 7. Pages

### 7.1 Leaderboard `/`

**Header** (columns 1–8):
- h1 "True Base Bench", serif 34px.
- Lede in serif 20px, with n from the bundle: "How far each of {n_models} checkpoints sits from a pre-anneal pretraining base, read from its next-token distributions alone. 1 = indistinguishable from a pre-anneal checkpoint; higher is not 'better'."
- A link: "How the score is built →" `/methodology#score`.

Columns 9–12 hold the **bundle card**: schema_version, generated, n_models, n_families, and Download JSON.

**Ladder strip (Plate 0, full width)**:
- x is overall 0–1 on the same scale as the table bars.
- There are four 28px rows, PRE, ANL, BASE and POST. Each row is labelled with its glyph, code and count `n = 3`, and a 1px `--ink` tick marks the median, with the value printed under it.
- Each model is its stage glyph. Collisions use a 1-D beeswarm (at most 3 stacked offsets of 6px).
- Hovering or focusing a glyph highlights the family's other rungs, joined by a thin `--ink-2` polyline across rows in `order` (parallel rungs are not joined). A tooltip shows label and score. Clicking opens the model page.
- Hovering a table row triggers the same family highlight.
- On phones all 4 rows stay and the ticks are reduced to 0, .5 and 1.

**Controls row** (sticky under the top bar once the thead reaches it; 14px):
- view switch `[Ranked | Ladders]`;
- Stage: four toggle chips (glyph and code, `aria-pressed`);
- Family: a multi-select disclosure checklist, alphabetical, with counts;
- Size chips;
- search (label, id, family);
- a "Raw features" toggle;
- "showing 32 of 32".

All state is mirrored to the URL query: `?stage=pre,base&family=OLMo-2%207B&size=lt15&view=ladders&sort=memo&dir=asc&raw=1&q=…`.

**Ranked table**:
- A semantic `<table>` with a sticky `<thead>` on `--bg-raised`. Headers are `<th scope=col>` containing a button, with `aria-sort`.
- Default sort is overall descending. Ties are broken by family, then order.
- Rows are 34px with a 1px `--rule` between them. Hover and focus-within apply `--hl` at 40%.
- The label cell is an `<a>` to `/model/:id`. A click anywhere on the row delegates to that link.

| column | content |
|---|---|
| # | rank, right-aligned, "=" for ties, `--ink-3` |
| Stage | glyph and code |
| Model | line 1: family in `--ink-2` · label 500. Line 2: id in mono 11px `--ink-3`. A "3/4" coverage marker appears when a sub-score is null. |
| Size | `398B·A13B`, `1T·A32B`, `7B`, `—` |
| Overall | 0.983 at 14px/600, then a 90×8 bar on `--track` in `--bar`, with faint ticks at .5 and 1 |
| Calib · Spread · Memo · Prior | a 64×6 bar plus the score at 12px `--ink-2`. A null shows a hatched track with "—" and the title "not measured; overall is the mean of the 3 available". |

- With **Raw features** on, each sub-score cell becomes a `RampCell` with the raw value and its unit (calib −0.065 nats, spread 0.054, memo 10.2%, prior 6.3%).
- Cell titles always give both forms and the source, for example `calib 0.354 ← F_calib_gap −0.065 (1 at 0, 0 at −0.10)`.
- Header tooltips give the field name, the anchors, and the "reads as" text from SPEC.
- Re-sorting animates with a 180ms FLIP, which is off under reduced motion.

**Ladders view** (same filters):
- One block per family, ordered by the family's max score. Singleton families are grouped at the end under "Single checkpoints".
- Block header: family (serif 17px/600), size, rung count, and a 120px sparkline of overall across `order` with glyph points.
- Rungs are 132px columns joined by 1px `--ink-3` chevrons. Each column shows the glyph and label (2 lines max), the overall value and bar, and a **sub-score comb**: four 6×24px bars labelled C S M P.
- Parallel rungs are stacked.
- On phones each rung is one line: glyph, label, number, comb.

**Breakpoints**:
- 720–1099px: Size folds into Model line 2, and sub-score cells show bars only (the value is in the title).
- Under 720px: each row is a 2-line item. Line 1 has the rank, glyph, label, then the overall number and a 64px bar right-aligned. Line 2 has family · size in 12px `--ink-3`, then a 4-up grid of micro bars C S M P, each with its value. Sorting moves to a `<select>`.
- There is no horizontal overflow at 360–400px. Test with the longest label, "Cogito v2.1 (light finetune of Base)", and the longest family, "DeepSeek V3 671B-A37B".

### 7.2 Model page `/model/:id`

An unknown id shows a not-found paragraph that links back. The rail holds the section index.

**Header**:
- Breadcrumb "Leaderboard / {family}".
- h1 is the label (serif 34px), then family · size · glyph and stage name.
- The id in mono with a copy button.
- The overall score at 34px with a 240px bar, then "rank r of n" and "mean of 4 sub-scores" ("of 3" when one is null).

**Sibling rail (Plate M1)**: the family's rungs in `order` as glyph nodes joined by a 1px rule, with parallel rungs stacked. This model sits on an `--hl` band. Each node shows its label and overall below it and links to its page.

**Compare with** chooses the compare models:
- The default is one sibling: the nearest pre-anneal or base rung if this model is post-trained, otherwise the next rung.
- Up to 2 more models from any family can be added.
- Compare models appear as hollow glyphs in every chart and as extra columns in the tables, and they are mirrored to `?compare=`.

Every section h2 has a margin note "Explained in Methodology §n →" that links to the matching explainer anchor.

**§1 Sub-score ramps (Plate M2)**:
- Explainer (f) frozen at its final step: four 220×64 transfer-function plots. A drop line runs from the value to the ramp, a read-off line runs to the sub-score bar, siblings show as hollow glyphs on x, and a source chip shows `subscores.<k>.source` ("calib_gap (Pile fallback)" when the fallback was used).
- Below the plots, the arithmetic line in mono: `(0.354 + 0.453 + 0.180 + 0.844) / 4 = 0.458`. It is computed client-side and checked against `score` to within 1e-9. A mismatch shows an inline "recomputed differs by x" note.

**§2 Calibration on unseen text (Plate M3)**:
- A reliability diagram labelled "top-1 reliability on post-cutoff text". (The key is named `selfboot` but it is computed on teacher-forced post-cutoff text.)
- The square is 280–360px. x is `bins[i][3]` (mean confidence) and y is `bins[i][4]` (accuracy), both 0–1. A 1px dashed diagonal is labelled "perfectly calibrated". The regions are labelled "over-confident" and "under-confident" in `--ink-3` italic.
- Points are glyphs with area ∝ `bins[i][2]`, joined by a 1.5px line. Compare models show as hollow points with a dashed line.
- Under the diagram is a 24px count histogram.
- The margin gives ECE, top1_acc, mean_p1, frac_p1>0.9 and acc_minus_conf_p1>0.9 as `<Num>`.
- A stat list follows: F_calib_gap, calib_gap (Pile), F_gap_domain_absmean, F_gap_domain_min, tail.tf_fresh.gap_hiH.
- Then a 14-row dot plot of per-domain `F_CE_*`: the model as a filled glyph and compare models hollow, sorted by the model's value.

**§3 Tail**:
- A table with rows `s>7, s>10, rank>100, rank>1000, CE, H, s_p99, gap_hiH` and columns `tf (Pile) / tf_fresh (post-cutoff) / tf_weird (rare genres)`.
- Under each value, the delta against the first compare model appears in 12px `--ink-3`: "×1.9 vs Base" for rates, and a signed difference for nats.
- A missing pass is omitted with a note (Cogito has no tf_weird).
- Plate M4 is a dot strip of `tail.tf_fresh.gap_hiH` for all models by stage. This model is highlighted and compare models are outlined. A zero line is drawn.

**§4 Surnames**:
- If `surnames` is null, show a `NullPlate`.
- Otherwise Plate M5, "effective number of surnames": three bars on a shared linear axis from 0 to exp(`reference.census_entropy_top2000`) for Census, few-shot exp(H_few) and described exp(H_desc). Secondary tick labels give nats.
- A stat list: KL_few, KL_desc, top10_few / top10_desc against top10_r, smith_plain (with "—" when null), and sampled junk / distinct / surpr against `reference.census_self_entropy_all`.
- If `surnames.top_names` exists, add **M5b**, a rank chart of the top 30 Census names. x is Census rank with names as mono tick labels; y is log probability with "log" in the title. Census is a 1px `--ink` line, few-shot is filled glyphs and described is hollow glyphs, all directly labelled.
- Without `top_names`, M5b is omitted with a one-line note: "Per-name distribution not in this bundle."

**§5 Rare genres**:
- A sortable table from `weird`: genre, gap, verbatim share % and CE nats. It is sorted by gap, with the ALL row pinned at the top in 600.
- The gap column is a `DivergingBar` on ±max|gap| across the bundle, with the pre-anneal band shaded and compare models as hollow ticks.
- If `weird` is null, show a `NullPlate`.

**§6 Own samples**:
- Five dot-on-axis gauges for ttr, hapax, distinct4, zipf_slope and gzip_ratio. Each axis spans the bundle-wide min–max, and a reference tick at `reference.pile_lexical.<k>` is labelled "Pile". The model glyph and compare glyphs sit on the axis, with the value and the Pile value printed.
- A note links to Finding 4 (collapse is not diagnostic) and shows `roll_frac_H<0.1` and `roll_rep8_q4`.

**§7 Full fingerprint**:
- A `<details>` element, closed by default. Keys are grouped by prefix: Pile teacher-forced (no prefix) · Wikipedia/GitHub (`X_`) · post-cutoff (`F_`) · own samples (`roll_`, `W1(…)`).
- Columns: key (mono), a short description from `src/data/glossary.ts` (unknown keys show "—"), value, compare columns and Δ.
- Buttons: "Copy model JSON" and "Download model JSON" (a Blob).

### 7.3 Methodology `/methodology`

- Title, then a 3-paragraph serif intro: what is measured; why it is reference-free and asks no benchmark questions; the four corpora and the own-sample pass. Pass sizes come from `reference.passes` when present. Otherwise the intro names the passes and shows no counts.
- The **specimen selector** sits under the title: "Specimens: A = {label} vs B = {label} of [family ▾]". The default comes from §6.4 and the selection is mirrored to `?family=`. Explainers that use their own computed specimen say so in their picker.
- Six explainer bands, anchored as `#position`, `#teacher-forcing`, `#calibration-gap`, `#verbatim-runs`, `#surnames` and `#score`. Each band is on `--bg-plate`, spans the wide track, and contains:
  - the §n kicker, the h2, and a one-sentence italic standfirst;
  - the figure in the main track (640px) and, in the margin track, the **step list**: an ordered list of short step paragraphs (40–80 words, with `<Num>`s). The current step has an `--hl` left bar and full `--ink`; past steps are `--ink-2`; future steps are `--ink-3`. Clicking a step jumps to it;
  - the `Transport` at the top of the step list, followed by the `ModelPicker`;
  - under the figure: caption, SourceLine, Data disclosure, and a "Numbers in this plate" list (each `<Num>` with its path).
- From 720 to 1099px and on phones, the step list stacks under the figure. The transport sticks to the bottom of the viewport while the plate is in view, so a reader can step without scrolling away from the figure.
- Between the bands sit short serif sections: the pipeline list (scripts in order), and the **Anchors table** (feature, 1 at, 0 at, why this anchor), rendered from `reference.ramps` or `method.ts`.

### 7.4 Findings `/findings`

There are six findings, F1–F6, in SPEC order, anchored `#f1`–`#f6`. Each has:
- a mono kicker "F1";
- a serif 26px claim sentence with live `<Num>`s interpolated, never typed;
- 2–3 sentences of discussion;
- one or two plates;
- a **Read-off** list of every value used, each linking to its model page.

**Checks** (`src/findings.ts`). Each claim has a predicate over the bundle. If the predicate fails, a ruled "Data note" paragraph appears under the claim saying what no longer holds. A snapshot test records the computed ranges, so drift is noticed in review. Two cases from v1 that the predicates must handle:
- OLMo-2's anneal rungs are not strictly monotone (17B +0.0021 → 50B +0.0024). The ladder check therefore compares **the last rung of each stage** (pre → anneal → base → SFT → DPO → RLVR) with a tolerance of 0.005 inside a stage.
- In F6, Llama-3.1-70B-Instruct has `gap_hiH` = +0.21 (under-confident) and Trinity Preview has −0.20. The "0.3–1.1 nats" range must be computed over the pairs that support it, and the exceptions must be **named** in the text ("except Llama 3.1 70B Instruct, +0.21"), not hidden.

Plates:
- **F1 Calibration ladder.**
  - F1a: the OLMo-2 ladder. x is rung in `order` with short labels; y is F_calib_gap on a linear scale from −1.0 to +0.1. The `--band` shows ± the pre-anneal band, and a `LensPanel` covers −0.12 to +0.04.
  - F1b: small multiples for every family with ≥ 2 rungs, sharing the y scale, in a 3-column grid (1 column on phones).
- **F2 "Annealed is not one thing".** Sub-score profiles across rungs, shown side by side for Trinity and OLMo-2. There are four lines (calib solid, spread dashed, memo dotted, prior dash-dot), each labelled directly at its right end, so no legend is needed. Below, a sub-score comb matrix with rows for anneal and base models and columns C S M P.
- **F3 Distillation.** A scatter of x = F_calib_gap against y = roll_instr_marker_rate for all models, using stage glyphs. gemma-2-9b is labelled with a leader line to a margin note, and an arrow joins it to gemma-2-9b-it.
- **F4 Collapse.** Dot strips by stage of `roll_frac_H<0.1` and `roll_rep8_q4`. Trinity TrueBase, Base and Preview are labelled and joined.
- **F5 Surnames.** A dumbbell per model: KL_desc as a hollow end and KL_few as a filled end, joined by a 1px connector. The x axis is log (0.1–10) with labelled decades. Rows are grouped by stage and sorted by KL_few. Next to it, exp(H_few) along the OLMo-2 ladder against the Census line. Models with null surnames are listed at the bottom as "not measured".
- **F6 Tail.** Paired arrows of `tail.tf_fresh["s>10"]` from `basePairFor(post)` to each post-trained rung, labelled with % change. Next to it, a dot strip of `tail.tf_fresh.gap_hiH` by stage.

### 7.5 Measure your model `/measure`

The rail lists the steps. Code goes in mono blocks on `--bg-raised` with a copy button, and every script name links to its file in `docs/`.

1. **What you need**: a hardware table. The reference is 8×B200. The HF transformers path is `vh_score.py` with `--max-mem-gib`. The vLLM path is `vh_score_vllm.py`, for FP8 or custom-code MoE, with `--tp 8 --trust-remote-code --prepend-bos`. Rollouts are 1536 steps, or 1024 for the FP8 giants.
2. **Corpora**: the Pile-10k selection, the wiki/GitHub extra corpus, the UncheatableEval 2026-04 fresh set and the weird-genre set. Note that the script defaults point at `/models/varentropy` and must be overridden.
3. **Run the passes**, including `--names-probe`.
4. **Analyse**, in pipeline order: `vh_analyze.py --all` → `vh_memo.py` → `vh_selfboot.py` → `vh_tail.py` → `vh_names_table.py` → `vh_truebase.py`. Read the headers of `vh_lp.py` and `vh_report.py` to place them.
5. **Export**: `tools/export_bundle.py`, then `npm test` (data contract and score recomputation).
6. **Submit**: a PR that adds the entries or a new `bench_vN.json` plus a manifest entry, with a checklist.

A collapsible **Data contract** table is generated from the loaded bundle's keys (type and nullability), with a hand-written description column from `glossary.ts`. The margin holds the corpus inventory and the licence notes.

---

## 8. The six explainers

All step text quoted below is a pattern. `{…}` marks a `<Num>`.

**Shared mechanics for all six**:
- Each explainer is a list of discrete states. Steps tween over `--dur-3` with `--ease-inout`. Sequenced sub-items stagger 40ms each, capped at 900ms in total. Token-step sequences run at `--dur-step`.
- Each plays once, the first time ≥ 50% of the plate has been visible for 400ms. A full run lasts at most 10s, after which it **holds its final state**. It never loops.
- It pauses when off-screen or when `document.hidden`.
- A model-picker change re-runs only the steps that depend on the model.
- An `aria-live="polite"` region announces each step's one-sentence summary, built from the same numbers.

### (a) One position: entropy, varentropy, surprisal — `#position`

The figure has three bands:
- **Context line** in serif 17px, labelled "illustrative context". It is a neutral phrase ending in a caret box with no blinking.
- **Distribution**: 16 vertical bars sorted by probability, labelled t1…t16 (no invented words), plus a 17th bar labelled "all other tokens". The y axis is "probability".
- **Surprisal lane**: x = −log p in nats, 0–8, linear, with 1-nat ticks.

**Construction**, written in the caption:
- The shape is a geometric distribution p_k ∝ r^k over 64 candidates (top 16 drawn, the remaining mass pooled), with r found by bisection so that its entropy equals the selected model's `F_H`.
- The "real next token" marker sits at s = `F_CE` on the lane. Because `F_calib_gap` = `F_H − F_CE` exactly in v1, the bracket between them prints the bundle's gap.
- The label reads "distribution shape constructed; H and s from bundle".
- If `explainers.position` exists, the real top-16, H, V, s and rank replace the construction, and the label changes to "measured at one post-cutoff position".

Steps:
1. **Every token gets a probability.** Bars rise from 0, staggered, in rank order.
2. **Probability becomes surprise.** Each bar drops a dot onto the lane at −log p, with dot area ∝ p. This is the key motion: rank order turns into position on an axis.
3. **Entropy is the balance point.** A fulcrum triangle slides under the lane to x = H, the p-weighted mean of the dots. Label: "H = {F_H} nats, this model's mean on post-cutoff text".
4. **Varentropy is how widely the weight is spread.** A ±√V band fades in around H. The band is drawn from the construction and not printed. The margin gives the model's real varentropy figures, `{Vmed|H2-3}` and `{F_V/H|H>1}`.
5. **Surprisal is where the real token landed.** The marker drops at s = {F_CE}, with a 2px `--ink` ring on `--hl`.
6. **The gap.** A signed bracket from s to H is labelled "H − s = {F_calib_gap}".
7. **Same position, specimen B.** The dots tween to B's construction. Mass concentrates at low surprisal, the fulcrum slides left, and s moves right, so the bracket lengthens and turns negative. The closing line links to (c).

Picker defaults: A vs B (§6.4), plus "any model…".

Under reduced motion the figure shows all layers, with A and B as two stacked final states.

Source: `fingerprint.F_H, F_CE, F_calib_gap, Vmed|H2-3, F_V/H|H>1` (`explainers.position` when present).

### (b) Teacher forcing on a fixed corpus vs the model's own samples — `#teacher-forcing`

The figure has two lanes and a footer:
- **Left lane, "Teacher-forced"**: a 40-cell strip of neutral grey blocks of varied width (no fake text), with an `LM` box above a cursor.
- **Right lane, "Own sample"**: the same strip, empty to the right of the cursor.
- **Footer**: four pass chips, `tf · Pile`, `tf_wiki · Wikipedia+GitHub`, `tf_fresh · post-cutoff`, `tf_weird · rare genres`. Docs and tokens come from `reference.passes`; without it the chips show the name and source only.

Steps:
1. **The same text, for every model.** The strip is filled and the cursor sits before cell 1.
2. **Read, never write.** The left cursor advances one cell per `--dur-step`. Each step flashes an 8-bar sparkline above the cursor, then the document's real next cell slides up from the corpus row (forced), and one count drops into a 10-bin histogram under the lane (x = top-1 confidence 0–1).
3. **Fast-forward.** The histogram fills to the exact shape of `selfboot.reliability.bins[i][2]`, while a counter runs to Σ counts ({n} positions on post-cutoff text). The caption stresses that nothing is sampled and nothing is judged.
4. **Four corpora, four questions.** Each chip lights in turn, with one margin sentence each: Pile measures recall plus calibration; Wikipedia/GitHub measures memorization; post-cutoff text has nothing recallable and drives the calibration scores; rare genres probe off-distribution behaviour.
5. **Now let the model write.** The right cursor advances. The next cell is drawn from the sparkline (the chosen bar flashes) and appended. A paired bar compares free-running entropy {roll_H_bos} with teacher-forced {F_H}, and {roll_frac_H<0.1} gives the share of near-deterministic steps. The caption explains that sampling continues past end-of-text, and links to F4.
6. **Averages per domain.** The lanes collapse into a 14-row dot plot of `F_CE_<domain>` for both picker models (filled and hollow), sorted. The closing question: cross-entropy alone cannot say whether a model is miscalibrated (→ c).

Picker defaults: the collapse specimen vs A (§6.4).

Under reduced motion both lanes are shown in their final state and the histogram is full.

Source: `selfboot.reliability.bins`, `fingerprint.F_H, roll_H_bos, roll_frac_H<0.1, F_CE_*` (`reference.passes`).

### (c) The calibration gap, and why pre-anneal checkpoints sit at zero — `#calibration-gap`

There are three panels.

**C1 "If the text were the model's own."** This reuses (a)'s constructed distribution. Tokens are drawn from it one at a time and fall as dots onto the lane, while a running-mean line of −log p converges onto the H line. Labels: "simulated draws" and "H from bundle".

**C2 "Every checkpoint, on one axis."** A horizontal linear axis of F_calib_gap from [min − 0.05] to +0.1 nats. The 1.5px `--zero` line is labelled "calibrated: expected surprise = realised surprise". The `--band` is ± the computed pre-anneal band. A `LensPanel` covers −0.12…+0.04 and carries the calib ramp anchors.

**C3 "In every genre."** One small row per `weird` genre for A and B, each with a zero line and the band. The caption says these are **rare-genre Pile documents, not post-cutoff text**. If `F_gap_<domain>` exists, post-cutoff domains are shown instead and the caption changes. Beside it sits the reliability diagram (bins[3] vs bins[4]) for A and B, with ECE.

Steps:
1. **Expected surprise.** C1: when the next token is drawn from the model's own distribution, mean surprisal converges to entropy. "Cross-entropy is a proper scoring rule. A model trained toward the data expects as much surprise as fresh text from that data gives it."
2. **One number per model.** A's and B's {F_H} and {F_CE} ticks collapse into one gap value each.
3. **All checkpoints.** Every model drops in on C2 as a stage glyph, ordered by value with a 40ms stagger.
4. **Sorted by stage.** The glyphs tween into four stage rows, and the band appears, labelled "±{band}, the widest pre-anneal gap".
5. **Down the ladder.** The specimen-family rungs are joined in `order` by a 1.5px `--ink` path with an arrowhead. Each node is labelled with its rung label and value, and the `--hl` band rides the current rung at 240ms per rung. A second family with a pre-anneal rung (Trinity in v1) is drawn as an `--ink-3` dashed path.
6. **Where it is unsure.** A ring per model appears at `tail.tf_fresh.gap_hiH`, the gap at positions with H > 4: over-confidence concentrates where the model is uncertain.
7. **Not just on average.** C3. The margin defines *spread* = mean |per-domain gap| and gives {F_gap_domain_absmean} for A and B.
8. **Becoming a score.** The calib ramp is drawn as a wedge under the lens (1 at 0, 0 at −0.10, positive gaps clipped to 1) and links to (f).

Under reduced motion the stage rows, paths and rings are drawn directly.

Source: `fingerprint.F_calib_gap` (`calib_gap` with a "Pile" chip when it is the source), `F_H, F_CE, F_gap_domain_absmean`, `tail.tf_fresh.gap_hiH`, `weird[*][0]`, `selfboot.reliability`.

### (d) Verbatim runs: recitation of the anneal mix — `#verbatim-runs`

**D1 "The rule"** is an illustrative sequence, labelled as such. It has a row of 32 token cells with two indicator rows beneath it, "top-1 = real token" and "H < {run_H_max}", and a mono counter "run length 0" above the cursor.

**D2 "The tape"** shows three 1 000-cell tapes (a 40 × 25 grid of 8px cells with 1px gaps), one per memo-triple model, each representing 1 000 Wikipedia tokens. The filled count is exactly `round(X_runfrac_wiki × 1000)` in `--bar`. Cells are placed as contiguous blocks of 16–64, arranged by a PRNG seeded with the model id. Label: "arrangement schematic; share from bundle".

**D3** is the memo ramp mini-plot.

Steps:
1. **A confident, correct token.** Cell 1 fills both indicators and the counter reads 1.
2. **A run is a streak.** Cells fill at `--dur-step` while the counter counts. At {run_min_len} a bracket snaps under the streak, "verbatim run (≥ {run_min_len})", and the streak is painted `--hl`.
3. **The rule bites.** At cell 18 the model hesitates (H above threshold), so the indicator stays empty and the counter resets to 0. A following 9-cell streak gets no bracket.
4. **Share of Wikipedia inside runs.** The tapes fill left to right like a chart recorder over 3s, linear, with a live counter ending on {X_runfrac_wiki}. The middle model in the triple is noticeably fuller.
5. **Why Wikipedia, not code.** A GitHub toggle switches the tapes to {X_runfrac_gh}. The margin says code is predictable by nature, so it is reported but not scored.
6. **Everyone.** A strip of `X_runfrac_wiki` for all models (linear, 0 to max), with the memo anchors marked "score 1 at or below" / "score 0 at or above". The three largest values are labelled.
7. **Onto the ramp.** D3: the three models drop onto the memo ramp, with {subscores.memo.score} printed for each.

Picker: the computed memo triple, plus any model. `weird[genre][1]` (per-genre verbatim share) is available in the Data disclosure.

Under reduced motion D1 shows two static rows (a 17-cell run with its bracket, and a 9-cell streak without one) and the tapes are full.

Source: `fingerprint.X_runfrac_wiki, X_runfrac_gh` (`verbatim_run_frac_wiki` fallback, shown in the margin when used), `subscores.memo`, `method.ts` run rule.

### (e) The surname test: described vs few-shot frames — `#surnames`

**E1 prompt cards** sit side by side (stacked on phones). Each is mono 13px on `--bg-raised`, with a 1px `--rule` border and a 3px `--rule-strong` left rule.
- *Described*: the `plain` frame text.
- *Few-shot*: the `fewshot1` frame with its six genuine Census draws, ending in "7.".
- Text comes from `reference.surname_frames`, or else `method.ts` (mirroring `SURNAME_PROMPTS`). These are text, not measurements.

**E2 dot field, "effective number of surnames"**: round(exp(`reference.census_entropy_top2000`)) dots in 32 columns, all lit for Census.

**E3** is top-10 mass: three bars on 0–1 (Census top10_r, model top10_few, model top10_desc).

**E4** is the KL dumbbell.

**E5** is the sampled-lists table.

Steps:
1. **Ask for random surnames.** The Described card appears and the slot after "1." gets `--hl`.
2. **The genre answers, not the population.** Bars for "p(Smith) as item 1" fill to {smith_plain} for A and B. If null, the step shows "—" with a note. The margin says that "random list of surnames" reads as "ranked list of common surnames", which in training text begins Smith, Johnson, Williams.
3. **Thinning.** For model A's described frame, the dot field goes dark from the high-rank end inward over 1.5s, down to exp({H_desc}) ≈ n dots. A counter runs, and E3 shows the top-10 mass far above Census.
4. **Show it six real draws instead.** The Few-shot card types its six names at 120ms per line, then "7." gets the wash. The field relights to exp({H_few}) (near Census for A), and E3 updates. {KL_few} is printed.
5. **Post-training thins the tail.** Model B's few-shot field shows exp({H_few}) with KL {KL_few}.
6. **Every checkpoint.** E4 shows a dumbbell for every model with surnames: a hollow described end and a filled few-shot end. The axis is log 0.1–10, labelled. The shaded range is computed from pre-anneal and clean-base KL_few, printed as {min}–{max}. Null models are listed below as "not measured".
7. **Sampling agrees.** E5: distinct, junk (names outside the {162 253} Census surnames, a reference constant) and mean −log p_Census {surpr} against {census_self_entropy_all}, for A and B.

If `top_names` exists, a rank chart joins E2.

Under reduced motion the card text appears whole, the field shows its final count with the Census extent as a 1px outline, and the markers are placed directly.

Source: `surnames.*`, `reference.census_entropy_top2000, census_self_entropy_all`, `reference.surname_frames`/`method.ts`.

### (f) Four ramps, one score — `#score`

The figure is four stacked 260×72 transfer-function plots, labelled Calib, Spread, Memo and Prior.
- x is the raw feature in its unit: F_calib_gap (nats), F_gap_domain_absmean (nats), X_runfrac_wiki (%), roll_instr_marker_rate (%).
- y is the sub-score, 0–1.
- The ramp is a 1.5px `--ink` polyline: flat at 1, sloped, flat at 0. The clipped zones are filled `--track`, and the anchors are labelled "1 at …" and "0 at …".
- To the right is a column of four sub-score bars and an overall bar.

Steps:
1. **Raw features are on different scales.** A glyph drops onto each x axis at `subscores.<k>.value`.
2. **Each becomes 0–1 by a ramp anchored on known checkpoints.** The ramps draw on. The margin says the anchors were set on the Trinity TrueBase/Base/Preview triple and checked on the OLMo-2 ladder.
3. **Drop the value onto the ramp.** A vertical line rises from the glyph until it meets the ramp, settling with `--ease-settle`. A value in a clipped zone visibly lands on the plateau and is labelled "clipped".
4. **Carry the heights over.** A horizontal read-off runs to each sub-score bar, which fills to {score}.
5. **Average.** The four bars slide end to end into a 0–n track, then compress by 1/n into the overall bar. The equation prints in mono, `({c} + {s} + {m} + {p}) / 4 = {score}`, followed by "matches bundle", or "differs by x" if the check fails. A null sub-score shows as a hatched gap and the denominator becomes 3.
6. **Same overall, different reasons.** The picker toggles to the computed same-score pair (or the recipe trio). The glyphs re-settle each time, showing that similar overall scores can come from different sub-scores.

Default: the ramp specimen (§6.4). A prev/next control walks the ranked list. A source chip appears when calib uses the Pile fallback.

Under reduced motion all lines are drawn and swaps are instant. The model page reuses this figure frozen at step 5.

Source: `subscores.{calib,spread,memo,prior}.{value,score,source}`, `score`, `reference.ramps`/`method.ts`.

---

## 9. Motion rules

1. Motion only depicts a process from the measurement: a cursor stepping, a token being forced or sampled, a histogram filling, a counter reaching 16, a dot field thinning, a value dropping onto a ramp. There are no entrance fades, parallax, hover bounces or counting numbers outside explainers.
2. UI transitions take `--dur-1`. Leaderboard re-sort uses a FLIP of `--dur-2`, and disclosures also take `--dur-2`.
3. Explainers follow §8's shared mechanics: they play once, hold their final state, have a transport, and stay paused while off-screen or hidden. requestAnimationFrame stops when an IntersectionObserver reports the plate is not visible.
4. Under `prefers-reduced-motion: reduce`, or when the site's Reduce motion toggle is on, the whole site behaves as follows:
   - all durations are 0;
   - there is no autoplay;
   - every plate renders its final state;
   - Step and the step list still work, switching states instantly;
   - FLIP is off;
   - counters show final values;
   - the aria-live text still announces each step.
5. Motion is never the only carrier of meaning. Every state is also in the step text and the Data table.

---

## 10. Accessibility rules

1. Text contrast is ≥ 4.5:1 and meaningful graphical marks and control borders are ≥ 3:1, in both themes (§2.1 lists the ratios). Text on `--hl` is always `--ink`.
2. Stage is never shown by colour alone: there is always a glyph shape and a code or name in text.
3. Focus is visible everywhere: a 2px `--focus` outline at 2px offset, never removed. A skip link goes to main content.
4. Tables are real `<table>`s with `<th scope>` and `aria-sort`. Sort controls are buttons. Row links are real anchors.
5. Every figure has `role="img"`, a data-generated `aria-label`, and a Data disclosure with the numbers as a table. Chart marks are focusable, with tooltips reachable by arrow keys.
6. Null values render "—" with a title, and null blocks render a `NullPlate` sentence. Nothing is silently omitted.
7. There is no horizontal page scroll at 360–400px. Tap targets are at least 40×40px on phones. Text never sits below 11px.
8. Animated plates have an `aria-live="polite"` step summary and a keyboard-operable transport (Space, ←, →).
9. Language and number formatting are fixed: `lang="en"`, U+2212 minus, thin-space thousands.
10. Theme and motion preferences persist only in localStorage, wrapped in try/catch. A missing value falls back to the system setting.

---

## 11. Copy rules

1. "Checkpoint" is the unit. Stage names are used exactly as in the bundle. "Higher is not better" appears wherever the score is introduced.
2. Every measurement in prose is a `<Num>`. Ranges such as "30–200%", "0.3–1.1 nats" and "KL 0.12–0.3" are computed by `findings.ts`, and exceptions are named.
3. `selfboot.reliability` is labelled "top-1 reliability on post-cutoff text".
4. Rare-genre gaps (`weird`) are labelled as Pile rare-genre text and are never presented as post-cutoff domains.
5. Schematic or constructed elements carry their label in the figure itself, not only in the caption.
6. Empty states use these exact sentences: "Surname test not run for this checkpoint." · "Rare-genre pass not run for this checkpoint." · "Per-name distribution not in this bundle."

---

## 12. Engineering notes

- **Stack (recommended).** Vite + TypeScript + React 18 with react-router (history routing). Use pinned d3-scale, d3-shape, d3-array and Fontsource packages, with exact versions in `package.json` and no `^`. There is no charting library and no CSS framework: plain CSS with the tokens in `src/styles/tokens.css`.
- **Routes.** `/`, `/model/:id` (URL-encoded id), `/methodology`, `/findings`, `/measure`. Caddy uses `try_files {path} /index.html`. Long-cache the hashed assets and set `manifest.json` to no-cache. The OVH bucket CORS must allow the Railway origin.
- **Tests** (`npm test`):
  1. data contract (required keys, types, nullability), including a synthetic model with every optional block null;
  2. score recomputation from the fingerprint with `method.ts`, matching `score` and `subscores.*.score` to within 1e-9;
  3. `reference.ramps` / `reference.method` / `reference.surname_frames` equal `method.ts` when present;
  4. `method.ts` surname frames equal `SURNAME_PROMPTS` parsed from `docs/vh_score.py`, and the ramps equal `RAMPS` in `docs/vh_truebase.py`;
  5. the §6.4 specimen rules return the expected v1 ids;
  6. a snapshot of the findings predicates and computed ranges;
  7. `params()` parsing, including "10T"/"2.9T" labels and MiMo returning unknown.
- **Layout.** `src/data/` (bundle, derive, glossary, method), `src/lib/numfmt.ts`, `src/components/` (the kit), `src/explainers/{position,teacherForcing,calibrationGap,verbatimRuns,surnames,score}.tsx`. Each explainer exports `steps: Step[]`, where a Step has `{id, text(bundle), render(state)}`, and is driven by one `useStepper` hook that handles transport, autoplay-once, visibility pausing and reduced motion.
- **Performance.** Fonts total about 7 files. The bundle is about 270KB, fetched once. Each route is code-split so the explainers do not load on the leaderboard. Check that Lighthouse reports no layout shift from the font swap in the table.
