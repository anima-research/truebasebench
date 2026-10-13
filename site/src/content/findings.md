# Findings

Six results from the current bundle. Each is stated as a claim whose numbers are computed from the bundle, followed by discussion and the charts that support it. Every number links to the field it came from; when a later bundle stops supporting a claim, a Data note appears under it instead of the old wording silently standing.

Stages follow the bundle's `stage` field: **pre-anneal** (a checkpoint from the constant-learning-rate phase of pretraining), **anneal** (during or after the learning-rate anneal and mid-training mix), **base** (the released base model, whatever its recipe) and **post-trained** (SFT, preference optimisation, RL).

## Calibration ladder {#f1}

{{block:f1-claim}}

On post-cutoff text a pre-anneal checkpoint expects as much surprise as it gets, overall and in every UncheatableEval domain. Each later stage moves the gap negative. The anneal itself barely moves the specimen ladder; SFT moves it far more than the anneal did, and DPO and RLVR push it further still. A negative gap of this size means the model's real surprisal on fresh text exceeds its entropy by most of a nat per token: it is confidently wrong far more often than its distribution admits.

{{block:f1-detail}}

{{block:ladder-calib}}

In the other families with both a base and a post-trained rung, the post-trained rung has the more negative gap; the small multiples show each family on a shared axis.

{{block:ladder-calib-families}}

{{block:f1-readoff}}

## Annealed is not one thing {#f2}

{{block:f2-claim}}

The two families with a measured pre-anneal checkpoint were annealed differently, and the sub-scores separate the recipes. One anneal recited its up-weighted sources while its prior stayed clean; the other kept its calibration and did not memorise Wikipedia, but its prior became instruction-shaped. A single "base-ness" number would put the two released bases near each other; the profiles show that they moved along different axes.

{{block:f2-detail}}

{{block:anneal-profiles}}

Across all anneal-stage and base checkpoints, the matrix of sub-scores shows which axis each recipe moved.

{{block:subscore-matrix}}

{{block:f2-readoff}}

## Distillation {#f3}

{{block:f3-claim}}

A model released as a base can still have been trained toward a teacher's distribution rather than toward the data. On the calibration axis such a student sits with post-trained models, not with bases, and its gap where it is uncertain (H > 4) is nearly as far from zero as its instruction-tuned sibling's. Its prior, by contrast, is clean, and so is its Wikipedia recitation: training on a teacher's distribution transfers the teacher's sharpness without any instruction data.

{{block:f3-detail}}

The scatter of calibration gap against marker rate shows the two axes separating. Post-training moves a model left (a more negative gap) and up (more instruction markers); distillation moves the student left only, and its instruction-tuned sibling then moves further left and up.

{{block:gap-prior}}

{{block:f3-readoff}}

## Collapse {#f4}

{{block:f4-claim}}

Sampled at temperature 1 with no truncation, many checkpoints eventually fall into attractors: single-glyph repetition or short loops where entropy drops near zero and stays there. It is tempting to read this as a post-training artefact. It is not: pre-anneal and annealed checkpoints do it as readily as post-trained ones. Collapse is shown on model pages but is not part of the score.

{{block:collapse-strip}}

{{block:f4-readoff}}

## Surnames {#f5}

{{block:f5-claim}}

Asked in words for a random list of US surnames, every model in the bench answers with the genre "ranked list of common surnames": usually Smith first, then Johnson, Williams, and so on down the Census frequency table. This is a correct reading of what such lists look like on the web, not a sample from the population. Post-training sharpens it into near-verbatim recitation of the Census ranking.

Given six genuine Census draws as items 1 to 6, the picture separates. Pre-anneal checkpoints and clean bases match the population distribution at item 7 closely, against a Census entropy of {{num:reference.census_entropy_top2000|nats}} over the same 2,000 names. Post-training thins the tail.

{{block:f5-detail}}

{{block:surname-kl}}

Along the specimen ladder the effective number of surnames, exp(H) over the few-shot frames, changes little through the anneal and collapses with post-training; the dashed line is the Census over the same names.

{{block:ladder-surname-kl}}

{{block:f5-readoff}}

## Tail {#f6}

{{block:f6-claim}}

On post-cutoff text, post-training raises the share of real tokens the model found near-impossible: surprisal above 10 nats, a probability below about 1 in 22,000. The paired chart below shows every base / post-trained pair, including the ones where the rise is small.

The over-confidence concentrates where the model is uncertain. At positions with H > 4 nats, bases have a gap near zero, while most post-trained models are well below it; the exceptions are named in the claim above and visible in the strip. Post-training does not just sharpen confident predictions; it removes the hedging from uncertain ones.

{{block:f6-detail}}

{{block:tail-arrows}}

{{block:tail-strip}}

{{block:f6-readoff}}

## Every family, in stage order {#ladders}

Each family's rungs in stage order, for a selectable metric (calibration gap, few-shot surname KL, top-1 ECE), on a shared axis.

{{block:ladders}}
