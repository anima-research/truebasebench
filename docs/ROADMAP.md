# Roadmap (2026-10-13)

Decided with Antra after the external review (`docs/reviews/codex-gpt6-astra-2026-10-13.md`). Nothing here is blocking; order is by value per effort.

1. **Predicted tail-mass calibration + OOD corpus** — in progress. Record, at every teacher-forced position, the probability mass the model puts on tokens with p < 1e-2 / 1e-3 / 1e-4, and compare with the realised rate at which the true token falls in those bins (tail reliability). Add an out-of-distribution corpus: random hex and base64 (pure noise — a density model should be near-uniform), minified JavaScript, random-walk chess PGN, random DNA, word-shuffled English, random CSV. Re-run `tf_fresh` + new `tf_ood` for every model.
2. **Bootstrap confidence intervals** — document-level for gap/ECE/verbatim share, rollout-level for sample statistics, frame-level for the surname KL. Analysis only.
3. **Exact prior-content measure** — probability mass after `<bos>` on chat/instruction openers (`<|im_start|>user`, `### Instruction`, `Human:`, `Q:` …), replacing the sampled marker heuristic. Measured in the same pass as 1.
4. **Held-out validation with the OLMo-3 7B ladder** — stage-1 → stage-2 mix ablations (`mix-math-code-reasoning-web`, `mix-gen-mc-only`, `mix-round5`, all from the same 2T checkpoint) → base → Instruct/Think. Freeze the score first; report whether it orders the held-out ladder.
5. **Fitted anchors** — only after 4; isotonic/ordinal fit on held-out families; keep the four-feature profile as the primary display.
6. **Temperature-scaling cost** — done 2026-10-15 (`tf_temp`, `vh_temp.py`, bundle v10, reported not scored). Next: widen the grid to {0.7 … 2.0} (five post-trained models sit at the 1.25 edge), then decide score v2 = mean(C-ramp, spread, prior).
7. Size vs. recipe check for the −0.02…−0.03 cluster of large bases; frank note that varentropy is reported-only.

## Deployment state (2026-10-13)

- Repository: github.com/anima-research/truebasebench (public, `main`).
- Railway project `truebasebench` (workspace antra-tess, id b162bab3-7509-4bdf-8227-621c94665705), service `basebench`, first deploy pushed from the CLI (`railway up`), Railway domain https://basebench-production.up.railway.app. `VITE_DATA_BASE_URL` is empty, so the site serves the bundle copy in `data/`.
- Owner steps left (the CLI token is not allowed to do these):
  1. Railway dashboard → service `basebench` → Settings → Source: connect the GitHub repo `anima-research/truebasebench` (installs the Railway GitHub App on the org) so pushes to `main` deploy.
  2. Settings → Networking → Custom Domain: `basebench.animalabs.ai`; Railway shows the CNAME target. DNS for animalabs.ai is at Spaceship (launch1/launch2.spaceship.net): add `CNAME basebench → <target>.up.railway.app`.
  3. OVH Object Storage bucket + keys (README "OVH Object Storage"); set `VITE_DATA_BASE_URL` on the service and the `OVH_*` secrets on the GitHub repo for the upload workflow. Until then the repo copy is served, which is fine.
