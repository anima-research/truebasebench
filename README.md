# True Base Bench

True Base Bench, by [Anima Labs](https://github.com/anima-research), measures how far a language-model checkpoint sits from a *pre-anneal pretraining base*: the "true base" before annealing, distillation or post-training reshaped its next-token distribution. It asks no benchmark questions. Every checkpoint is run through the same scripts on the same fixed text (Pile documents, post-cutoff documents, rare-genre documents, its own free-running samples and a surname-distribution test), and four statistics of the full next-token distribution are turned into sub-scores: calibration on unseen text, how far miscalibration spreads across genres, verbatim recitation of Wikipedia, and instruction markers in the bare-`<bos>` prior. The overall score is their mean. [docs/SPEC.md](docs/SPEC.md) defines the measurements and the data contract.

```
docs/            spec, design notes and the measurement scripts (vh_*.py)
data/            published bundles bench_v<N>.json + manifest.json (the repo copy shipped with the site)
site/            the static site (Vite + React + TypeScript), see site/README.md
tools/           export_bundle.py, upload_data.py, validate_data.mjs, csp.mjs, models.json (model registry)
infra/caddy/     Caddyfile for the production image
infra/ovh/       bucket CORS policy and an optional public-read bucket policy
Dockerfile       build the site, serve it with Caddy (Railway)
railway.json     Railway build and deploy settings
```

## Local development

Node 20 or newer, Python 3.9 or newer.

```bash
cd site
npm ci
npm run dev        # http://localhost:5173, serves ../data at /data
npm test           # data contract, score recomputation, method constants vs docs/*.py
npm run build      # typecheck + production build to site/dist (copies data/*.json to dist/data/)
npm run preview    # serve site/dist
```

The site reads `${VITE_DATA_BASE_URL}/manifest.json` and loads the highest `bench_v<N>.json` it lists, falling back to the copy in `data/` if the bucket is unreachable. With `VITE_DATA_BASE_URL` empty it uses `data/` only, which is what you want while developing. To develop against the bucket, put `VITE_DATA_BASE_URL=...` in `site/.env`.

Tools:

```bash
pip install -r tools/requirements.txt              # boto3, for upload_data.py only
python -m unittest discover -s tools/tests -v      # export round trip, upload plan
node tools/validate_data.mjs                       # every bundle + manifest against the site's schemas (needs site/node_modules)
```


### Social-sharing image and meta tags

`site/index.html` carries the Open Graph / Twitter card tags; the canonical URL, site name and description live in `site/site.config.json` (one place; `vite.config.ts` fills them into the HTML at build time and `src/lib/config.ts` exports them). The card image `site/public/og.png` (1200×630) and `og-square.png` (1200×1200) are rendered from the current data bundle, in the site's own type and palette, by `tools/og.mjs` (`@resvg/resvg-js`, a devDependency; fonts in `tools/og/fonts` are static TTFs converted from the `@fontsource` packages). Regenerate after a new bundle or a URL change:

```bash
cd site && npm run og          # writes site/public/og.png and og-square.png from data/<manifest.latest>
```

To run the production image locally (needs Docker):

```bash
docker build -t truebasebench .
docker run --rm -p 8080:8080 truebasebench         # http://localhost:8080
```

## Data pipeline

Every number on the site comes from a bundle. Nothing is typed into the site by hand.

```
results/<model>/*.npz, names.json, rollouts.jsonl   docs/vh_score.py or vh_score_vllm.py (8xB200)
        |  vh_analyze.py --all, vh_memo.py, vh_selfboot.py, vh_tail.py, vh_names_table.py, vh_truebase.py
results/analysis/{fingerprints,truebase_scores,names_summary,weird_summary,selfboot,tail_realised}.json
        |  tools/export_bundle.py            (+ tools/models.json for family, stage, label, ladder order)
data/bench_v<N>.json + data/manifest.json   -> pull request -> CI validates and recomputes every score
        |  tools/upload_data.py              (manual GitHub workflow "Upload data to OVH Object Storage")
OVH bucket (public-read)                    -> site fetches manifest.json, then the latest bundle
```

`tools/export_bundle.py ANALYSIS_DIR`:

- takes family, stage, label and ladder position from `tools/models.json`; a measured model that is not in the registry is skipped with a warning (`--strict` makes it an error), and models under `exclude` are never exported;
- recomputes every sub-score from the fingerprint with the ramps of the spec and refuses to export if `truebase_scores.json` disagrees (if that file is missing, the recomputed scores are used);
- carries over, unchanged, models of the latest bundle that are not in the analysis directory, so a run that measured one new checkpoint still yields a complete bundle (`--no-merge` exports only what was measured);
- writes NaN as `null` ("not measured"), validates the result, writes `data/bench_v<N+1>.json` and adds it to `data/manifest.json`. It never overwrites a bundle without `--force`; published bundles are append-only.

`--dry-run` prints the table without writing anything. `--version`, `--generated`, `--base` and `--data-dir` (alias `--out`) override the defaults.

## Deploy

The site is static. Railway builds the `Dockerfile` (Node 20 builds the site and runs the tests, then `caddy:2.8.4-alpine` serves `site/dist`). Data is served from an OVH Object Storage bucket so a new bundle goes live without a redeploy; the copy in the image is the fallback.

### Railway

1. In Railway: New Project, Deploy from GitHub repo, pick this repository. Railway finds `railway.json` and builds with the `Dockerfile`; nothing else needs configuring.
2. Service variables (Railway passes them to the Docker build as build args, so changing one requires a redeploy):

   | variable | value |
   |---|---|
   | `VITE_DATA_BASE_URL` | `https://<bucket>.s3.<region>.io.cloud.ovh.net` (no trailing slash; add `/<prefix>` if you use `OVH_S3_PREFIX`). Leave empty to serve only the repo copy. |
   | `VITE_SOURCE_REPO_URL` | optional, the GitHub URL of this repository (links script names on the site) |
   | `RUN_TESTS` | optional, `0` skips `npm test` during the image build |

   `PORT` is set by Railway; Caddy listens on it.
3. Settings, Networking: Generate Domain, or add a custom domain and create the CNAME Railway shows. Railway terminates TLS.
4. Deploys follow pushes to the default branch. `watchPatterns` in `railway.json` skips rebuilds for changes outside `site/`, `data/`, `docs/`, `infra/caddy/`, `tools/csp.mjs` and the build files.
5. Health check: `GET /healthz` returns `ok`.

What the server does (`infra/caddy/Caddyfile`):

- `/assets/*` (Vite fingerprinted files): `Cache-Control: public, max-age=31536000, immutable`; a missing asset is a 404, never `index.html`.
- `index.html`, client routes and `/data/manifest.json`: `Cache-Control: no-cache`. `/data/bench_v<N>.json`: `public, max-age=3600`.
- zstd and gzip compression; SPA fallback (`/model/<id>`, `/findings`, ... get `index.html`).
- Security headers: a Content-Security-Policy generated at build time by `tools/csp.mjs` (`script-src 'self'` plus the hash of the inline theme script; `connect-src 'self'` plus the origin of `VITE_DATA_BASE_URL`), HSTS, `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.

### OVH Object Storage

One-time setup:

1. OVH Control Panel, Public Cloud, Object Storage: create a bucket (S3 API, "Standard" class) in a region, e.g. `gra`. Its endpoint is `https://s3.<region>.io.cloud.ovh.net`.
2. Public Cloud, Users & Roles: create a user with the "ObjectStore operator" role, then generate its S3 credentials (access key, secret key). Give the user access to the bucket.
3. Apply the CORS policy so browsers on the site's origin may read the bucket:

   ```bash
   python tools/upload_data.py --apply-cors         # uses infra/ovh/cors.json, reads .env
   # or, with the AWS CLI:
   aws s3api put-bucket-cors --endpoint-url https://s3.gra.io.cloud.ovh.net \
     --bucket <bucket> --cors-configuration file://infra/ovh/cors.json
   ```

   The policy (`infra/ovh/cors.json`) allows `GET` and `HEAD` from any origin, since the data is public and meant to be read from notebooks too. To restrict it, replace `"*"` in `AllowedOrigins` with the site's origin(s), e.g. `["https://truebasebench.org", "http://localhost:5173"]`.
4. Objects are uploaded with the `public-read` ACL. If the bucket refuses object ACLs, apply `infra/ovh/bucket-policy.json` instead (replace `BUCKET_NAME`): `aws s3api put-bucket-policy --endpoint-url ... --bucket <bucket> --policy file://infra/ovh/bucket-policy.json`.
5. First upload, then set `VITE_DATA_BASE_URL` on Railway (step 2 above) and redeploy.

Uploading (locally with a `.env`, see `.env.example`, or through GitHub Actions):

```bash
python tools/upload_data.py --dry-run           # what would be sent
python tools/upload_data.py --verify            # upload changed files, then fetch them back over HTTPS
python tools/upload_data.py --verify-only --origin https://<site>   # check status, content-type, cache-control, CORS
```

`upload_data.py` validates every file first, uploads the bundles and then `manifest.json` (so the manifest never points at a missing bundle), with `Content-Type: application/json; charset=utf-8`, the cache policy above and `public-read`. Files whose content already matches the remote object are skipped (`--force` re-sends them).

### GitHub Actions

- `.github/workflows/ci.yml` (pull requests and pushes to `main`): installs, validates `data/` against the site's schemas, runs `npm test` and `npm run build`, runs the Python tool tests, and builds and smoke-tests the Docker image.
- `.github/workflows/upload-data.yml` (manual, Actions tab, "Upload data to OVH Object Storage"): validates `data/` and runs `upload_data.py --verify`. Inputs: dry run, only some files, force, apply CORS. The job runs only when dispatched from `main`, in the `data` environment.

  Credentials are **environment secrets of the `data` environment**, not repository secrets (repository secrets are visible to every workflow on every branch). Settings, Environments, New environment `data`: under "Deployment branches and tags" choose "Selected branches and tags" and add `main`; optionally add a required reviewer. Then add the environment secrets `OVH_S3_ENDPOINT`, `OVH_S3_BUCKET`, `OVH_S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and the optional environment variables `OVH_S3_PREFIX`, `OVH_S3_PUBLIC_URL`, `SITE_ORIGIN` (enables the CORS check). Do not also define the secrets at repository level.

### Measurement corpora

The five fixed inputs of the measurement scripts are published in the same bucket under `corpus/`, with a `corpus/SHA256SUMS` file: `pile10k_sel.json`, `wiki_gh.json`, `uncheatable_2026_04.json`, `weird.json`, `names.json`. They are too large for the repository and do not change between bundles. The site's "Measure your model" page links them from `VITE_DATA_BASE_URL`. Publish them (once, from the machine that holds them) with:

```bash
python tools/upload_data.py --corpus-dir /path/to/corpus --corpus-only --verify
```

`--corpus-dir` checks that all five files are present and have the shape `vh_score.py` reads, writes `SHA256SUMS` next to them and uploads everything under `corpus/` (public-read, `Cache-Control: public, max-age=86400`). The Measure page and this README tell submitters to check the files with `sha256sum -c SHA256SUMS`.

## Adding a model

1. Download the measurement corpora from the data bucket and check them (the same files every published model was measured on; see "Measurement corpora" above):

   ```bash
   mkdir -p corpus && cd corpus
   for f in pile10k_sel.json wiki_gh.json uncheatable_2026_04.json weird.json names.json SHA256SUMS; do
     curl -fSLO "$DATA_BASE_URL/corpus/$f"     # DATA_BASE_URL = the site's VITE_DATA_BASE_URL
   done
   sha256sum -c SHA256SUMS && cd ..
   ```

   Then measure it with the scripts in `docs/` (8xB200 for the large models; the site's "Measure your model" page has the full commands and flags):

   ```bash
   python docs/vh_score.py --model /path/to/checkpoint --name my-model --out results \
     --corpus corpus/pile10k_sel.json --extra-corpus tf_wiki=corpus/wiki_gh.json \
     --extra-corpus tf_fresh=corpus/uncheatable_2026_04.json --extra-corpus tf_weird=corpus/weird.json \
     --names-probe corpus/names.json
   ```

2. Run the analysis, in order: `vh_analyze.py results --all`, `vh_memo.py`, `vh_selfboot.py`, `vh_tail.py`, `vh_names_table.py`, `vh_truebase.py` (they write `results/analysis/`).
3. Register it in `tools/models.json` under its result-directory name: `{"family": ..., "stage": "pre-anneal" | "anneal" | "base" | "post-trained", "label": ..., "order": <position in the family ladder>}`. A checkpoint that belongs to an existing family takes the next free `order` (or renumber the ladder); a new family starts at 0.
4. Export and check:

   ```bash
   python tools/export_bundle.py results/analysis     # writes data/bench_v<N+1>.json, updates data/manifest.json
   node tools/validate_data.mjs && (cd site && npm test)
   (cd site && npm run dev)                           # look at the model's page
   ```

5. Open a pull request with the new bundle, the manifest and the registry change; CI must pass. Describe the checkpoint (repository and revision), the commit of the scripts, the command lines, hardware and precision.
6. After merge, run the "Upload data to OVH Object Storage" workflow. The site picks up the new bundle on the next page load; Railway also redeploys with the new repo copy.

## Attribution

True Base Bench is built and maintained by [Anima Labs](https://github.com/anima-research).
