# True Base Bench — research journal

Dated lab notebook. Newest entries at the bottom. Numbers quoted here are the values at the time of writing; the data bundle is authoritative. Infrastructure: two 8×B200 nodes (node1/node2), jobs scheduled through heimdall; measurement scripts in `docs/`.

## 2026-10-09 — framing and first measurements

**Question (Antra):** measure entropy/varentropy differences between base/instruct pairs and look for irregularities that reveal mode collapse introduced late in pretraining ("the tail end"); the Trinity TrueBase (10T, pre-anneal) vs annealed Base triple is the key object; Llama-3.1-405B base to be measured too.

**Design.** Exact full-vocabulary next-token statistics (H, V = Var[−log p], surprisal of the real token, top-1 prob, rank of the real token) at every position, two ways: teacher-forced on a fixed Pile slice (400 pile-10k docs, ≤2048 tok), and recorded step by step over the model's own temperature-1 samples (32 from bare BOS, 32 from 32-token openers, 1536 steps, sampling continues past EOS). HF transformers, bf16, pipelined over 8 GPUs; per-token scalars only (no distributions stored). Trinity TrueBase/Base/Preview share a tokenizer up to 8 reserved-token names, so paired per-position comparison is valid.

**Infrastructure notes.** Both nodes were occupied by luxia's `kotodama` ladder training; Antra authorised preempting (declared resumable). Pinned priority-80 submissions preempt only the job holding the pinned GPUs (unpinned would also have killed luxia's CPU watcher jobs). A `worker.sh` polls a per-node queue directory so one heimdall job serves many tasks. No 405B-Instruct exists on the cluster (hub entries for it and Hermes-3-405B are empty stubs); Antra: 405B base only.

**First result (gemma-2-2b smoke, then Trinity TrueBase vs Base, 291k aligned tokens).** TrueBase is calibrated: mean(H − s) = −0.006 on Pile and within ±0.03 in every Pile domain. Base: −0.035 overall, −0.03 to −0.09 per domain. Annealing lowered CE by 0.11, H by 0.14, V by 0.33 across all entropy bins. The 1,620 "collapsed branch points" (TrueBase H ≥ 2, Base H < 0.3) are places where Base is *right* 97 % of the time: verbatim recall, 900 of them Wikipedia, 625 from a single article (William Aberhart). Wikipedia CE fell 27 % vs 4 % for web text; share of Wikipedia tokens inside verbatim runs (≥16 consecutive rank-0, H<0.2 tokens) 4 % → 15 %. So the anneal's fingerprint is memorization of its up-weighted sources, not degeneration.

**Dead end.** Free-running collapse is not diagnostic: at T=1 both TrueBase and Base fall into single-glyph attractors (`‚‚‚‚`, `❨❨❨`, U+200F) in ~25–30 % of 1536-step rollouts, TrueBase slightly more. Rollout statistics move non-monotonically across the triple; Preview (instruct) is the *least* degenerate.

**Goal refined (Antra):** a reference-free classifier — score an unknown checkpoint for how much of a true base it is.

**Contamination control.** The Pile is in everyone's training data, so Pile recitation conflates "annealed" with "has seen this text". Added a post-cutoff corpus (UncheatableEval 2026-04: 60 docs × 15 categories, ≈1.3M tokens) and a 150-Wikipedia + 60-GitHub supplement for the memorization features. Decisive: on fresh text TrueBase gap = **+0.008** (domain |mean| 0.012), Base −0.065, Preview −0.099; verbatim share 1.5 % → 10 % → 11 %. Memorization is frozen Base → Preview (post-training added none); miscalibration is cumulative.

**Qwen3-30B-A3B-Base** is calibrated on fresh text (−0.022) but 41 % of its bare-BOS samples are instruction-formatted ("Assistant: Let's break down…") — a second axis: what the prior contains.

**OLMo-2 7B ladder** downloaded (stage-1 at 2.9T/3.9T, stage-2 anneal at 5B/17B/50B, soup, SFT, DPO, Instruct; 190 GB to node2). Fresh gap: +0.016, +0.013 → +0.005, +0.002, +0.002 → −0.006 → **−0.40 → −0.85 → −0.92**. The anneal leaves calibration intact and moves only the prior axis (marker rate 0 → 22 → 31 %). So "annealed" is lab-specific: Trinity's anneal memorized and miscalibrated; OLMo's injected instruction data. Both axes are needed.

**Other findings.** Llama-3.1-405B base on Pile: gap −0.034 and 25 % of Wikipedia tokens in verbatim runs (22 % on the 150-doc set): a strongly annealed base on this scale. gemma-2-9b base (distilled from a larger teacher): gap −0.158 — distillation is a third route off "true base". GLM-4-32B-Base 0.96, Llama-70B 0.92, Gemma-4-31B-Base 0.90 (not distilled).

**Score v0.** Four clipped ramps, averaged: calibration gap on fresh text (0 → −0.10), per-domain |gap| (0.015 → 0.10), Wikipedia verbatim share (0.02 → 0.12), instruction-marker rate in BOS samples (0 → 0.40). Anchors from the Trinity triple, checked on the OLMo ladder. Page published.

**Operational.** Transient CUDA faults (init failure on node1; `unspecified launch failure` during a 70B-Instruct rollout on node2) — retries succeeded. gemma-4-31B-it produces garbage under HF loading (CE 6.0) though its shards are complete; excluded, unresolved.

## 2026-10-10 — the FP8 giants

Antra: add Kimi K2, DeepSeek-V3 and MiMo pairs, their instructs, and Cogito 671B (a light finetune of V3-Base). All FP8 e4m3 block-128 custom-code checkpoints. Lessons: transformers 5.18's FP8 path needs `kernels==0.17.0` and Hub access for kernel binaries (`HF_HUB_OFFLINE=0`); forcing `DeepseekV3Config` on a `kimi_k2` checkpoint silently skips the key conversion (fused experts missing → CE 9.96) — fixed with a shadow directory whose config says `model_type: deepseek_v3`; on-the-fly FP8 quantization doesn't work for MoE experts (Cogito, bf16 1.3 TB, doesn't fit HF on 8×B200) → built a vLLM-based scorer: a V1 `LogitsProcessor` plugin records exact H/V/s per step and forces the known next token by masking logits, so teacher forcing is a decode replay. Bug found and fixed in it: `BatchUpdate` must be processed removed → added → moved, otherwise a reused batch slot's request is silently unforced. Verified token-for-token on Cogito.

Results (fresh gap): DeepSeek-V3-Base −0.021 (0.88), V3 chat −0.244; K2-Base −0.016 but 15.6 % Wikipedia recitation (0.66), K2-Instruct −0.203 and only 2.6 % recitation (post-training erased it; V3 chat kept its base's 4 %); Cogito −0.256 — the "light" finetune moved calibration as much as a full chat recipe. MiMo-V2.5: unresolved (HF quantizer vs. remote-code expert layout; vLLM 0.30 produced word salad).

A redeploy of the task files from the Mac overwrote node-side edits (K2 shadow path) and produced a garbage run that had to be redone; lesson: keep the canonical task files in one place.

## 2026-10-11 — Gwern's surname test, weird genres, self-bootstrapping

**Antra:** check weird texts rather than Wikipedia; what about Gwern's surname-distribution test (random American surnames vs. SSDF/Census); can there be a probe-independent, self-bootstrapping detector?

**Surname test design.** Census 2010 counts (SSA first names blocked). Exact: log P(name | frame) for the top 2,000 surnames (Title + ALL-CAPS summed), three described frames; sampled lists for junk/diversity. First run showed the test is dominated by the *genre*: told in words that a list is random, every model answers with "list of common surnames" (Smith first) — pre-anneal TrueBase puts 38–56 % on Smith at item 1 — and post-training sharpens this into verbatim recitation of the ranked Census list (V3-Base 12 % on Smith under the plain frame, V3 chat 84 %). Added three few-shot frames (six genuine Census draws as items 1–6, read item 7): the genre is broken and the prior itself is read. Few-shot KL: TrueBase 0.19, OLMo stage-1 0.26/0.25 → anneal 0.29–0.35 → soup 0.29 → SFT 0.83 → DPO 2.40 → Instruct 2.55; Llama-70B **0.12** (Gwern's named example: collapsed under the verbal frame, intact prior), 405B 0.27, V3-Base 0.22, V3 chat 0.21 (prior preserved), K2-Base 0.25, gemma-2-9b 1.14. Sampled lists for Llama models crash reproducibly (`unspecified launch failure` in the HF decode loop when the sampled list degenerates); exact-only mode added.

**Weird genres** (rare Pile sets): TrueBase within ±0.05 in every genre with 0.4 % verbatim runs; K2-Base 1.8 % (its recitation is Wikipedia-specific = anneal mix); chat models −0.18 to −0.29 everywhere.

**Self-bootstrapping.** Top-1 ECE on arbitrary text is the clean probe-free detector (pre-anneal 0.006, bases 0.006–0.012, SFT 0.057, DPO 0.111, Instruct 0.118); first-order statistics of a model's own samples are tautologically calibrated, and own-sample lexical diversity is two-sided (pre-anneal samples are *more* diverse than human text because T=1 unrolling drifts; post-trained samples look most human). Realised tail: post-training raises the rate of real tokens with surprisal > 10 nats by 30–200 % and makes the gap at H > 4 −0.3 to −1.1 (bases ≈ 0). Proposed but not done: record predicted tail mass (p < 1e-2/1e-3/1e-4) per position and add a genuinely OOD corpus.

## 2026-10-12 — Qwen2.5-72B, MiMo root cause

Qwen2.5-72B base: calibrated (−0.009, ECE 0.007), no recitation, but 47 % instruction-shaped BOS samples; few-shot surname KL 0.30; Instruct −0.240. Checkpoints on BeeGFS (both `/models` disks full).

MiMo-V2.5 diagnosed properly: not TP (PP=2/TP=1 also garbage). vLLM 0.30's loader re-shards the fused FP8 `qkv_proj` assuming a per-KV-head interleaved "Pro" layout; the 48L checkpoint (4 KV heads on global layers, 8 on sliding-window layers) is standard `[Q|K|V]` — its own modeling code splits it so. Upstream fixed this after 0.30 (Sep 19/29 commits); upstream `main`'s `mimo_v2.py` dropped into the env makes it coherent. The old prism `mimo-v2.5-base` entry would have been garbage too; Pro-Base (8/8 heads) was never affected. MiMo-V2.5-Base: −0.019, 28 % markers, described surname KL 0.46, few-shot 0.235 → 0.76. Instruct failed three times on node1 (scheduler KeyError, then NCCL barrier timeouts), with orphaned engine processes holding GPUs; luxia's agent correctly cancelled a duplicate worker. Lesson: kill by PID, never `pkill -f` with a pattern that matches the ssh shell.

## 2026-10-13 — Olmo-3, V4-Flash, the site

MiMo-V2.5 instruct ran first try on node2 (−0.289, ECE 0.042, few-shot 0.41 → 0.32): node1 was the problem. Olmo-3-32B base: −0.033 (vs OLMo-2 7B soup −0.006), ECE 0.006, 16 % markers, few-shot 0.375 → 0.77 — OLMo-3's mid-training costs calibration where OLMo-2's anneal did not; a stage-1 32B checkpoint would localize it. DeepSeek-V4-Flash-Base (vLLM, `--prepend-bos` because the V4 tokenizer adds none): −0.029, 0 % markers, described surname KL **0.27** (no ranked-list reflex), few-shot 0.133 → 0.88; its few-shot lists drift into "You started with a seed of 1035…" raffle text, a synthetic-data signature the marker list misses. V4-Flash instruct: −0.404, ECE 0.053, high-entropy gap −0.80, recites the ranked list, few-shot 0.238 → 0.49.

**Site.** Antra: a permanent, maintained True Base Bench site by Anima Labs — Railway hosting, OVH S3 for data, built by an Opus workflow with animated explainers. Spec written (`docs/SPEC.md`), bundle v1 exported (32 models), workflow launched (design direction → scaffold → explainers/content/infra → integrate → three-lens review → fix → verify).

**Site built (16:30–18:45).** Opus workflow, 13 agents, 2.4M tokens: two competing design briefs judged ("Strip Chart" won — the leaderboard as a measuring instrument with a ladder strip, Ranked/Ladders switch and raw-feature view), scaffold → explainers/content/infra in parallel → integrate → review under three lenses (32 findings: label collisions in the explainers at 400px, a CSS specificity bug in phone leaderboard rows, ramp labels struck through by the polyline, bare NaNs in the bundle) → fix → verify (130 tests, 20 views, no console errors). Docker not tested locally (not installed). Deploy steps are in README.md; the owner still has to create the Railway project, the OVH bucket + keys, and push the repo to github.com/anima-research.

**OLMo-3 32B stage-1 (evening).** Antra was surprised the 32B base reads "unbasey". Measured the last stage-1 checkpoint (step 656k, ~2.8T tokens): gap 0.000 on post-cutoff text, spread 0.010, ECE 0.003, high-entropy gap −0.004, TTR 0.50 → 0.94, with cross-entropy on unseen text nearly unchanged (1.535 → 1.528, −0.007 nats) while entropy fell 0.040. So mid-training barely changed how well the model predicts unseen text and mostly changed how confident it is — the cleanest demonstration so far, and a fourth pre-anneal checkpoint at zero. It did not thin the surname prior (few-shot KL 0.43 vs Base 0.375). DeepSeek-V4-Pro: only the chat release is on the cluster; the Pro base is 1.6 TB on HF (unquantized experts) — out of reach without ~1.7 TB of disk and either two-node serving or an FP4 quantization pass.

**External review (Codex, gpt-6-astra, max reasoning; `docs/reviews/codex-gpt6-astra-2026-10-13.md`).** Verdict: a useful exploratory fingerprint, not a validated "true base" index; arithmetic reproduces (scores to 1e-16), construct validity is the weak point (hand-picked features, eyeballed anchors, equal weights, no held-out validation, no uncertainty). Ten concrete errors found; the factual ones are corrected in this commit: the "±0.02 in every domain" claim (true overall, ±0.03 per domain), the "identical CE" wording above, the undocumented 300-document post-cutoff subset for the FP8 giants (≈441k vs ≈1.3M positions), a domain-name truncation that merged English and non-English Wikipedia (`F_CE_{name[:10]}`), the rare-genre count (13, incl. BookCorpus2), surname sampled metrics computed over all frames while labelled "described", unparsed CLI flags, zero-filled rollout gaps in the vLLM scorer, and "two families" with pre-anneal checkpoints (now three). Provenance (model path, backend, run settings, file dates) is now a per-model block in the bundle (v5). Still open from the review: checkpoint *revisions* (git hashes of the HF repos were not recorded at download time), bootstrap CIs, a prespecified score validated on held-out families, fitted anchors.

**Follow-ups decided (Antra):** tail-mass calibration + OOD corpus now; bootstrap CIs; exact chat-opener prior mass; OLMo-3 7B mid-training-mix ablations as held-out validation; fitted anchors last. See `docs/ROADMAP.md`. Deployment target basebench.animalabs.ai on Railway; repository under github.com/anima-research.

**Open questions.**
- Predicted tail mass (tail reliability) and an OOD corpus — the rigorous version of the rare-sequence question.
- A pre-anneal checkpoint for OLMo-3 32B and for Qwen (none public) to extend the ladders.
- Why gemma-4-31B-it loads to garbage under HF while the Base loads fine.
- Whether the synthetic-data signatures in bases' own samples (Qwen's instruction formatting, V4-Flash's seeded raffles, K2's Chinese exam items) can be measured language-agnostically rather than with an English marker list.
- The ramp anchors are set by eye from two ladders; with ~36 models a fitted one-dimensional ordering (e.g. isotonic over training stage) would be more defensible.

## 2026-10-13 (evening) — follow-ups launched: tail-mass calibration, OOD corpus, exact prior mass, bootstrap CIs

**Repository published**: github.com/anima-research/truebasebench (public). Roadmap in `docs/ROADMAP.md`.

**Bootstrap CIs (`docs/vh_boot.py`, 2000 resamples, document-level clustered bootstrap; analysis-only, ~1 min).**
Calibration gap on post-cutoff text is a precise statistic: 95% CIs are ±0.003–0.006 nats, so the three groups are separated by the data, not by rounding:
- pre-anneal: OLMo-3 32B stage1 +0.000 [-0.003, +0.003]; OLMo-2 stage2-ing1-17B +0.002 [-0.002, +0.007]; Trinity TrueBase +0.008 [+0.005, +0.011]; OLMo-2 stage1-2928B +0.016 [+0.011, +0.020] (slightly under-confident, CI excludes 0).
- released large bases: Llama-3.1-70B -0.005 [-0.009, -0.001]; Qwen2.5-72B -0.009 [-0.013, -0.006]; DeepSeek-V3-Base -0.021 [-0.026, -0.015]; Llama-3.1-405B -0.026 [-0.030, -0.022]; DeepSeek-V4-Flash-Base -0.029 [-0.032, -0.026]; OLMo-3 32B base -0.033 [-0.036, -0.030].
- anneal recipes: Trinity Base -0.065 [-0.069, -0.061], Preview -0.099 [-0.103, -0.095]; OLMo-2 main -0.006 [-0.010, -0.001].
Wide where expected: Wikipedia verbatim share at 60 docs (Llama-405B +0.224 [+0.159, +0.289]; Trinity Base +0.102 [+0.054, +0.149] vs TrueBase +0.015 [+0.005, +0.029] — the 1.5% → 10% anneal effect survives, but the memo sub-score's anchors sit inside one CI for several models); the sampled marker rate at 32 bare-BOS rollouts is close to useless as a number (Qwen2.5-72B +0.469 [+0.312, +0.625]; Llama-70B-Instruct +0.562 [+0.375, +0.719]). These CIs are sampling uncertainty over the fixed corpus only; they say nothing about corpus choice.

**Tail-mass pass (running, heimdall workers 528cc333bf77 node1 / 6e742ccb008f node2, prio 80; luxia's resumable jobs preempted with Antra's standing OK).** Both scorers now record, at every teacher-forced position, the predicted tail mass m_k = P(p < 10^-k) for k = 2, 3, 4 (`vh_lp.py` recorder and `vh_score.py` `tail_mass`). The realised rate r_k = share of true tokens with surprisal > k·ln 10 should equal E[m_k] for a density model; r_k/m_k > 1 means the model's "impossible" set contains more real text than it admits. HF smoke on gemma-2b (Pile): predicted 0.138 / 0.063 / 0.025 vs realised 0.142 / 0.052 / 0.018. Per model: `tf_tail` = uncheat_small (300 post-cutoff docs, same subset for every model), `tf_ood` = new OOD corpus (`corpus/ood.json`, 140 docs: xxd-style hex dumps and raw base64 of random bytes — pure noise, where the only correct behaviour is near-uniform over the admissible symbols; minified JavaScript from the site's own production build; random-walk chess PGN; random DNA FASTA; word-shuffled Pile-CC/OpenWebText English; random numeric CSV), `tf_prior` = exact prior probe.

**Exact prior mass (replaces the marker heuristic).** `corpus/prior.json`: 20 chat/instruction openers (ChatML user/system, Llama-3 headers, OLMo `<|user|>`, Gemma `<start_of_turn>user`, DeepSeek `<|User|>`, `[INST]`, Alpaca header and `### Instruction:`, `### Human:`, `Human: `, `User: `, `Q: `, `Question: `, `Instruction: `, `Prompt: `, `You are a helpful assistant`, `Write a `, `The following is a conversation between`) and 15 natural document starts as controls (`The `, `In `, `# `, `import `, `Chapter 1`, `<!DOCTYPE html>`, …). None is a prefix of another, so log P(opener | start) summed over the set is the mass of a document beginning with any of them. Scored with the same teacher-forced replay (sum of per-token surprisals); for tokenizers without a BOS (Qwen) the sequence is started with the EOS/document separator (`ensure_start`). One forward per template, exact, no sampling noise. Reported: logsumexp over the instruction set, the control set, and the arg-max template.

**Analysis to follow** (`docs/vh_tailmass.py` → `analysis/tailmass.json`): tail reliability (r_k/m_k and quartile bins of m_k), OOD per-genre CE/gap/tail stats, prior masses; then bundle v6 with CIs, tail, prior and OOD blocks; site update.

## 2026-10-14 (night) — first full pass of the follow-ups; probe correction; V4 Pro

**All 35 models through the tail/OOD/prior pass** (plus re-runs for the vLLM recorder-file race, now fixed by waiting for the engine core's trailing files). Bundle v6 live on Railway.

**Calibration gap predicts tail reliability.** Spearman(calib sub-score, realised/predicted 10⁻³-tail ratio) = −0.97 over the first 17 models; every base and pre-anneal checkpoint has ratio 1.00 ± 0.05 at all three thresholds, Trinity's anneal tilts uniformly (×1.1 at every threshold), distillation and RL collapse the deep tail (gemma-2-9b ×1.2/×1.8/×3.5; Qwen3-30B instruct ×2.4/×3.0/×3.4). Same 300 documents as the gap, so a consistency check across statistics, not a replication; the OLMo-3 7B mix ablations remain the held-out test.

**Prior probe corrected (analysis-only).** Templates ending in whitespace under-read by 3–7 nats because the next word carries its own leading space; stripped masses are now primary (`prior.logp`, raw kept under `prior.raw`). Result: Qwen3-30B-A3B-Base starts 39% of documents with "Human:", Qwen2.5-72B 31%; Llama-3.1-70B 9.3% "Question:", 405B 6.4%; OLMo-2 ladder 0.15% (stage 1) → 10–16% (every stage-2 mix) → 12% (main); OLMo-3 stage 1 0.10% → 32B base 4.4%; GLM-4 base 0.00%, V3-Base 0.3%, Gemma-4 base 0.9%, Trinity 2–4% ("Q:"). Post-trained models read ≈0 because their templates tokenise into pieces (85% on `<` after `<|endoftext|>` for OLMo-2 Instruct) — the start-token entropy/p₁ (`prior.start`) is their measure (1.3 nats / 0.89 vs 6.9 / 0.04 at stage 1). Kimi K2 flagged unreliable (its tokenizer emits no BOS; after a prepended one, 64% on " ."). DeepSeek V3/V4 start 43% of documents with "#" or a newline. The sampled marker rate and the exact mass are uncorrelated (ρ = −0.01): they measure the free-running attractor and the pretraining mix respectively; F7 asserts this as a negative result.

**OOD:** bases ≈ 0 gap on random hex/base64; gemma-2-9b −3.2 nats on base64 and −3.3 on shuffled English (Gemma-4-31B-Base 0.00, so it is gemma-2's distillation); OLMo-2 Instruct's realised 10⁻³-tail on random-walk chess is 11.7× predicted; Llama-70B-Instruct +0.8 on shuffled English (under-confident).

**gemma-4-31B-it explained:** 20 nats on the first real token after BOS (H = 0.95) — certain every document starts with its chat template; not a loading bug. Still excluded.

**DeepSeek V4 Pro.** Chat (0813, local, 832 GB FP4-expert release) queued for the full measurement. Pro-Base on HF is the FP8-expert release (1.6 TB; ~200 GB/GPU, over a B200's 183) — downloading to BeeGFS after freeing 4.4 TB of NLA optimizer states (SFT states and non-final GRPO iterations, with Antra's OK; final-iteration GRPO states kept). `vh_convert_v4_fp4.py` re-quantises the routed experts to DeepSeek's own MXFP4 layout with vLLM's `mxfp4_quantize` (packed e2m1 + e8m0 scales, dense scales re-encoded to e8m0, `expert_dtype: fp4`); verified against the chat checkpoint's tensor layout; round-trip error 12% relative per expert matrix. Control: V4-Flash-Base converted the same way and measured as `DeepSeek-V4-Flash-Base-fp4`, so the quantisation's effect on every statistic is known before Pro-Base is read.

**Site copy:** "higher is not better" replaced everywhere by "distance from a true base, not capability"; F6 headline rewritten as one sentence with exceptions on a muted second line.

## 2026-10-14 (morning) — score v1; V4 Pro; FP4 control; relics demoted

**Score v1 (Antra's call).** Overall = mean(calib, spread, prior). The Wikipedia verbatim share (memo) and the surname test leave the score and become **validation probes**: the score is built from statistics of the next-token distribution alone, and the probes are things it should *predict*. Reasons: memo measured one anneal recipe (its stage medians are 0.2 / 0.1 / 0.7 / 0.6 %, so it contributed a near-constant 1.0 to 32 of 35 scores and lifted them by ~0.25), and folding either probe into the score made its agreement with them circular. The exporter marks `subscores.<k>.scored`, writes `reference.score_version = 1` and `scored_subscores`; v0 bundles are unchanged. Bundle v7 (37 rows). Trinity TrueBase 0.948; Llama-3.1-405B rises to 0.856 (its Wikipedia recitation no longer counts); Qwen2.5-72B 0.634 (prior 0 from the 47% marker rate, now the only prior term).

**DeepSeek-V4-Pro (chat, 0813, local FP4 release)** measured in full: gap −0.283 [spread 0.291], tail ratio 2.07 — less over-confident than V4-Flash chat (−0.404, 2.6) and in the V3-chat / cogito band. Two things stand out: **Wikipedia verbatim share 12.7%** (V3 3.7%, V4-Flash 2.5%, V4-Flash-Base 2.3%) — Pro's training recites Wikipedia at Trinity-anneal levels; and the few-shot surname KL 0.88 (Flash chat 0.24): a much thinner population tail. Exact prior: 0.25% on instruction openers, 50% on "#"/newline starts — the DeepSeek data-pipeline fingerprint again.

**FP4 quantisation control.** V4-Flash-Base with routed experts re-quantised from block-FP8 to DeepSeek's MXFP4 layout (`vh_convert_v4_fp4.py`, vLLM's `mxfp4_quantize`; 12% relative weight error per expert matrix): gap −0.029 → −0.016, spread 0.029 → 0.021, tail ratio 1.08 → 1.04, ECE unchanged, verbatim 2.3 → 1.9%, exact prior and surname KLs unchanged within 0.02. Quantisation noise adds a little entropy without changing what the text costs, so FP4 reads ~0.013 nats *more* calibrated. Pro-Base (FP8 release, 1.6 TB; download done, conversion queued) will be read with that offset; the control row stays in the bundle.

**Recorder race, second instance.** The vLLM recorder's files can trail `generate()` by seconds; the TF path waited, the rollout and names paths did not. V4-Pro and the FP4 control both failed at rollouts (26–28 of 32 files missing at collection time); `collect()` now waits for the expected ids everywhere. Surname probes from the five earlier vLLM runs were checked against the fixed code via the Flash-Base FP8/FP4 pair (frame-by-frame KLs agree within 0.02) and left as they are.

**Relics demoted (site).** Varentropy out of the position explainer (six steps now) with a Limits entry giving its stage medians (teacher-forced V/H: 1.9 / 2.0 / 1.7 / 1.8, no ordering; own-sample V: 5.2 → 3.1 → 3.0 → 1.6 but family-confounded). Also bundle-only now: W1 distances between TF and free-running H/V, Pile cross-entropy (ρ 0.00 with the gap), Zipf slope and gzip ratio, mean Census surprise of sampled surnames. Kept: ECE (same information as the gap, but the right picture), the own-sample diversity family (ρ 0.56–0.72, one story), per-genre `tf_weird`, `roll_rep8_q4` for F4.

**Site.** Findings page rebuilt to the Methodology standard (12-agent workflow): per-finding sections with standfirst, margin "how this is checked", labelled plates, look-at lists, CI whiskers, a new F7. "Four ramps, one score" opens Methodology; copy says the ideal is a property of the distribution and pre-anneal checkpoints are its empirical anchor; Open Graph card from the bundle; links to animalabs.ai; live at basebench.animalabs.ai. Score-v1 presentation (three ramps, probes plate) in progress.

**NLA cleanup.** 4.4 TB of optimizer state removed from BeeGFS with Antra's OK (SFT states; GRPO non-final iterations; final-iteration GRPO states kept) to make room for Pro-Base.

## 2026-10-14 (midday) — DeepSeek-V4-Pro-Base

Converted (FP8 experts → MXFP4, 1.6 TB → 760 GB, 12.0% relative weight error per expert matrix, same as the Flash control) and measured in full on 8×B200. Read with the +0.013 nat FP4 offset from the Flash-Base control:

- calibration gap **−0.004 [−0.008, +0.001]** as measured, ≈ −0.017 at FP8 — in the band of the other large released bases (V3-Base −0.021, K2-Base −0.016, Flash-Base −0.029); domain spread 0.013; ECE 0.0078; tail 0.0271 / 0.0275 at 10⁻³ (ratio 1.02).
- **Wikipedia verbatim 11.1%** — just under the 12% flag, "elevated". V4-Pro chat's 12.7% recitation therefore comes from the base's anneal, not from post-training.
- prior: 0.23% on instruction openers, 45% of starts on "#"/newline (the DeepSeek pipeline signature again); few-shot surname KL 0.24, described 0.74.
- score v1 0.961, rank 2 of 38 (bundle v8); the rank is helped by the FP4 offset — with it removed the gap would score ~0.83 on the calib ramp and the overall ~0.91, still in the top group.

Verdict: the cleanest large released base on the distribution statistics, with an anneal that recites Wikipedia at nearly flag level. Cost: 4.4 TB of NLA optimizer states freed, ~5 h of download, 25 min of conversion, ~1.5 h of measurement.

## 2026-10-15 — DeepSeek-V4-Pro-Base at its released FP8 precision

The 1.6 TB FP8 checkpoint does not fit eight B200s, but node1 has 2 TB of host RAM: vLLM with `--cpu-offload-gb 40` streams ~40 GB/GPU of weights per step over PCIe (`vh_score_vllm.py --cpu-offload-gb`). Per-step cost is fixed by the streaming (~0.7 s), so throughput is batch size: at 32 sequences the pass would have taken ~11 h; at 128 it took ~6.5 h including a 32-minute load.

**Result** (`DeepSeek-V4-Pro-Base-fp8`, now the family's "Base"; the converted copy is relabelled "Base (FP4 control)"):
- gap **−0.0173 [−0.022, −0.013]**; the FP4 conversion read −0.0038 → offset **+0.0135**, against **+0.0128** for the Flash pair. Two checkpoints of different size, the same shift to a thousandth of a nat: MXFP4 expert rounding adds entropy uniformly. Cross-entropy on post-cutoff text 1.2753 vs 1.2811 (FP4 costs 0.006 nats/token).
- spread 0.020, ECE 0.0078, tail ratio 1.06 / 1.03 at 10⁻³ / 10⁻⁴.
- **Wikipedia verbatim 13.4%** — above the 12% flag (FP4 read 11.1%: quantisation blunts recitation slightly, as expected for exact-run detection). Pro-Base recites; Pro chat's 12.7% comes from the base.
- surname KL few-shot 0.254, described 0.76; exact instruction prior 0.22%.
- score v1 0.922, rank 8 of 39 (the FP4 copy's 0.961 / rank 2 was the quantisation offset).

Bundle v9. The methodology's quantisation-control note now lists every control pair.
