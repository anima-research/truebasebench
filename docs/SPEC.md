# True Base Bench — site specification (v1)

**Owner:** Anima Labs (Antra Tessera). Public, permanent, maintained benchmark site. Attribution: "by Anima Labs" in header/footer; link to https://github.com/anima-research. No other branding.

## What the bench measures

A reference-free fingerprint of how far a language-model checkpoint sits from a *pre-anneal pretraining base* ("true base"). Every model is measured with the same scripts on the same fixed text; nothing is a benchmark question, everything is a statistic of the model's next-token distribution.

Pipeline per checkpoint (scripts in `docs/`, run on 8×B200; HF transformers or vLLM):
1. **Teacher-forced passes** (exact full-vocabulary distribution at every position): record entropy `H`, varentropy `V = Var[-log p]`, surprisal `s` of the real next token, top-1 probability `p1`, rank of the real token.
   - `tf`: 400 Pile documents (pile-10k), ≤2048 tokens, ≈290k tokens — in most pretraining sets, so it also measures recall.
   - `tf_wiki`: 150 Wikipedia + 60 GitHub documents (memorization features).
   - `tf_fresh`: 900 post-cutoff documents (UncheatableEval 2026-04; ao3, arXiv, bioRxiv, BBC, GitHub, Wikipedia, 15 categories), ≈1.3M tokens — nothing recallable.
   - `tf_weird`: 199 rare-genre Pile documents (Enron, OpenSubtitles, HackerNews, DM Mathematics, NIH, FreeLaw, USPTO, YouTube subtitles, EuroParl, PhilPapers, Ubuntu IRC, PG-19).
2. **Own samples**: 32 sequences from a bare `<bos>` and 32 from 32-token document openers, 1536 steps (1024 for the FP8 giants), temperature 1, no truncation, sampling continues past end-of-text; `H`,`V`,`s`,`p1` recorded at every step.
3. **Surname distribution test** (Gwern's test): reference = 2010 US Census surname counts. *Exact*: log P(name | prompt) for the 2,000 most common surnames, Title-case and ALL-CAPS spellings summed, under three "described" frames (the list is said to be random/frequency-weighted) and three "few-shot" frames (six genuine Census draws given as items 1–6, distribution read at item 7). Reported: KL(Census‖model), model entropy vs Census entropy 6.93 nats over the same set, top-10 mass, mass on set. *Sampled*: 16 lists × 400 tokens at T=1 per frame → distinct share, junk share (names not among 162,253 Census surnames), mean −log p_Census of generated in-Census names (Census self-entropy ≈ 10.4 nats).

### Features and how they combine

Sub-scores (each a clipped linear ramp between a true-base anchor → 1 and a post-trained anchor → 0; anchors set from the Trinity TrueBase/Base/Preview triple and checked on the OLMo-2 ladder). **Overall = mean of available sub-scores.**

| sub-score | feature | 1 at | 0 at | reads as |
|---|---|---|---|---|
| calib | `F_calib_gap` = mean(H − s) on post-cutoff text (falls back to Pile) | 0 | −0.10 | over-confidence; pre-anneal checkpoints sit within ±0.02 of 0 |
| spread | `F_gap_domain_absmean` = mean |per-domain gap| on post-cutoff text | 0.015 | 0.10 | miscalibration spreading across genres |
| memo | `X_runfrac_wiki` = share of Wikipedia tokens inside verbatim runs (≥16 consecutive tokens where top-1 = real token and H < 0.2) | 0.02 | 0.12 | recitation of the anneal mix |
| prior | `roll_instr_marker_rate` = share of bare-BOS samples containing chat/instruction markers | 0 | 0.40 | instruction-shaped prior |

Also shown (not scored): ECE of the top-1 prediction (10 bins, post-cutoff text); realised tail statistics (share of real tokens with surprisal > 7 / > 10 nats, rank > 100, calibration gap at positions with H > 4); surname KL (few-shot and described); weird-genre gap and verbatim share per genre; own-sample lexical statistics (type-token ratio, hapax share, distinct 4-grams, Zipf slope) against the Pile reference (ttr 0.391, hapax 0.248, distinct4 0.920, Zipf −0.91).

### Headline findings (must be reflected in the methodology and findings pages; numbers come from the data bundle, do not hardcode)
- Pre-anneal checkpoints are calibrated on unseen text (gap within 0.02 of 0 in every domain); every later stage pushes the gap negative, monotonically through SFT → DPO → RLVR (OLMo-2: +0.016 → −0.006 → −0.40 → −0.85 → −0.92).
- Trinity's anneal memorised its up-weighted sources (Wikipedia verbatim share 1.5% → 10%); OLMo-2's anneal kept calibration but injected instruction data into the prior (marker rate 0 → 22 → 31%). "Annealed" is not one thing; the sub-scores separate the recipes.
- Distillation (gemma-2-9b) looks like post-training on the calibration axis.
- Free-running collapse (single-glyph attractors) is NOT diagnostic — pre-anneal and annealed Trinity both do it.
- Surname test: under a verbal description every model answers with the "ranked list of common surnames" genre (Smith first); post-training sharpens this into verbatim recitation of the Census list. Given six genuine draws, pre-anneal checkpoints and clean bases match the population distribution (KL 0.12–0.3); post-training thins the tail (OLMo-2 Instruct KL 2.55, entropy 3.2 vs 6.9).
- Tail: post-training raises the rate of real tokens the model found "impossible" (s > 10) by 30–200% and makes the model 0.3–1.1 nats over-confident exactly where it is uncertain (H > 4); bases ≈ 0.

## Data contract

`data/bench_v1.json` — `{schema_version, generated, n_models, reference, models[]}`. Each model: `id`, `family`, `stage` ∈ {pre-anneal, anneal, base, post-trained}, `label`, `order` (position within family ladder), `score` (overall), `subscores{calib,spread,memo,prior → {score,value,source}}`, `fingerprint{...all features...}`, `surnames{KL_desc,KL_few,H_desc,H_few,H_r,top10_desc,top10_few,smith_plain,junk,distinct,surpr,...}`, `weird{ALL:[gap,runfrac,CE], <genre>:[gap,runfrac,CE]}`, `selfboot{reliability{ECE,bins,...}, lexical{ttr,hapax,distinct4,zipf_slope,gzip_ratio}}`, `tail{tf,tf_fresh,tf_weird → {s>7,s>10,rank>100,rank>1000,CE,H,s_p99,gap_hiH}}`. Some fields may be null (not every pass ran for every model) — the UI must degrade gracefully. New bundles are added as `bench_v<N>.json`; the site should read a `manifest.json` listing bundles and load the latest.

Data lives on **OVH Object Storage (S3-compatible)** in a public-read bucket; the site fetches `manifest.json` then the bundle. A copy of the current bundle ships in the repo as a fallback (`data/`). Provide `tools/upload_data.py` (boto3, endpoint/bucket/credentials from env) and `tools/export_bundle.py` (turns the analysis JSON files produced by the measurement scripts into a bundle + manifest).

## Site

Static site (no server-side logic), deployed on **Railway** (Dockerfile or Nixpacks; static build served by Caddy or a tiny Node static server with correct caching/CORS), repo-based deploys. Pages:
1. **Leaderboard** — sortable/filterable table (family, stage, size) with the overall score and four sub-scores as compact bars, sparing color: stage colour only; click → model page. Summary strip of the ladder (pre-anneal → anneal → base → post-trained).
2. **Model page** — all measured numbers for one checkpoint, with its family siblings for comparison; reliability diagram; surname distribution (model vs Census over top names); per-genre table.
3. **Methodology** — the explainers, as animated infographics (SVG/Canvas, respecting prefers-reduced-motion): (a) what H, V, s are at one position; (b) teacher forcing on a fixed corpus; (c) the calibration gap and why pre-anneal models sit at zero; (d) verbatim runs / memorization; (e) the surname test, described vs few-shot frames; (f) how the four ramps combine into a score. Every number in an explainer comes from the bundle.
4. **Findings** — the headline findings with the supporting charts (ladder charts per family).
5. **Measure your model** — how to run the scripts (`docs/`), hardware notes, how to submit a bundle (PR).

Design: a distinctive, calm identity suited to a research instrument; both themes; phone-width works; charts to scale, labelled, colour never the only encoding; load libraries only from cdnjs/jsdelivr with pinned versions or bundle them. Avoid the generic AI-generated look (no purple gradient heroes, no emoji markers, no centered everything).

Engineering: Node ≥20, a mainstream bundler (Vite), TypeScript, React or vanilla — the implementing agent chooses and documents. `npm run build` must pass; `npm run dev` for local; `npm test` for data-contract and scoring tests (the score must be recomputable from the fingerprint using the ramps above — a test asserts the recomputation matches `score` in the bundle). Lighthouse-level basics: no horizontal overflow at 400px, visible focus states, alt text on figures.
