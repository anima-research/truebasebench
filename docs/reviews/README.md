# External reviews

Reviews of this project produced by external reviewer models. Nothing here is
edited; each `.md` is the reviewer's last message verbatim, and each `.log` is
the raw run log (Codex `--json` event stream, so the full tool-call history
is preserved).

## 2026-10-13 — OpenAI Codex CLI, model `gpt-6-astra`

| item | value |
|---|---|
| date | 2026-10-13 (run started 23:37 UTC) |
| reviewer | OpenAI Codex CLI, model `gpt-6-astra`, reasoning effort `max`, 1M context (from `~/.codex/config.toml`) |
| Codex version | `codex-cli 0.155.1` |
| SESSION_ID (thread id) | `01a137a0-9690-7740-8955-f6e7d53b779f` |
| sandbox | `read-only` (the reviewer could read the repo and curl `http://localhost:4180/`, nothing else) |
| repo state | commit `69daadc` (data: bundle v3, 35 models), site served from a production build at `http://localhost:4180/` |
| review | `docs/reviews/codex-gpt6-astra-2026-10-13.md` |
| raw log | `docs/reviews/codex-gpt6-astra-2026-10-13.log` |

### Turn 1 — exact command

The prompt was written to a file and piped on stdin (`-` = read prompt from
stdin). It was run inside a tmux session named `codex-review` so it could be
watched with `tmux capture-pane -pt codex-review -S -200`.

```bash
export PATH="$HOME/.local/bin:$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
cd /Users/antra/truebasebench
codex exec -C /Users/antra/truebasebench -s read-only --json \
  -o docs/reviews/codex-gpt6-astra-2026-10-13.md - < turn1_prompt.txt 2>&1 \
  | tee -a docs/reviews/codex-gpt6-astra-2026-10-13.log
```

Turn-1 prompt (verbatim):

> You are reviewing a research project and its public website, as a skeptical senior researcher in ML evaluation/interpretability plus a senior front-end engineer. Work in the repository at /Users/antra/truebasebench (read-only). Read, in this order: docs/JOURNAL.md, docs/SPEC.md, docs/vh_score.py, docs/vh_analyze.py, docs/vh_truebase.py, docs/vh_names_table.py, docs/vh_selfboot.py, data/bench_v3.json (sample it; it is large), docs/DESIGN.md, README.md, and the site source under site/src. Then open the running site with curl at http://localhost:4180/ (and /methodology, /findings, /measure, /model/Trinity-Large-TrueBase, /data/manifest.json) to see what is served.
>
> Write a structured review in Markdown with these sections:
> 1. Summary verdict (5–10 sentences): is the central claim — that calibration (mean entropy minus mean surprisal on unseen text) separates pre-anneal checkpoints from annealed and post-trained ones, and that the four-ramp score is a usable 'true base' index — supported by the evidence as recorded? What is the strongest result, what is the weakest?
> 2. Methodological critique: confounds and alternative explanations the journal does not rule out (tokenizer effects, model size, data overlap of the 'post-cutoff' corpus, sample sizes per domain, temperature-1 rollout artifacts, the heuristic marker list, prompt-frame sensitivity of the surname test, anchors chosen by eye, few-shot frame noise), statistical rigor (no confidence intervals anywhere — propose how to get them cheaply), and anything that looks like p-hacking or post-hoc rationalization.
> 3. Specific errors or inconsistencies you can actually find: between the journal, the spec, the scripts and the bundle (numbers that disagree, definitions that drifted, fields documented but absent, scores that would not recompute).
> 4. What would most strengthen the work next (ranked, concrete, with cost): e.g. predicted tail-mass calibration, out-of-distribution corpora, more pre-anneal checkpoints, fitted rather than hand-set anchors, bootstrap CIs, held-out validation of the score.
> 5. Website review: correctness of what the site claims relative to the data and scripts; clarity of the methodology explainers for a technical reader; design and accessibility defects; engineering/deploy concerns (Dockerfile, data loading, caching, security). Be concrete (file:line where possible).
> 6. Three questions you would want answered before citing this benchmark.
> Be direct and specific; quote numbers and file paths; no praise padding.

### Continuing the conversation

The session is persisted under `~/.codex/sessions/`. To ask a follow-up with
the reviewer's full context intact:

```bash
export PATH="$HOME/.local/bin:$HOME/.nvm/versions/node/v20.20.2/bin:$PATH"
cd /Users/antra/truebasebench
codex exec resume 01a137a0-9690-7740-8955-f6e7d53b779f -s read-only \
  -o docs/reviews/codex-gpt6-astra-2026-10-13-followup-N.md \
  "<follow-up prompt>"
```

(`codex exec resume --last "<prompt>"` resumes the most recent session instead
of naming the id. Add `--json` and `| tee -a <log>` to keep the raw event
stream.)
