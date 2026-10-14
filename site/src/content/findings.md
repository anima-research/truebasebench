# Findings

Stages follow the bundle's `stage` field: **pre-anneal** (a checkpoint from the constant-learning-rate phase of pretraining), **anneal** (during or after the learning-rate anneal and mid-training mix), **base** (the released base model, whatever its recipe) and **post-trained** (SFT, preference optimisation, RL).

## Calibration ladder {#f1}

{{block:f1-claim}}

{{block:f1-detail}}

{{block:ladder-calib}}

In every family with a base and a post-trained rung the post-trained rung is lower: [see every family in stage order →](#ladders).

{{block:f1-readoff}}

## Annealed is not one thing {#f2}

{{block:f2-claim}}

{{block:anneal-moves}}

{{block:f2-detail}}

After the ramps, the same two moves show up as sub-scores: one family's memo line drops while its prior line stays flat, the other's prior line drops while its memo line stays flat. The table under the plate carries every annealed and released base checkpoint, so each recipe can be placed on the same four axes.

{{block:anneal-profiles}}

{{block:f2-readoff}}

## Distillation {#f3}

{{block:f3-claim}}

A model released as a base can still have been trained toward a teacher's distribution rather than toward the data. Training on a teacher's distribution transfers the teacher's sharpness without any instruction data: on the calibration axis such a student sits with the post-trained checkpoints, while its prior and its Wikipedia recitation stay clean.

{{block:gap-strip}}

{{block:f3-detail}}

{{block:f3-readoff}}

## Collapse {#f4}

{{block:f4-claim}}

Sampled at temperature 1 with no truncation and no stop, many checkpoints eventually fall into an attractor: one glyph repeated to the end of the budget, or a short loop of a few tokens, with the entropy of each step near zero and staying there. Read at a glance this looks like post-training. The sample has stopped behaving like text, and over-confidence is what post-training does to the calibration gap; it is tempting to read the one as a symptom of the other.

{{block:f4-detail}}

{{block:collapse-strip}}

{{block:f4-readoff}}

## Surnames {#f5}

{{block:f5-claim}}

Asked in words for a random list of US surnames, every checkpoint answers with the genre "ranked list of common surnames": Smith, then Johnson, Williams, down the Census frequency table. That is a correct reading of what such lists look like on the web, not a sample from the population, and post-training sharpens the reading into recitation ([how the two frames are built](/methodology#surnames)).

Six genuine Census draws as items 1 to 6 separate the ability to draw from the distribution. At item 7, pre-anneal checkpoints and clean bases match the population over the same 2,000 names, whose Census entropy is {{num:reference.census_entropy_top2000|nats}}; post-training thins the tail.

{{block:surname-kl}}

Under the described frame the genre reading is the whole story: every measured checkpoint puts more of its mass on the ten most common names than the Census does.

{{block:surname-top10}}

Along the specimen ladder the effective number of surnames, exp(H) over the few-shot frames, changes little through the anneal and collapses with post-training.

{{block:ladder-surname-kl}}

{{block:f5-readoff}}

## Tail {#f6}

{{block:f6-claim}}

The over-confidence concentrates where the model is uncertain. At positions with H > 4 nats, bases have a gap near zero while post-trained models sit well below it: post-training does not just sharpen confident predictions, it removes the hedging from uncertain ones ([how the tail statistics are measured](/methodology#tail)).

{{block:tail-hiH-arrows}}

{{block:f6-detail}}

{{block:tail-arrows}}

{{block:f6-readoff}}

## Tail reliability, exact prior, noise {#f7}

{{block:f7-claim}}

At every teacher-forced position the model's predicted tail mass m_k is the probability it puts on tokens below 10⁻ᵏ, and the realised rate r_k is the share of real next tokens that fell there. For a density model the two agree in expectation, so r₃ ÷ m₃ near 1 means the tail is exactly as thick as the model said; above 1, the model's "impossible" set holds more real text than it admits ([how the pass works](/methodology#tail-mass)).

{{block:tail-reliability}}

Two side results, shown and not scored. The exact probe replaces sampled continuations with one teacher-forced sum over the chat openers, and sees instruction data in bases rather than chat templates in post-trained models ([the exact probe](/methodology#prior-exact)). The out-of-distribution corpus asks the calibration question on text no training mix resembles ([the genres](/methodology#ood)).

{{block:prior-exact}}

{{block:ood-noise}}

{{block:f7-readoff}}

## Every family, in stage order {#ladders}

F1 and F5 read the calibration-gap and surname-KL views along the specimen ladder; this plate shows every family.

{{block:ladders}}
