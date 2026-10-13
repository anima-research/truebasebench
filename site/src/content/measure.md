# Measure your model

Every checkpoint on the board was measured with the scripts in `docs/` of this repository, on the same fixed text. To add one, run the same passes on your checkpoint, run the analysis scripts, export a bundle with `tools/export_bundle.py` and open a pull request. This page walks through each step.

## Environment {#environment}

- **Hardware.** The reference machine is one node with 8×B200 (about 180 GB each). Smaller checkpoints run on fewer or smaller GPUs; the HF path spreads layers over every visible GPU with `device_map="auto"`, and the vLLM path uses tensor parallelism.
- **Python.** 3.10 or newer with `torch`, `transformers`, `numpy` and `datasets` (the HF path), plus `vllm` with the V1 engine for the vLLM path. The analysis scripts need only `numpy`.
- **Precision.** Weights load in bf16 unless you ask otherwise; all distribution statistics are computed in float32 from the full logits row. Record any change (FP8 quantisation, dequantisation) in your submission.
- **Paths.** The script defaults point at `/models/varentropy/...` on the original machine. Pass `--corpus` and `--out` explicitly. Two analysis scripts still have the path in their source: `vh_selfboot.py` (`corpus_path`) and `vh_tail.py` (`res`). Edit those two lines to point at your corpus file and results directory.

## Corpora {#corpora}

Every model must read exactly the same documents, so download the published corpus files rather than rebuilding them. They live next to the data bundles, under `corpus/` in the bench's data bucket, with a `SHA256SUMS` file; check your copies against it before measuring. All four teacher-forced corpora are JSON files of the form `{"tf": [{"idx", "set", "text"}, ...], "openers": [...]}`.

| file (flag) | pass | contents |
|---|---|---|
| `pile10k_sel.json` (`--corpus`) | `tf`, own-sample openers | 400 Pile documents plus 64 openers, a fixed seeded selection from NeelNanda/pile-10k |
| `wiki_gh.json` (`--extra-corpus tf_wiki=PATH`) | `tf_wiki` | 150 Wikipedia and 60 GitHub documents |
| `uncheatable_2026_04.json` (`--extra-corpus tf_fresh=PATH`) | `tf_fresh` | 900 post-cutoff documents in 15 categories (UncheatableEval 2026-04) |
| `weird.json` (`--extra-corpus tf_weird=PATH`) | `tf_weird` | 199 documents from 12 rare Pile genres |
| `names.json` (`--names-probe`) | surname probe | `{"surnames": [[name, count], ...]}` from the 2010 US Census, most common first |

{{block:corpora}}

If `--corpus` points at a file that does not exist, `vh_score.py` builds the Pile selection from the pile-10k Arrow file given by `--arrow` (seed 0, documents of at least 400 characters) and writes it there. Only do this to reproduce the published file; a different selection makes your numbers incomparable.

The `tf_fresh` texts post-date the training cutoff of every model in v1. If your checkpoint's data extends past April 2026, its `tf_fresh` pass is no longer post-cutoff; say so in the pull request.

## Run the passes: HF transformers {#run-hf}

Use `vh_score.py` for dense checkpoints and MoE checkpoints that transformers loads natively.

```bash
python docs/vh_score.py --model /path/to/checkpoint --name my-model \
  --out results --corpus corpus/pile10k_sel.json \
  --extra-corpus tf_wiki=corpus/wiki_gh.json \
  --extra-corpus tf_fresh=corpus/uncheatable_2026_04.json \
  --extra-corpus tf_weird=corpus/weird.json \
  --names-probe corpus/names.json --max-mem-gib 165
```

Useful flags:

- `--max-mem-gib` caps the memory per GPU used for weights, leaving room for full-vocabulary logits.
- `--trust-remote-code` for custom-code checkpoints; `--arch deepseek_v3` forces the native DeepSeek-V3 class for Kimi K2 and DeepSeek-V3-architecture checkpoints that ship custom code.
- `--quantize-fp8` quantises a bf16 checkpoint to block-128 FP8 at load; `--fp8-dequantize` does the reverse for FP8 checkpoints the quantiser cannot wrap.
- `--experts-impl` selects the transformers experts implementation for MoE models.
- `--skip-tf` / `--skip-rollouts` rerun only part of a model. Extra corpora whose `.npz` already exists are skipped, so an interrupted run can be resumed.

## Run the passes: vLLM {#run-vllm}

Use `vh_score_vllm.py` for checkpoints transformers cannot load efficiently, such as FP8 custom-code MoE. It writes the same files as the HF path. Exact per-step statistics come from the logits processor in `vh_lp.py`; teacher forcing replays each document with the real token forced through the logits mask. vLLM loads the processor by module name in its worker processes, so put `docs/` on `PYTHONPATH`.

```bash
PYTHONPATH=docs python docs/vh_score_vllm.py --model /path/to/checkpoint --name my-model \
  --out results --corpus corpus/pile10k_sel.json --tp 8 --trust-remote-code \
  --extra-corpus tf_wiki=corpus/wiki_gh.json \
  --extra-corpus tf_fresh=corpus/uncheatable_2026_04.json \
  --extra-corpus tf_weird=corpus/weird.json \
  --names-probe corpus/names.json --rollout-steps 1024
```

- `--prepend-bos` adds the BOS token when the tokenizer does not (DeepSeek V4 needs it). Check that your tokenizer's first token on the corpus is BOS on either path.
- `--rollout-steps 1024` is what the FP8 giants used in v1; the default and the reference value elsewhere is 1536. A shorter rollout lowers the collapse statistics' exposure and must be declared.
- `--gpu-mem`, `--max-num-seqs`, `--max-model-len` and `--max-num-batched-tokens` are passed through to vLLM.
- Prefix caching is disabled on purpose: each request must produce its own statistics.

## Expected runtime {#runtime}

The work is fixed: about 290k Pile tokens, 1.3M post-cutoff tokens, the Wikipedia/GitHub and rare-genre sets, 64 sampled sequences of 1536 steps, 6 × 2,000 surname scorings and 6 × 16 sampled surname lists. Every position keeps the full vocabulary distribution, so throughput is lower than for an ordinary evaluation run. Runtime therefore scales with parameter count and vocabulary size: on the reference node, expect minutes to tens of minutes per pass for a small dense model and hours in total for the largest MoE checkpoints. On the vLLM path teacher forcing costs more than a single forward pass per document, because each document is replayed step by step. The load time is written to `run.json` in the result directory, and every phase logs its own timing.

## Analyse {#analyse}

Run in this order, from the repository root. Each script reads the per-model directories under `results/` and writes into `results/analysis/`.

```bash
python docs/vh_analyze.py results --all --corpus corpus/pile10k_sel.json   # fingerprints.json
python docs/vh_memo.py results my-model                                    # memo_<model>.json
python docs/vh_selfboot.py results                                         # selfboot.json
python docs/vh_tail.py                                                     # tail_realised.json
python docs/vh_names_table.py results                                      # names_summary.json, weird_summary.json
python docs/vh_truebase.py results/analysis/fingerprints.json              # truebase_scores.json
```

`vh_truebase.py` prints the four sub-scores and the overall score; these are the numbers the leaderboard will show. `vh_report.py` renders a standalone HTML report and is not needed for a submission.

## Export {#export}

First add your checkpoint to the model registry `tools/models.json`, keyed by its result-directory name: its `family`, `stage` (one of pre-anneal, anneal, base, post-trained), a short `label` and its `order` in the family ladder. Models that are not in the registry are skipped by the export (`--strict` makes that an error). Then export and test:

```bash
python tools/export_bundle.py results/analysis --out data/
cd site && npm test
```

`export_bundle.py` merges the analysis files into one bundle in the schema below, carries over every model of the latest bundle that you did not re-measure, writes it as `bench_vN.json` and updates `manifest.json`. Use `--dry-run` first to see the summary without writing anything. `npm test` checks the bundle against the data contract and recomputes every overall score from the fingerprint with the published ramps; a mismatch fails the test. To preview, run `npm run dev` in `site/` and open your model's page.

## Submit {#submit}

Open a pull request that adds your entries to a new `bench_vN.json` and lists it in `data/manifest.json`. Do not edit a published bundle; bundles are append-only so that every number ever shown on the site stays reproducible. Include in the pull request description:

- the checkpoint id (a Hugging Face repo id and revision, or a public download location), its family, stage and position in the family ladder;
- the commit of this repository whose scripts you ran, and the exact command lines;
- hardware, precision, and every flag that differs from the defaults (FP8, rollout steps, `--prepend-bos`);
- the output of `vh_truebase.py` for your model;
- a passing `npm test`.

Maintainers may rerun some passes on publicly downloadable checkpoints before merging, and will ask in the pull request if a number does not reproduce.

## Data contract {#contract}

{{block:datacontract}}
