# Methodology

True Base Bench measures how close a language-model checkpoint is to an *ideal base model*: one whose next-token distribution is an honest density model of text — calibrated on text it has never seen, nothing memorised beyond its training distribution, no instruction-shaped prior. The ideal is a property of the distribution, not a reference checkpoint; empirically, checkpoints from the long first phase of pretraining (before the learning-rate anneal, mid-training data mixes and any post-training) sit at that ideal, which is why they set the anchors of the score. Nothing here is a benchmark question. Every feature is a statistic of the model's own next-token distribution, read on fixed text that is the same for every model.

The measurement is reference-free. No model is scored against another model's outputs, and no answer is judged right or wrong. A pre-anneal checkpoint has been trained toward the data and nothing else, so on text it has never seen it expects as much surprise as it gets. Annealing on curated mixes, distillation, instruction tuning and preference optimisation each leave a different mark on that distribution, and the four sub-scores are built to tell those marks apart.

Numbers quoted on this page are read live from the current data bundle; each one links to the bundle field it came from. Constants that define the method (ramp anchors, run lengths, thresholds) are marked as definitions.

## Three ramps, one score {#score}

The score is a function of three features, each defined in its own section below: the [calibration gap](#calibration-gap) on post-cutoff text, its [spread across domains](#calibration-gap), and the [instruction-shaped prior](#prior) of the model's own samples. Two further measurements, [verbatim runs](#verbatim-runs) and [the surname test](#surnames), are [validation probes](#probes): shown beside the score, not part of it. This section only says how the three features become one number; read it first and come back to it after the definitions, or skip ahead to the [pipeline](#pipeline).

Each sub-score is a clipped linear ramp. With feature value x, true-base anchor a (scores 1) and post-trained anchor b (scores 0):

> sub-score = clip((x − b) / (a − b), 0, 1)

The anchors, features and fallbacks; the `scored` column says which ramps are terms of the overall in this bundle:

{{block:anchors}}

For calib, a positive gap is clipped to 0 before the ramp, so under-confidence is not rewarded beyond a perfect score. The anchors were set from the Trinity TrueBase / Base / Preview triple and checked against the OLMo-2 ladder.

**Overall = the mean of the available scored sub-scores** ({{val:scored-list}}). A sub-score is unavailable when its feature and its fallback are both missing; the leaderboard shows how many sub-scores went into each overall score. A score of 1 means "indistinguishable from a pre-anneal checkpoint on these {{val:n-scored}} axes". It is a distance from a true base, not a quality ranking; which end of the axis is desirable depends on what the checkpoint is for.

**Score v1.** The first version of the score (v0, bundles 1–6) averaged four ramps: the three above and `memo`, the share of Wikipedia recited verbatim. v1 keeps the memo ramp but takes it out of the mean, and it never admitted the surname test. The reason is what the two measure: the verbatim share responds to one anneal recipe (up-weighting a source the model can then recite), and the surname test to one prompt; both are things a base-like model *should* exhibit rather than statistics of its next-token distribution on unseen text. Scoring them made the score partly circular as evidence — a checkpoint "looked base-like" in part because it did not recite Wikipedia. Under v1 the score is built only from the distribution (calibration gap, domain spread, instruction prior), and the claim is testable: a checkpoint that scores base-like should show little recitation and a population-matching few-shot surname distribution. The next section checks that. Bundles record which version they use (`reference.score_version`, `reference.scored_subscores`; each `subscores.<k>.scored`), and the site recomputes every score with the bundle's own list.

{{explainer:score}}

## Validation probes {#probes}

Two measurements are shown beside the score and are not terms of it: the **Wikipedia verbatim share** (`X_runfrac_wiki`, the memo feature, with its v0 ramp still drawn as a faint bar on the leaderboard) and the **few-shot surname KL** (`surnames.KL_few`, the mean KL(Census ‖ model) over the three few-shot frames). A score that is only a function of the next-token distribution on unseen text should order both: less recitation and a thinner-tailed surname distribution are what post-training and memorising anneals do, and neither entered the ramps.

{{block:probes}}

Read-off, verbatim share: over the {{val:n-memo}} checkpoints with both values, Spearman ρ between the overall score and the verbatim share is {{val:rho-memo}} — {{val:memo-verdict}}. Read-off, surname test: over the {{val:n-kl}} checkpoints with a surname result, ρ between the score and the few-shot KL is {{val:rho-kl}} — {{val:kl-verdict}}. Negative values mean the score predicts the probe in the expected direction (a more base-like score, less recitation or a smaller KL). The two probes are different kinds of check. The surname distribution is a property of the next-token distribution itself, so a score built from that distribution should order it, and the panel says whether it does. The verbatim share is a property of the anneal *recipe*: a checkpoint can score base-like and still have recited Wikipedia if its anneal up-weighted it, and the panel shows base-like scores spanning the full range of recitation. That is why the second probe is carried by a flag rather than a term.

**Recitation flag.** Taking memo out of the mean lets a checkpoint whose anneal recited Wikipedia read as the base-like distribution it is; the flag keeps the second fact visible instead of averaging it away. A checkpoint is **flagged** ("recites" beside its name on the leaderboard and its model page) when its Wikipedia verbatim share is at or above the memo ramp's 0-anchor, {{val:recite-anchor}}, and marked **elevated** when it is above the 1-anchor, {{val:recite-elevated-anchor}}, but below the flag. Flagged in this bundle ({{val:recite-n}}): {{val:recite-list}}.

**Quantisation controls.** A checkpoint too large for the eight GPUs at its released precision can be measured after its experts are re-quantised to MXFP4 (`vh_convert_v4_fp4.py`); to know what that does to the statistics, every such conversion is paired with the same checkpoint at its released precision, measured either directly or with its weights streamed from host RAM (`--cpu-offload-gb`). In the worked example, {{val:quant-control}} reads {{val:quant-control-gap}} against {{val:quant-release-gap}} for {{val:quant-release}}, an offset of {{val:quant-delta}}. Every pair in the bundle:

{{block:quant-pairs}}

Weight precision alone moves the gap by about a hundredth of a nat, in the direction of *more* calibrated (rounding adds a little entropy without changing what the text costs), by the same amount on checkpoints of different size; it slightly lowers the verbatim share (exact runs are easier to break than to make) and leaves ECE, the exact prior and the surname test unchanged within their intervals. The controls stay in the bundle so the offset is always visible next to the rows it applies to.

## The measurement pipeline {#pipeline}

Each checkpoint goes through the same scripts (`vh_score.py` with HF transformers, or `vh_score_vllm.py` with vLLM) on the same text. There are three kinds of pass.

**Teacher-forced passes.** The real document is fed in and, at every position, the exact full-vocabulary next-token distribution is reduced to five numbers: entropy H, varentropy V, surprisal s of the real next token, top-1 probability p1 and the rank of the real token. No top-k truncation is applied. Four corpora are read this way:

| pass | text | size | role |
|---|---|---|---|
| `tf` | Pile documents (NeelNanda/pile-10k, fixed seeded selection, at least 400 characters) | 400 documents, at most 2048 tokens each, about 290k tokens | in most pretraining sets, so it also measures recall; fallback for features that need post-cutoff text |
| `tf_wiki` | Wikipedia and GitHub documents | 150 + 60 documents | memorisation features |
| `tf_fresh` | UncheatableEval 2026-04: AO3, arXiv, bioRxiv, BBC, GitHub, Wikipedia and others, 15 categories | 900 documents, about 1.3M tokens | written after every measured model's cutoff; drives the calibration scores | The FP8 mixture-of-experts giants (DeepSeek-V3 base/chat, Kimi K2 base/instruct, Cogito) were measured on a 300-document subset (20 per category, ≈441k positions) for runtime; `F_n_positions` in the bundle records the exposure per model.
| `tf_weird` | rare-genre Pile documents: Enron, OpenSubtitles, HackerNews, DM Mathematics, NIH, FreeLaw, USPTO, YouTube subtitles, EuroParl, PhilPapers, Ubuntu IRC, PG-19 | 199 documents | per-genre gap and verbatim share (shown, not scored) |

**Own samples.** 32 sequences from a bare `<bos>` and 32 continued from 32-token document openers, 1536 steps each (1024 for the FP8 giants, to fit memory), at temperature 1 with no truncation. Sampling continues past end-of-text. H, V, s and p1 are recorded at every step, where s is now the surprisal of the token the model itself sampled.

**Surname probe.** The exact distribution over US surnames under six prompts, plus sampled lists under the same prompts (see [the surname test](#surnames)).

The analysis scripts then turn the per-position arrays into a fingerprint: `vh_analyze.py` (fingerprint features, including the calibration and prior features), `vh_memo.py` (verbatim runs), `vh_selfboot.py` (top-1 reliability and own-sample lexical statistics), `vh_tail.py` (realised tail statistics), `vh_names_table.py` (surname and rare-genre tables) and `vh_truebase.py` (sub-scores and the overall score). [Measure your model](/measure) gives the commands.

## One position: entropy and surprisal {#position}

At one position the model assigns a probability p(x) to every token x in its vocabulary. Three numbers summarise it, all in nats:

- **Entropy** H = −Σₓ p(x) log p(x): the surprise the model expects.
- **Varentropy** V = Σₓ p(x) (−log p(x) − H)², the variance of the surprise, is stored too. It enters no sub-score and no finding; see [Limits](#limits) for what it showed.
- **Surprisal** s = −log p(y) of the token y that actually came next: the surprise the model got.

Alongside these the scripts store p1, the probability of the top-1 token, and the rank of y (0 when the model's top choice was right).

{{explainer:position}}

## Teacher forcing on a fixed corpus {#teacher-forcing}

Teacher forcing feeds the real document one token at a time and records the distribution before each real token. Nothing is sampled and nothing is judged; the model's choice never changes what it sees next. Because every checkpoint reads exactly the same tokens of exactly the same documents (re-tokenised by its own tokenizer), per-corpus means are directly comparable across models with the same tokenizer and comparable in shape across tokenizers.

The own-sample pass is the opposite: the model writes, and the statistics describe the text it chose. Its surprisal is the surprisal of its own samples, so its mean equals its mean entropy in expectation; own samples are used for the prior (what the model writes from nothing) and for lexical statistics, not for calibration.

{{explainer:teacher-forcing}}

## The calibration gap {#calibration-gap}

The calibration gap on a corpus is

> gap = mean over positions of (H − s)

If the real next token were drawn from the model's own distribution, E[s] would equal H at every position and the gap would be zero. A model trained by maximum likelihood toward a data distribution, and evaluated on fresh text from that distribution, approaches this: its expected surprise matches its realised surprise. A **negative** gap means the model is more surprised than it expected to be: it is over-confident. A positive gap means it is under-confident.

Recalled text breaks this logic in the other direction (a memorised document is less surprising than the model's entropy implies), so the scored feature is read on post-cutoff text:

- `F_calib_gap` = mean(H − s) over all `tf_fresh` positions. If a checkpoint has no `tf_fresh` pass, the Pile `calib_gap` is used and the model page says so.
- `F_gap_domain_absmean` = the mean over the UncheatableEval categories of |mean(H − s) within that category|, counting each category with more than 2,000 tokens. A model can have a small overall gap by being over-confident in one genre and under-confident in another; this feature catches miscalibration that has spread across genres.

In this bundle every pre-anneal checkpoint sits within ±{{val:pre-band}} of zero on post-cutoff text, and the most negative single-domain gap of any of them is {{val:pre-domain-min}}. For comparison, specimen A ({{val:spec-a}}) reads {{val:spec-a-gap}} and specimen B ({{val:spec-b}}) reads {{val:spec-b-gap}}.

Also shown, not scored:

- **ECE** of the top-1 prediction on `tf_fresh`: positions are binned by p1 into 10 equal-width bins, and ECE is the position-weighted mean of |hit rate − mean p1| across bins. The reliability diagram on each model page plots the bins.
- **Gap where uncertain**: mean(H − s) restricted to positions with H > 4 nats.

{{explainer:calibration-gap}}

## Temperature-scaling cost {#temperature}

The gap says in which direction a model is miscalibrated; it does not say what that costs. The `tf_temp` pass reads the same 300 post-cutoff documents and records the real token's surprisal after the logits are divided by a temperature T, for T ∈ {0.8, 0.9, 1.0, 1.1, 1.25}; the cost is read from the five mean cross-entropies (`vh_temp.py`). The **temperature-scaling cost** is the cross-entropy the model would gain from the one global rescaling:

> C = CE(T = 1) − min over T of CE(T), nats per token

with T* the minimiser, read from a local parabola through the three grid points around the measured minimum. T* is clipped to the measured range, and a row whose minimum sits at the edge of the grid (`T_star_at_bound`) is shown as "≥": its C is a lower bound. The gap is the slope of this curve at T = 1, exactly — at every position H − s = z_y − E_p[z], which is the derivative of −log softmax(z / T)[y] with respect to log T at T = 1:

> dCE/dlogT at T = 1 = gap = mean(H − s), so C ≈ gap² / (2 · curvature)

where the curvature is, to leading order, the variance of the model's own surprisal under its distribution: varentropy is the quantity that converts the gap into a cost. The bundle carries the gap on this pass (`gap_pass`) and, as the measured check, the central difference (CE(1.1) − CE(0.9)) / (ln 1.1 − ln 0.9) (`slope_central`), which runs a few thousandths steeper than the exact value because the curve is asymmetric about T = 1.

{{block:temp}}

What C adds over the gap: it is **two-sided** (over- and under-confidence both give C > 0, so a positive gap no longer hides as "clipped to 1"), it is a **cost in nats** rather than a direction, and it is **noise-proof** in the sense the quantisation controls demanded: rounding noise that adds entropy moves the gap by hundredths of a nat and C by a ten-thousandth, because the extra entropy is paid for at every temperature. What it shares with the gap: both describe one global rescaling. A model that is over-confident in one genre and under-confident in another can have a small C and still be wrong everywhere; the per-domain minimisers, `T_star_domain_range` ({{val:temp-a}}: {{val:temp-a-range}}), are the spread analogue, and the model page lists them.

In this bundle, C spans {{val:temp-base-range}} nats/token over the {{val:temp-n-base}} pre-anneal, mid-anneal and released-base checkpoints (T* within {{val:temp-base-tstar}}) and {{val:temp-post-range}} over the {{val:temp-n-post}} post-trained ones ({{val:temp-n-bound}} at the grid's edge); specimen A ({{val:temp-a}}) reads {{val:temp-a-C}} and specimen B ({{val:temp-b}}) {{val:temp-b-C}}. **C is reported, not scored.** It is the candidate calibration term for score v2, once a bundle has it for every checkpoint and its anchors have been checked against the ladders the gap was anchored on.

## Verbatim runs {#verbatim-runs}

A **verbatim run** is a streak of at least {{def:RUN_MIN_LEN|count}} consecutive positions in one document where the model's top-1 prediction is the real token and its entropy is below {{def:RUN_H_MAX|num2}} nats. Inside a run the model is not predicting; it is reciting.

The memo feature `X_runfrac_wiki` is the share of tokens in the 150 Wikipedia documents of `tf_wiki` that fall inside verbatim runs. Wikipedia is in almost every pretraining set, so some recall is normal; what moves the feature is an anneal that up-weights Wikipedia-like sources and trains on them at a low learning rate. When `X_runfrac_wiki` is missing, `verbatim_run_frac_wiki`, the same share computed on the smaller set of Wikipedia documents inside the Pile selection, is used and flagged.

The same rule gives the verbatim share per genre on `tf_weird` (shown, not scored).

{{explainer:verbatim-runs}}

## The instruction-shaped prior {#prior}

`roll_instr_marker_rate` is the share of the 32 bare-`<bos>` samples that contain at least one chat or instruction marker as a substring: role headers and chat-template tokens (`Assistant:`, `<|im_start|>`, `<|start_header_id|>`), instruction headings (`### Instruction`, `### Response`), assistant boilerplate (`As an AI`, `I hope this helps`, `Sure, here`) and reasoning-format strings (`step by step`, `Final Answer`, `\boxed{`). The full list is `MARKERS` in `vh_analyze.py`. A pre-anneal checkpoint, asked to write from nothing, writes the web. A model whose training mix contained instruction data writes that data back, even when no prompt asks for it. With 32 samples the rate moves in steps of 1/32.

## The surname test {#surnames}

The surname test (after Gwern) compares the model's distribution over US surnames with the population distribution in the 2010 US Census. It is the one probe here that has an external reference, and it separates two behaviours that the other features cannot: knowing what a "list of common surnames" looks like, and being able to draw from the distribution.

**Exact distribution.** For the 2,000 most common Census surnames, the scripts compute log P(name | prompt) at the list slot, summing the Title-case and ALL-CAPS spellings (name tokens only, no terminator). KL and entropy are computed on the distribution renormalised over the set; the raw mass on the set is reported separately. Six prompts are used:

- three **described** frames, which say in words that the list is random or frequency-weighted, and read the distribution at item 1;
- three **few-shot** frames, which give six genuine Census draws as items 1 to 6 and read the distribution at item 7.

Per frame family (the mean over its three frames) the bundle reports KL(Census ‖ model), the model's entropy over the set against the Census entropy over the same set ({{num:reference.census_entropy_top2000|nats}}), the mass on the ten most common names and the total mass on the set.

**Sampled lists.** Under each frame, 16 lists of 400 tokens at temperature 1. From the parsed names: the distinct share and the junk share (names not among the {{def:CENSUS_SURNAMES|count}} Census surnames). Both are own-sample diversity measures — post-training lowers them, as it lowers the type-token ratio of free-running text — and they are shown, not scored. (The mean −log p_Census of generated names is kept in the bundle as `surnames.surpr`; it adds nothing to these two.)

The surname test is shown, not scored.

{{explainer:surnames}}

## Tail statistics {#tail}

For each teacher-forced corpus (`tf`, `tf_fresh`, `tf_weird`) `vh_tail.py` records how the real text falls in the model's tail: the share of real tokens with s > 7 and s > 10 nats, the share with rank > 100 and rank > 1000, mean cross-entropy, mean entropy, the 99th percentile of s and the gap at positions with H > 4. A token at s > 10 is one the model gave less than about 1 in 22,000; on post-cutoff text these are real tokens the model treated as near-impossible. Shown, not scored.

## Predicted tail mass {#tail-mass}

The realised tail statistics above say how often real text fell where the model put little mass; they do not say how much mass the model *expected* to spend there. Both scorers now record, at every teacher-forced position, the **predicted tail mass** m_k: the total probability the model assigns to tokens with p < 10⁻ᵏ, for k = 2, 3, 4. The matching **realised rate** r_k is the share of real next tokens whose surprisal exceeds k·ln 10, that is, tokens the model had placed below that threshold.

For a density model the two agree in expectation: r_k ≈ E[m_k]. The ratio r_k / E[m_k] is the tail's reliability. Above 1, the model's "impossible" set contains more real text than it admits (the tail is thinner than it should be); below 1, the model spreads more mass over the tail than real text ever uses. The tail reliability diagram sorts positions into quartiles of m_k and plots the mean predicted mass against the mean realised rate in each; points below the diagonal are over-confident in the tail, and the lowest quartile is where the model was surest.

This pass (`tf_tail`) reads the same 300-document post-cutoff subset for every model, so the giants and the small models are on the same text. Shown, not scored.

## Out-of-distribution genres {#ood}

A second corpus (`tf_ood`, 140 documents) asks the same questions on text that no training mix resembles, in genres with a known right answer:

- **hex dumps** and **base64** of random bytes: pure noise. The only correct behaviour is near-uniform over the admissible symbols, so a negative gap here is over-confidence with no excuse, and the realised tail rate measures how often the model called a random symbol impossible;
- **minified JavaScript** from this site's own production build;
- **chess PGN** from random-walk games (legal moves, no plan);
- **random DNA** in FASTA layout;
- **word-shuffled English** from Pile documents, where the vocabulary is familiar and the order is not;
- **random numeric CSV**.

Per genre the bundle carries the cross-entropy, the calibration gap and the tail reliability. Shown, not scored.

## Exact prior mass on chat openers {#prior-exact}

The instruction-shaped prior above is read off 32 samples, so its 95% interval is about ±0.15. The exact probe replaces sampling with a sum: for 20 chat and instruction openers (ChatML `<|im_start|>user`, Llama-3 headers, `<|user|>`, `<start_of_turn>user`, `<|User|>`, `[INST]`, the Alpaca header and `### Instruction:`, `### Human:`, `Human:`, `User:`, `Q:`, `Question:`, `Instruction:`, `Prompt:`, `You are a helpful assistant`, `Write a`, `The following is a conversation between`) and 15 natural document starts as controls (`The`, `In`, `# `, `import`, `Chapter 1`, `<!DOCTYPE html>`, a digit, a newline, a quote, …), the scripts compute log P(the document starts with this string | start token) by teacher-forced replay, summing per-token surprisals. No opener is a prefix of another, so the sum over a set is the probability that a document begins with any of them: the **instruction mass** and the **control mass**. For tokenizers that add no start token (Qwen) the end-of-text token is used as the document start, which is how those models see a document boundary.

One forward pass per template, exact, no sampling noise. Two details matter. Templates are scored **stripped of trailing whitespace**: a template ending in a space or newline costs 3–7 extra nats in every tokenizer, because the next word normally carries its own leading space, so "Question: " under-reads "Question:" by two orders of magnitude (the raw sums are kept in the bundle under `prior.raw`). And the probe only sees a chat template when the tokenizer treats it as one token: a post-trained model that was tuned on `<|user|>` split into `<`, `|`, `user`, … puts almost all of its start mass on the first piece and then diverges from any template in the list, so for post-trained models the instruction mass reads near zero while the **start-token distribution** (`prior.start`: entropy and top-1 probability of the first token after the document start) shows the collapse — OLMo-2 Instruct answers the document start with 1.3 nats of entropy and 85% on `<`, where its stage-1 checkpoint has 6.9 nats. The exact mass is therefore a measure for *bases* (instruction data in the pretraining mix), the start entropy a measure for post-trained checkpoints. Models whose tokenizer never emits a start token are flagged `unreliable`: after a prepended one their first-token distribution is not a document prior.

The model page shows both masses on a log axis next to the sampled marker rate with its interval. It is displayed alongside the `prior` sub-score and does not replace it in the score.

## Uncertainty {#uncertainty}

The bundle carries 95% intervals for the headline statistics, from a document-level clustered bootstrap (2,000 resamples of whole documents, percentile intervals; `vh_boot.py`): the calibration gap, the per-domain spread, top-1 ECE, the Wikipedia verbatim share, the tail-reliability ratios, and the sampled marker rate (resampled over rollouts). The surname KLs are reported with their range over the three frames of each kind, because three frames are too few to bootstrap.

What the intervals cover: sampling of documents from the fixed corpus, for one model and one tokenizer. What they do not cover: the choice of corpus, the anchors of the ramps, tokenizer differences between models, or run-to-run numerical variation in the inference stack. The gap intervals are narrow (a few thousandths of a nat) because the corpus is large; the verbatim share rests on 60 Wikipedia documents and the marker rate on 32 samples, and their intervals say so.

## Own-sample lexical statistics {#lexical}

`vh_selfboot.py` takes the first 700 words of each bare-`<bos>` sample (samples with fewer than 60% of that budget are dropped) and computes type-token ratio, hapax share and distinct 4-gram share, against the same statistics on Pile documents at the same budget (the reference values ship in `reference.pile_lexical`; Zipf slope and gzip ratio are computed too and kept in the bundle, but neither orders the stages). Free-running samples at T = 1 can fall into single-glyph or short-loop attractors; these statistics show it. They are shown and not scored, because the collapse is not diagnostic: pre-anneal and annealed checkpoints both do it (see [Findings](/findings#f4)).

## Limits {#limits}

- **The gap is one-sided.** mean(H − s) = 0 is necessary for calibration, not sufficient, and anything that adds entropy closes a negative gap from the hedging side: temperature above 1, dropout, rounding noise in quantised weights. The quantisation controls show it directly — MXFP4 experts raise cross-entropy by about 0.006 nats per token (the text costs more) while the gap moves 0.013 nats toward zero, and ECE does not change. Pre-anneal checkpoints are the interesting case because they sit at zero at T = 1 with no such cost. The [temperature-scaling cost](#temperature) is the two-sided statistic: zero for an honest model, positive for over- and under-confidence alike, and unmoved by the quantisation controls; it is reported in this bundle and is the candidate calibration term for score v2.
- **Carried in the bundle, not shown.** Several statistics from the project's first pass are in every bundle but on no page, because they turned out to carry no stage signal: the Wasserstein-1 distances between teacher-forced and free-running entropy and varentropy distributions (`W1(TF_H, roll_H)`, `W1(TF_V, roll_V)`, the original "does the model's own text look like the data" probe), the Pile cross-entropy of the `tf` pass (recall, not calibration; its rank correlation with the gap is 0.00), the Zipf slope and gzip ratio of own samples, and the mean Census surprise of sampled surnames. They stay in the data contract so old bundles remain readable.
- **Varentropy is recorded but not scored.** The project began as a varentropy sweep, and V is kept in every per-position array and in the fingerprint (`F_V/H|H>1`, `Vmed|H2-3`, `roll_V_bos`, `W1(TF_V, roll_V)`, all on the model page). On teacher-forced text it does not order the stages: V/H at H > 1 has stage medians of about 1.9 (pre-anneal), 2.0 (anneal), 1.7 (base) and 1.8 (post-trained). On a model's own bare-BOS samples it does fall through the ladder (medians about 5.2 → 3.1 → 3.0 → 1.6, rank correlation 0.73 with the calibration gap), but it varies across families as much as across stages (two released bases sit at 0.7 and 5.5), so without per-family normalisation it says nothing the gap does not. It stays reported in case a later bundle changes that — and it has a definite role in the [temperature-scaling cost](#temperature): the curvature that converts the gap (the slope of CE(T) at T = 1) into a cost in nats is, to leading order, the varentropy.

- The anchors come from two families. A recipe that changes the distribution in a way none of the three scored features sees will score as a true base; the [validation probes](#probes) are the first place that would show.
- `prior` rests on 32 samples and a marker list; a model that has seen instruction data but never emits its markers unprompted is not caught by it. The [exact prior mass](#prior-exact) is the planned replacement; until it has been measured on every checkpoint it is shown, not scored.
- `memo` depends on Wikipedia being in the anneal mix. An anneal on other sources can memorise without moving it; the per-genre verbatim shares on `tf_weird` are there to check. Since score v1 it is a [validation probe](#probes), not a term of the score.
- The post-cutoff corpus is post-cutoff for every model measured so far. A checkpoint trained on data from after April 2026 needs a newer corpus, and the bundle would need a new version.
