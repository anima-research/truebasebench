# About

True Base Bench is a public, permanent benchmark that measures how close a language-model checkpoint is to an ideal base model: one whose next-token distribution is an honest density model of text — calibrated on text it has never seen, with nothing memorised beyond its training distribution and no instruction-shaped prior. No reference checkpoint defines that ideal; it is a property of the distribution. Empirically, checkpoints from the long constant-learning-rate phase of pretraining (before the anneal, mid-training mixes and any post-training) sit at it, which is why they set the anchors of the score. It is built and maintained by [Anima Labs](https://github.com/anima-research).

## What it is for {#purpose}

"Base model" has stopped meaning one thing. Released bases are often annealed on curated, instruction-heavy or synthetic mixes, distilled from a larger model, or both. For research that depends on a model trained toward the data and nothing else (interpretability, studies of the pretraining distribution, simulation, uses of base-model sampling that rely on its full diversity), the label on the checkpoint is not enough.

The bench gives that question a measurement. It does not score capability; it scores distance from that ideal, and which end of the axis you want depends on what you are using the checkpoint for. A score of 1 means the checkpoint is indistinguishable, on the four features measured, from a pre-anneal checkpoint — the empirical stand-in for the ideal — and nothing more.

## How it works, briefly {#how}

Every model reads the same fixed text, and every feature is a statistic of its own next-token distribution: how well its expected surprise matches its realised surprise on text written after its training cutoff, how much of Wikipedia it recites verbatim, and how often it writes chat or instruction markers when asked to write from nothing. Four sub-scores, each a clipped linear ramp between a true-base anchor and a post-trained anchor, are averaged into the overall score. A surname-distribution test, tail statistics and lexical statistics of the model's own samples are shown alongside. [Methodology](/methodology) defines each of these precisely; [Findings](/findings) gives the results.

## Data and reproducibility {#data}

- All numbers on the site are read from a versioned data bundle (`bench_vN.json`, listed in `manifest.json`), served from public object storage with a copy in the repository. No number is typed into a page.
- The measurement and analysis scripts are in `docs/` in the repository, unchanged from the runs that produced the bundle. [Measure your model](/measure) gives the exact commands.
- The overall score is recomputable from the fingerprint in the bundle; the site's test suite checks this for every model.
- Bundles are append-only. A new measurement, a new model or a change of method produces a new bundle version; earlier versions stay available so that cited numbers remain checkable.

## Maintenance {#maintenance}

The bench is maintained by Anima Labs. New checkpoints are added through pull requests that include a bundle produced with the published scripts (see [Measure your model](/measure)), and by the maintainers as notable checkpoints are released. Changes to the method, such as new anchors, a new post-cutoff corpus or a new feature, are made only in a new bundle version, described in the pull request that introduces it; a model's score is always reported against a named bundle version.

The post-cutoff corpus has a date. Once checkpoints trained on data from after that date appear, the corpus has to be replaced by a newer one, in a new bundle version, with the existing models re-measured on it.

Corrections, questions and submissions go to the issue tracker of the repository at [github.com/anima-research](https://github.com/anima-research).

## Citation {#citation}

If you use the bench or its data, cite the bundle version you used. The entry below is for the bundle this page loaded, {{val:bundle}}; earlier versions stay listed in `manifest.json`.

{{block:citation}}

## Acknowledgements {#acknowledgements}

The surname test follows a proposal by Gwern Branwen. The post-cutoff text comes from UncheatableEval, the Pile selection from NeelNanda/pile-10k, and the surname reference from the 2010 US Census surname file. The anchors were set using checkpoints released by Arcee AI (Trinity) and the Allen Institute for AI (OLMo-2), whose publication of intermediate checkpoints makes a measurement like this possible.
