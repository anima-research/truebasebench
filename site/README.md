# True Base Bench: site

Static site for True Base Bench, by Anima Labs. Vite 5 + React 18 + TypeScript, react-router (history
routing), hand-written SVG charts, plain CSS over design tokens. Node >= 20.

```bash
npm install
npm run dev      # http://localhost:5173 (serves ../data at /data)
npm test         # data contract, score recomputation, method sync, specimens, findings snapshot
npm run build    # typecheck + production build to dist/ (copies ../data/*.json to dist/data/)
npm run preview  # serve dist/
```

## Data

The site fetches `${VITE_DATA_BASE_URL}/manifest.json`, picks the `bench_v<N>.json` with the highest N,
validates it, and falls back to the repo copy (`/data/manifest.json`, `/data/bench_v1.json`) with a one-line
notice if the live source fails. Leave `VITE_DATA_BASE_URL` empty to use the repo copy only (see
`.env.example`). Bare `NaN`/`Infinity` tokens written by the Python scripts are read as `null` ("not measured").
Every number on the site comes from the bundle (or, for method constants, from `src/data/method.ts`).

Optional: `VITE_SOURCE_REPO_URL` (e.g. `https://github.com/<org>/<repo>`) turns script names into links.

## Layout

```
src/
  main.tsx, App.tsx            entry, routes (/, /model/:id, /findings, /methodology, /measure), chrome
  data/
    types.ts                   bundle types
    load.ts, parse.ts          manifest -> latest bundle, NaN-tolerant parse, fallback, memoised
    validate.ts                runtime structural check
    bench.schema.json          JSON Schema for bundles (enforced in tests)
    manifest.schema.json       JSON Schema for data/manifest.json
    bundle.ts                  get(model, "fingerprint.F_calib_gap"), path(), resolvePath()
    derive.ts                  ladders, params(), basePairFor(), computed specimens (DESIGN §6.4)
    method.ts                  ramp anchors, sources, run rule, surname frames (definitions)
    scoring.ts                 recompute sub-scores and overall from a fingerprint
    glossary.ts                feature descriptions
    BundleContext.tsx          loading state
  findings.ts                  F1–F6 computed claims and checks (Data notes)
  lib/                         numfmt (only formatter), scale, prefs (theme/motion storage), motion
  components/                  Num, Plate/SourceLine/DataTable/NullPlate, Glyph, Chart (frame, marks,
                               tooltips, keyboard), Axis, Bars (ScoreBar, RampCell, DivergingBar),
                               LadderStrip, Markdown, ReadingPage, Chrome (top bar, footer, theme switch)
  charts/                      TransferPlot, ModelCharts, FindingCharts, TopNames
  pages/                       Leaderboard, ModelPage, Findings, Methodology, Measure
  content/                     methodology.md, measure.md (rendered by components/Markdown.tsx)
  explainers/                  mounting point for the animated explainers (see explainers/README.md)
  styles/                      tokens.css (light/dark), base.css, pages.css
  test/                        vitest suites
```

Markdown extensions: `{{num:<bundle path>|<fmt>}}` renders a live `<Num>`, `{{def:<NAME>|<fmt>}}` a method
constant, `{{explainer:<id>}}` mounts an explainer, `{{block:<name>}}` a page-provided block, and
`## Heading {#anchor}` sets an explicit anchor.
