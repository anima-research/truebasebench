## 1. Summary verdict

**The evidence supports a useful exploratory fingerprint, but not a general detector of training history or a validated “true base” index.** In [bench_v3.json](/Users/antra/truebasebench/data/bench_v3.json), all four labelled pre-anneal checkpoints have overall fresh-text gaps between +0.00018 and +0.01562, and all 14 post-trained checkpoints have more negative gaps than their matched available bases. However, OLMo-2’s anneal checkpoints remain inside that pre-anneal range, so calibration does **not** generally separate pre-anneal from annealed checkpoints. The strongest controlled result is OLMo-3 stage-1 → released Base: gap +0.00018 → −0.03292, with entropy falling substantially more than cross-entropy. The largest convincing stage effect is OLMo-2’s Base → SFT → DPO → Instruct sequence, −0.00565 → −0.39773 → −0.85436 → −0.91682. These results establish changes in distributional sharpness relative to the evaluated text, not unique causes such as memorization, synthetic data, or a particular training phase. The four-ramp calculation is reproducible: I recomputed all 35 scores in Python and TypeScript, with maximum overall discrepancy approximately 1.1×10⁻¹⁶. Its weakest aspect is construct validity: hand-selected features, anchors, clipping and equal weights have not been validated on independent families or against a downstream criterion. I would cite the paired measurements as exploratory evidence, but not cite the leaderboard as an established measure of checkpoint purity.

## 2. Methodological critique

**The gap is a moment condition, not a general calibration test.** For model distribution \(p\) and data distribution \(q\),

\[
G = \mathbb E_c\!\left[\sum_x (q(x\mid c)-p(x\mid c))\log p(x\mid c)\right].
\]

This is not KL divergence and can vanish when \(p\neq q\). A uniform predictor has \(H=s=\log |V|\) on every document, however poorly it models language. Consequently, “gap near zero” is insufficient to conclude that the model faithfully represents the data distribution.

There is also a direct temperature interpretation. Holding teacher-forced contexts fixed and setting \(p_\beta=\operatorname{softmax}(\beta z)\),

\[
G(\beta)=-\beta\,\frac{d\,CE(\beta)}{d\beta}.
\]

A post-trained model can therefore achieve zero aggregate gap through fitted output-temperature scaling without reversing its training. This is an essential negative control for a training-history detector. The site’s maximum-likelihood explanation skips this distinction.

**Tokenizer and context effects remain uncontrolled across families.** The score uses nats **per token**, a 16-token run threshold and model-tokenized prefixes capped at a token count. Different tokenizers change all three, including how much of each document is evaluated. `chars_per_tok` does not normalize the scored features; it estimates a conversion from untruncated Pile documents and applies it to other Pile means ([vh_analyze.py:177](/Users/antra/truebasebench/docs/vh_analyze.py:177)). Same-tokenizer paired comparisons are substantially more interpretable than cross-family rankings. Report common character-span evaluations, tokenizer identities, token counts and context-length sensitivity.

**Model size and training exposure confound memorization.** Llama-405B has 22.39% Wikipedia run share versus 3.59% for Llama-70B. That could reflect capacity, training exposure, recipe differences, or combinations of them; it does not establish that the larger model is more annealed. Trinity’s comparison also spans 10T → 17T training tokens. Without matched continuation controls, extra training, changed data mixture and learning-rate annealing are inseparable.

**“Post-cutoff” is asserted rather than demonstrated per checkpoint.** Neither the bundle nor registry includes checkpoint revisions, documented cutoffs, corpus revisions or per-model corpus hashes. Newly published Wikipedia pages, repositories and papers can contain older copied passages, templates and quotations. New publication dates do not establish “nothing recallable,” as [SPEC.md:13](/Users/antra/truebasebench/docs/SPEC.md:13) claims. The measured TrueBase fresh-text run share is itself 2.26%; that is not proof of contamination, but illustrates why runs and unseen documents cannot be treated as mutually exclusive.

**The sampling unit is the document or rollout, not the token.** Sixty documents per category is modest, especially with shared sources and long correlated passages. The initial finding contains 625 of 1,620 collapsed branch points—38.6%—from one Wikipedia article ([JOURNAL.md:13](/Users/antra/truebasebench/docs/JOURNAL.md:13)). Token-weighted means can be dominated by a few documents. Domain inclusion thresholds of 2,000 tokens, and 1,500 for rare genres, also depend on tokenizer and length; publish included/excluded document and token counts.

**Temperature-1 rollout artifacts affect a scored feature even though “collapse” was dropped.** Sampling continues past EOS, and some checkpoints receive 1,024 steps while others receive 1,536. The probability of encountering any marker increases with exposure length. BOS versus EOS fallback, special-token handling and post-EOS continuation can change the apparent prior. The journal correctly abandons collapse as a discriminator, but the marker score still inherits these rollout choices.

**The marker list does not identify instruction training.** It includes ordinary phrases such as “Here is a” and “step by step,” plus `\boxed{`, which can occur in ordinary mathematical text ([vh_analyze.py:164](/Users/antra/truebasebench/docs/vh_analyze.py:164)). It misses other languages and synthetic genres without those strings. DeepSeek-V3, Cogito and V4-Flash instruct all score **zero markers**; TrueBase scores 6.25%. Establish precision and recall with blinded human annotations, multilingual examples and positive controls before interpreting marker frequency causally.

**The surname experiment remains strongly frame-dependent.**

- Changing from verbal instructions to demonstrations changes genre, position, context length and the implied distribution simultaneously. It does not isolate an unconditioned “prior.”
- Three fixed six-name contexts cannot characterize prompt variance. They even say “six” residents while requesting item 7.
- Scoring name tokens without a terminator measures token-prefix probabilities, not necessarily mutually exclusive completed-name events. Prefix overlaps and omitted spellings make “exact surname distribution” too strong ([vh_score.py:204](/Users/antra/truebasebench/docs/vh_score.py:204)).
- Renormalization over 2,000 names excludes most of the surname inventory. Conditional KL cannot establish preservation of the full population tail.
- DeepSeek-V3’s few-shot KL improves from 0.2188 to 0.2046 after post-training. The general claim that post-training thins this prior has exceptions already in the bundle.

**The composite embeds unvalidated preferences.** Calibration and domain spread partly double-count the same phenomenon. Clipping makes −0.10 and −0.92 identical on calibration; low Wikipedia recitation gives OLMo-2 Instruct a perfect memo component and an overall floor of 0.25. V4-Flash instruct scores 0.489, above Trinity Base’s 0.458. Averaging available components also makes incomplete measurements incomparable: removing both calibration components from V4-Flash would raise its reported average to approximately 0.977.

**There is substantial adaptive selection.** Features were selected after examining Trinity, OLMo and Qwen; anchors were set by eye; surname frames changed after the original probe behaved inconveniently. The website chooses the largest memorization increase as its demonstration and defines its pre-anneal band from the observed maximum. Its tail headline excludes effects below selected thresholds before computing the quoted range. These are acceptable exploratory choices if labelled as such, but they are not independent validation. I would describe this as post-hoc hypothesis and presentation selection, rather than allege misconduct or literal p-value manipulation.

**Cheap uncertainty estimates are available.** Preaggregate existing arrays by document: counts, sums of H and s, run-token counts, tail-event counts, and reliability-bin counts/hits/confidence sums. Bootstrap documents within domains, using the same resampled documents for paired comparisons; separately report a domain-resampling sensitivity analysis. Bootstrap whole rollouts for prior statistics and recompute the complete clipped score in every replicate. Publish 95% intervals, pairwise score-order probabilities and rank stability.

For scale, 7/32 marker-positive rollouts gives a 95% Wilson interval of approximately **11.0–38.8%**, while 10/32 gives **18.0–48.6%**. One additional positive rollout changes the overall four-component score by **0.01953** before clipping. Three-decimal presentation should not imply corresponding statistical resolution.

## 3. Specific errors and inconsistencies

1. **“Within ±0.02 in every domain” is false.**  
   [SPEC.md:32](/Users/antra/truebasebench/docs/SPEC.md:32) makes this claim. OLMo-2 stage1-2928B has mean absolute domain gap **0.0208445**, which mathematically requires at least one domain outside that interval. OLMo-3 stage-1 has minimum domain gap **−0.0209640**. The website’s check examines only negative domain minima, so it misses positive violations ([findings.ts:75](/Users/antra/truebasebench/site/src/findings.ts:75)). Its current OLMo-3 negative violation does trigger a Data note, but the stronger prose remains.

2. **OLMo-3 cross-entropy is similar, not identical.**  
   [JOURNAL.md:63](/Users/antra/truebasebench/docs/JOURNAL.md:63) says unseen-text CE is identical and prediction quality changed “nothing.” The bundle gives **1.534624 → 1.527521**, a decrease of **0.007102 nats/token**, versus an entropy decrease of **0.040206**. This still supports the confidence-shift interpretation; it does not support the absolute wording or statistical equivalence.

3. **The published fresh-text exposure is not uniformly approximately 1.3M positions.**  
   Summing `selfboot.reliability.bins[*][2]` gives:

   | Checkpoint | Fresh-text positions |
   |---|---:|
   | OLMo-2 checkpoints | 1,356,458 |
   | Trinity checkpoints | 1,294,813 |
   | DeepSeek-V3 Base / Chat | 440,859 |
   | Kimi-K2 Base / Instruct | 440,053 |
   | Cogito | 441,026 |

   The blanket account in [methodology.md:19](/Users/antra/truebasebench/site/src/content/methodology.md:19) does not explain this. The bundle lacks settings needed to distinguish shorter contexts, subsampling, missing records or another cause.

4. **Domain names are destructively truncated.**  
   [vh_analyze.py:269](/Users/antra/truebasebench/docs/vh_analyze.py:269) stores `F_CE_{name[:10]}`. English and non-English Wikipedia names both map to `F_CE_wikipedia_`; the bundle contains only **14** domain CE keys for the claimed **15** categories. The upstream corpus distinguishes those Wikipedia languages. The UI displays the surviving field simply as “Wikipedia” ([derive.ts:78](/Users/antra/truebasebench/site/src/data/derive.ts:78); [upstream corpus documentation](https://github.com/Jellyfish042/uncheatable_eval#readme)). This loses audit information even though spread is computed from the untruncated internal dictionary.

5. **The rare-genre inventory is wrong.**  
   [measure.md:21](/Users/antra/truebasebench/site/src/content/measure.md:21) says 12 genres. The bundle contains **13**, including **BookCorpus2**, omitted from the specification’s inventory.

6. **Surname summary labels disagree with the calculations.**  
   `vh_names_table.py` prints “sampled(desc)” and constructs `sm_desc`, but computes `junk`, `distinct` and `surpr` over **all sampled frames**, including few-shot ([vh_names_table.py:24](/Users/antra/truebasebench/docs/vh_names_table.py:24)). Separately, `top10_model` sums the model’s ten highest-probability names, not the ten most common Census names ([vh_score.py:240](/Users/antra/truebasebench/docs/vh_score.py:240)). The site’s “ten most common names” description is therefore ambiguous or wrong. Per-frame-family mass-on-set values promised by the prose are also absent: `inset` is one aggregate over all frames.

7. **The advertised CLI is not implemented consistently.**  
   `vh_selfboot.py` advertises `--corpus` but never parses it; its corpus path is hardcoded ([vh_selfboot.py:6](/Users/antra/truebasebench/docs/vh_selfboot.py:6)). `vh_tail.py` likewise hardcodes the results directory. The Measure page discloses manual source editing, but README’s analysis commands do not. More seriously, [measure.md:46](/Users/antra/truebasebench/site/src/content/measure.md:46) recommends the forced DeepSeek-class path for Kimi that the journal records as producing **CE 9.96** without a shadow-config workaround; that workaround is not part of the command recipe.

8. **The vLLM path tolerates incomplete or inconsistent recordings.**  
   Missing teacher-forced records are skipped, forced-token mismatches only warn, and incomplete rollout records leave zero-filled statistics ([vh_score_vllm.py:38](/Users/antra/truebasebench/docs/vh_score_vllm.py:38), [vh_score_vllm.py:183](/Users/antra/truebasebench/docs/vh_score_vllm.py:183)). Zero padding looks like perfectly deterministic generation. These are source-level integrity defects; the bundle is insufficient to establish whether published runs encountered them.

9. **The bundle is not sufficient to reproduce the primary analyses.**  
   It lacks per-domain gaps/counts, per-frame surname distributions, checkpoint revisions, run settings and corpus identifiers. No model has `surnames.top_names`, so the specified per-name comparison cannot be shown. Several of these additions are explicitly optional in DESIGN; their absence is not a schema violation, but it prevents checking the headline domain and surname claims from the publication alone.

10. **Some documentation and checks remain tied to old state.**  
    The site says “two families” have measured pre-anneal checkpoints; v3 has **three** ([findings.md:27](/Users/antra/truebasebench/site/src/content/findings.md:27)). The journal requests an OLMo-3 stage-1 checkpoint immediately after recording its measurement. Findings tests explicitly load **bench_v1**, so their “every check holds” assertion does not cover v3 ([findings.test.ts:5](/Users/antra/truebasebench/site/src/test/findings.test.ts:5)).

I found **no score arithmetic mismatch** in v3. ECE values also recompute from their published bins to approximately 1.4×10⁻¹⁷.

## 4. What would most strengthen the work next

Costs below are rough effort estimates, not measured runtime forecasts.

| Rank | Concrete next step | Approximate cost |
|---|---|---|
| 1 | Publish per-run provenance and resolve the 440k/1.3M exposure difference. Include checkpoint/tokenizer revisions, corpus hashes, document counts, truncation, BOS policy, precision, backend versions and integrity checks. | 1–2 researcher days; mostly existing files and CPU work. |
| 2 | Add document-cluster bootstrap intervals for primary features, paired changes and composite scores; rollout intervals for marker rates; rank-stability plots. | ½–1 day implementation; minutes to hours of CPU after preaggregation; no new inference. |
| 3 | Record predicted tail mass \(m_t(\tau)=\sum_{p_t(x)<\tau}p_t(x)\), compare it with observed tail events, and bin reliability by domain and predicted mass. Include \(\tau=e^{-10}\) to match the existing headline. | 1–2 days implementation; a new teacher-forced pass, storing a few additional scalars per position. |
| 4 | Run a temperature-scaling negative control on fixed documents. Test whether a scalar temperature removes most gap/spread separation while stage, token ranks and weights remain unchanged. | ½–1 day; begin with 100 documents and several representative checkpoints. |
| 5 | Validate on independent corpora selected before inspecting results: new dates, unfamiliar domains, additional languages, deduplicated sources. Use common character spans and multiple context lengths. | 2–4 days corpus/provenance work plus teacher-forced inference. |
| 6 | Add genuinely independent pre-anneal → anneal ladders, preferably with matched same-mixture continuation controls. Hold complete families out of development. | Several researcher days plus checkpoint download/storage and node-hours to node-days. |
| 7 | Fit anchors/weights only on training families, then evaluate held-out discrimination and ranking. Compare gap-only, ECE-only and unweighted-feature baselines; require consistent coverage. | About 1 day of CPU analysis once independent labels exist. |
| 8 | Validate markers on blinded annotations; increase rollouts to 128–256 with fixed exposure. Repeat surname scoring across 20–50 independently sampled demonstration sets, delimit completed names and publish frame-level results. | 1–3 days annotation/implementation; 4–8× current rollout cost, with surname scoring potentially substantial. |

Do not fit an isotonic ordering to all current checkpoints and report performance on those same checkpoints. That would formalize the present selection rather than validate it.

## 5. Website review

**What I could verify.** All six requested curl targets—`/`, `/methodology`, `/findings`, `/measure`, `/model/Trinity-Large-TrueBase`, `/data/manifest.json`—returned connection failures from this session. A Node process was listening on port 4180, so this does not establish that the server was down. Browser inspection was unavailable. The existing `site/dist/data` copies match repository data byte-for-byte; schema validation and TypeScript typechecking passed. Vitest could not execute tests because its temporary-directory writes were denied. I did not run a writing production build or test Docker/Caddy.

**Correctness and technical explanation**

- **Replace the main promise.** “1 = indistinguishable from a pre-anneal checkpoint” appears prominently at [Leaderboard.tsx:363](/Users/antra/truebasebench/site/src/pages/Leaderboard.tsx:363). No equivalence test supports that wording. Say “1 = all available features meet the hand-set reference thresholds.”
- **Separate evidence from causal interpretation.** “Inside a run the model is not predicting; it is reciting,” “nothing recallable,” and “post-training thins the tail” overstate the measurements. Long confident-correct runs are a memorization proxy; tail statistics need predicted-mass calibration; surname effects are frame- and family-dependent.
- **Claim checks are weaker than their associated claims.** The surname “ranked list” check only tests whether model top-10 mass exceeds Census top-10 mass ([findings.ts:227](/Users/antra/truebasebench/site/src/findings.ts:227)). Concentration does not establish Census order, name identity or list recitation.
- **The “one position” explainer uses corpus means.** Its constructed distribution matches `F_H`, while the “real token” marker is placed at mean `F_CE` ([position.tsx:68](/Users/antra/truebasebench/site/src/explainers/position.tsx:68)). The construction label helps, but the marked surprisal need not correspond to any token in that constructed distribution. Use an actual recorded position.
- **The surname dots imply information the data do not contain.** They are labelled “rank 1 top left,” although `exp(H)` is not a count of supported names or a rank-resolved tail. The field is capped at Census’s **1,018** dots, while DeepSeek-V3’s few-shot value is approximately **1,025** ([surnames.tsx:47](/Users/antra/truebasebench/site/src/explainers/surnames.tsx:47), [surnames.tsx:353](/Users/antra/truebasebench/site/src/explainers/surnames.tsx:353)).
- **Some ladder graphics imply false lineage.** Consecutive post-trained checkpoints are not grouped as parallel branches. Consequently, DeepSeek Base → Cogito → Chat is drawn sequentially despite Cogito being described as a separate Base finetune. The leaderboard sparkline also connects the parallel Llama-405B and 70B bases ([derive.ts:16](/Users/antra/truebasebench/site/src/data/derive.ts:16), [Leaderboard.tsx:124](/Users/antra/truebasebench/site/src/pages/Leaderboard.tsx:124)). Store explicit parent/branch metadata.

**Design and accessibility defects confirmed in source**

- **The desktop grid cannot fit at its breakpoint.** At 1100px, fixed tracks total **1184px**, plus 64px container padding: **1248px required**. `body { overflow-x:hidden }` conceals overflow instead of fixing it ([base.css:12](/Users/antra/truebasebench/site/src/styles/base.css:12), [base.css:35](/Users/antra/truebasebench/site/src/styles/base.css:35)). Use flexible tracks or raise the breakpoint.
- **Mobile sub-scores disappear from the accessibility tree.** Desktop sub-score cells become `display:none`, while their visible mobile replacement has `aria-hidden="true"` ([pages.css:72](/Users/antra/truebasebench/site/src/styles/pages.css:72), [Leaderboard.tsx:583](/Users/antra/truebasebench/site/src/pages/Leaderboard.tsx:583)).
- **“Raw features” does not change mobile values.** `MicroBars` always renders scores and receives no `raw` state, although sorting can switch to raw values ([Leaderboard.tsx:79](/Users/antra/truebasebench/site/src/pages/Leaderboard.tsx:79), [Leaderboard.tsx:275](/Users/antra/truebasebench/site/src/pages/Leaderboard.tsx:275)).
- **Provenance tooltips are fragile.** They anchor to the left of each number without viewport collision handling, and use `pointer-events:none`; rightmost values can produce clipped, unselectable provenance text ([base.css:189](/Users/antra/truebasebench/site/src/styles/base.css:189)). Every `Num` is also a tab stop, creating a long keyboard path through dense tables.
- **Chart targets are undersized.** The shared mark’s hit circle is only **18px across**, below DESIGN’s own 40px phone target requirement ([Chart.tsx:157](/Users/antra/truebasebench/site/src/components/Chart.tsx:157)).

**Engineering and deployment**

- **The fetch timeout stops too early.** It is cleared once headers arrive, before `r.text()`. A stalled body can therefore leave the application loading indefinitely; repository fallback requests have no timeout ([load.ts:34](/Users/antra/truebasebench/site/src/data/load.ts:34)). Apply a deadline through body consumption.
- **Runtime validation accepts data that can break rendering.** I passed it a bundle containing `reference:null`, `score:900` and a string-valued calibration sub-score; it returned **no errors** ([validate.ts:9](/Users/antra/truebasebench/site/src/data/validate.ts:9)). Validate nested structures and score bounds before accepting live data, with a page-level error boundary and fallback.
- **“Matches bundle” does not mean recomputed from features.** The model page averages stored sub-scores rather than recalculating them from the fingerprint ([ModelPage.tsx:203](/Users/antra/truebasebench/site/src/pages/ModelPage.tsx:203)). Build-time tests check the stronger property, but independently updated live data bypass those local tests.
- **Method versioning is incomplete.** The anchors table honors `reference.ramps`; transfer plots and score helpers import static `RAMPS`. Future bundle-specific anchors could be described one way and plotted another. There is also no bundle-version selector or version-pinned model route: citation links always load the latest data.
- **Dependencies need maintenance before deployment.** [Dockerfile:13](/Users/antra/truebasebench/Dockerfile:13) pins Node 20, now EOL according to the [Node release table](https://nodejs.org/en/about/previous-releases). [package.json:34](/Users/antra/truebasebench/site/package.json:34) pins Vite 5.4.8, affected by the project’s documented development-server cross-origin exposure vulnerability; that is a developer-machine concern, distinct from the Caddy static runtime. See the [Vite advisory](https://github.com/vitejs/vite/security/advisories/GHSA-vg6x-rcgg-rjx6).
- **Production configuration is not production verification.** The Caddy configuration includes asset caching, real asset/data 404s, compression and security headers. Those paths still need an executed container smoke test, including the configured remote data origin, stalled/invalid bundle behavior and responsive/browser accessibility checks.
- **Public reproducibility links depend on optional configuration.** Both repository and data URLs default empty. That removes script links and produces a placeholder corpus-download command ([config.ts:4](/Users/antra/truebasebench/site/src/lib/config.ts:4), [Measure.tsx:14](/Users/antra/truebasebench/site/src/pages/Measure.tsx:14)). A public benchmark build should fail validation when its reproducibility destinations are missing.

## 6. Three questions before citing this benchmark

1. **What exact checkpoint revisions, corpus revisions, cutoffs and evaluation settings produced each row—and why do several fresh-text passes contain approximately one-third as many positions?**
2. **Does a prespecified score discriminate held-out training families after controlling tokenizer, size, context, precision and output temperature, with document- and rollout-level uncertainty reported?**
3. **What independently testable property defines “true base,” and why should these four weighted proxies predict that property—or usefulness for interpretability—rather than merely reproduce the labels and examples used to design them?**