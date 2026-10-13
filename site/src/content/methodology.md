# Methodology

True Base Bench measures how far a language-model checkpoint sits from a *pre-anneal pretraining base*: a checkpoint from the long first phase of pretraining, before the learning-rate anneal, mid-training data mixes and any post-training. Nothing here is a benchmark question. Every feature is a statistic of the model's own next-token distribution, read on fixed text that is the same for every model.

The measurement is reference-free. No model is scored against another model's outputs, and no answer is judged right or wrong. A pre-anneal checkpoint has been trained toward the data and nothing else, so on text it has never seen it expects as much surprise as it gets. Annealing on curated mixes, distillation, instruction tuning and preference optimisation each leave a different mark on that distribution, and the four sub-scores are built to tell those marks apart.

Numbers quoted on this page are read live from the current data bundle; each one links to the bundle field it came from. Constants that define the method (ramp anchors, run lengths, thresholds) are marked as definitions.

## The measurement pipeline {#pipeline}

Each checkpoint goes through the same scripts (`vh_score.py` with HF transformers, or `vh_score_vllm.py` with vLLM) on the same text. There are three kinds of pass.

**Teacher-forced passes.** The real document is fed in and, at every position, the exact full-vocabulary next-token distribution is reduced to five numbers: entropy H, varentropy V, surprisal s of the real next token, top-1 probability p1 and the rank of the real token. No top-k truncation is applied. Four corpora are read this way:

| pass | text | size | role |
|---|---|---|---|
| `tf` | Pile documents (NeelNanda/pile-10k, fixed seeded selection, at least 400 characters) | 400 documents, at most 2048 tokens each, about 290k tokens | in most pretraining sets, so it also measures recall; fallback for features that need post-cutoff text |
| `tf_wiki` | Wikipedia and GitHub documents | 150 + 60 documents | memorisation features |
| `tf_fresh` | UncheatableEval 2026-04: AO3, arXiv, bioRxiv, BBC, GitHub, Wikipedia and others, 15 categories | 900 documents, about 1.3M tokens | written after every measured model's cutoff; drives the calibration scores |
| `tf_weird` | rare-genre Pile documents: Enron, OpenSubtitles, HackerNews, DM Mathematics, NIH, FreeLaw, USPTO, YouTube subtitles, EuroParl, PhilPapers, Ubuntu IRC, PG-19 | 199 documents | per-genre gap and verbatim share (shown, not scored) |

**Own samples.** 32 sequences from a bare `<bos>` and 32 continued from 32-token document openers, 1536 steps each (1024 for the FP8 giants, to fit memory), at temperature 1 with no truncation. Sampling continues past end-of-text. H, V, s and p1 are recorded at every step, where s is now the surprisal of the token the model itself sampled.

**Surname probe.** The exact distribution over US surnames under six prompts, plus sampled lists under the same prompts (see [the surname test](#surnames)).

The analysis scripts then turn the per-position arrays into a fingerprint: `vh_analyze.py` (fingerprint features, including the calibration and prior features), `vh_memo.py` (verbatim runs), `vh_selfboot.py` (top-1 reliability and own-sample lexical statistics), `vh_tail.py` (realised tail statistics), `vh_names_table.py` (surname and rare-genre tables) and `vh_truebase.py` (sub-scores and the overall score). [Measure your model](/measure) gives the commands.

## One position: entropy, varentropy, surprisal {#position}

At one position the model assigns a probability p(x) to every token x in its vocabulary. Three numbers summarise it, all in nats:

- **Entropy** H = −Σₓ p(x) log p(x): the surprise the model expects.
- **Varentropy** V = Σₓ p(x) (−log p(x) − H)²: the variance of the surprise under the model's own distribution. A distribution with one strong candidate and a long flat tail has high V; a uniform choice among a few tokens has V = 0.
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

**Sampled lists.** Under each frame, 16 lists of 400 tokens at temperature 1. From the parsed names: the distinct share, the junk share (names not among the {{def:CENSUS_SURNAMES|count}} Census surnames) and the mean −log p_Census(name) of generated in-Census names, against the Census self-entropy of {{num:reference.census_self_entropy_all|nats1}}. A model that only produces the most common names scores far below the self-entropy; a model that invents names shows a high junk share.

The surname test is shown, not scored.

{{explainer:surnames}}

## Tail statistics {#tail}

For each teacher-forced corpus (`tf`, `tf_fresh`, `tf_weird`) `vh_tail.py` records how the real text falls in the model's tail: the share of real tokens with s > 7 and s > 10 nats, the share with rank > 100 and rank > 1000, mean cross-entropy, mean entropy, the 99th percentile of s and the gap at positions with H > 4. A token at s > 10 is one the model gave less than about 1 in 22,000; on post-cutoff text these are real tokens the model treated as near-impossible. Shown, not scored.

## Own-sample lexical statistics {#lexical}

`vh_selfboot.py` takes the first 700 words of each bare-`<bos>` sample (samples with fewer than 60% of that budget are dropped) and computes type-token ratio, hapax share, distinct 4-gram share, Zipf slope and gzip ratio, against the same statistics on Pile documents at the same budget (the reference values ship in `reference.pile_lexical`). Free-running samples at T = 1 can fall into single-glyph or short-loop attractors; these statistics show it. They are shown and not scored, because the collapse is not diagnostic: pre-anneal and annealed checkpoints both do it (see [Findings](/findings#f4)).

## Four ramps, one score {#score}

Each sub-score is a clipped linear ramp. With feature value x, true-base anchor a (scores 1) and post-trained anchor b (scores 0):

> sub-score = clip((x − b) / (a − b), 0, 1)

The anchors, features and fallbacks:

{{block:anchors}}

For calib, a positive gap is clipped to 0 before the ramp, so under-confidence is not rewarded beyond a perfect score. The anchors were set from the Trinity TrueBase / Base / Preview triple and checked against the OLMo-2 ladder.

**Overall = the mean of the available sub-scores.** A sub-score is unavailable when its feature and its fallback are both missing; the leaderboard shows how many sub-scores went into each overall score. A score of 1 means "indistinguishable from a pre-anneal checkpoint on these four axes". It is a distance, not a quality ranking: higher is not better.

{{explainer:score}}

## Limits {#limits}

- The anchors come from two families. A recipe that changes the distribution in a way none of the four features sees will score as a true base.
- `prior` rests on 32 samples and a marker list; a model that has seen instruction data but never emits its markers unprompted is not caught by it.
- `memo` depends on Wikipedia being in the anneal mix. An anneal on other sources can memorise without moving it; the per-genre verbatim shares on `tf_weird` are there to check.
- The post-cutoff corpus is post-cutoff for every model measured so far. A checkpoint trained on data from after April 2026 needs a newer corpus, and the bundle would need a new version.
