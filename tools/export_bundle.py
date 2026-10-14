#!/usr/bin/env python3
"""Turn a measurement analysis directory into a True Base Bench data bundle.

Reads the files the measurement scripts write into results/analysis/ (see docs/vh_*.py):

    fingerprints.json     vh_analyze.py --all       {model: {feature: value}}           required
    truebase_scores.json  vh_truebase.py            {model: {calib|spread|memo|prior: {score,value,source}, overall, n_avail}}
    runs.json             (collected run.json files)  {model: {model_path, backend, library, n_tf, rollout_steps, ..., files_dated}}  optional
    names_summary.json    vh_names_table.py         {model: {KL_desc, KL_few, ...}}
    weird_summary.json    vh_names_table.py         {model: {ALL: [gap, runfrac, CE], <genre>: [...]}}
    selfboot.json         vh_selfboot.py            {reference: {...}, models: {model: {reliability, lexical}}}
    tail_realised.json    vh_tail.py                [{model, tf: {...}, tf_fresh: {...}, tf_weird: {...}}]
    bootstrap.json        vh_boot.py                {model: {stat: {value, ci95:[lo,hi] | range:[min,max], n_docs|n|n_frames}}}
    tailmass.json         vh_tailmass.py            {model: {tail: {...}, ood: {genre: {...}}, prior: {logp, instr_mass, ...}}}
    prior.json            corpus of the prior probe  {tf: [{name, set, text}]}  (falls back to data/prior_openers.json)

Only fingerprints.json is required; every other file is optional and missing entries become null
("not measured"). truebase_scores.json is cross-checked against a recomputation from the fingerprint
with the ramps of docs/SPEC.md (same code as docs/vh_truebase.py); if it is missing, the scores are
recomputed.

Model metadata (family, stage, label, order) comes from the registry tools/models.json: only models listed
there and not in its "exclude" map are exported. Models present in the analysis but not in the registry are
reported and skipped (use --strict to make that an error).

Models in the latest existing bundle that are not in the analysis directory are carried over unchanged
(--no-merge to export only what was measured; --base to pick another bundle), so a run that measured one new
checkpoint still produces a complete bundle. Published bundles are never modified.

Writes data/bench_v<N>.json (N = one more than the highest existing bundle unless --version is given) and
adds it to data/manifest.json. NaN/Infinity are written as null so the bundle is strict JSON.

Usage:
    python tools/export_bundle.py /models/varentropy/results/analysis
    python tools/export_bundle.py ANALYSIS_DIR --version 2 --generated 2026-11-01 --dry-run
    python tools/export_bundle.py ANALYSIS_DIR --no-merge      # bundle = exactly the analysed models
"""
from __future__ import annotations

import argparse
import datetime as _dt
import json
import math
import os
import re
import sys
from typing import Any, Dict, List, Optional, Tuple

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DEFAULT_DATA_DIR = os.path.join(REPO, "data")
DEFAULT_REGISTRY = os.path.join(HERE, "models.json")
DEFAULT_PRIOR_OPENERS = os.path.join(DEFAULT_DATA_DIR, "prior_openers.json")
# Optional per-model blocks added in bundle v6 (absent in older bundles; the site treats absence as null).
OPTIONAL_BLOCKS = ("ci", "tailmass", "prior", "ood")

SCHEMA_VERSION = 1
MANIFEST_VERSION = 1
STAGES = ("pre-anneal", "anneal", "base", "post-trained")
SUBSCORES = ("calib", "spread", "memo", "prior")
# score v0 averaged all four; v1 (2026-10-14) averages calib, spread and prior and keeps memo as a validation probe
SCORED_BY_VERSION: Dict[int, Tuple[str, ...]] = {0: SUBSCORES, 1: ("calib", "spread", "prior")}
BUNDLE_RE = re.compile(r"^bench_v(\d+)\.json$")

# Ramps (docs/SPEC.md, docs/vh_truebase.py): sub-score -> (value scoring 1, value scoring 0).
RAMPS: Dict[str, Tuple[float, float]] = {
    "calib": (0.0, -0.10),
    "spread": (0.015, 0.10),
    "memo": (0.02, 0.12),
    "prior": (0.0, 0.40),
}
# Feature preference per sub-score (first available wins), as in docs/vh_truebase.py.
SOURCES: Dict[str, Tuple[str, ...]] = {
    "calib": ("F_calib_gap", "calib_gap"),
    "spread": ("F_gap_domain_absmean", "calib_gap_domain_absmean"),
    "memo": ("X_runfrac_wiki", "verbatim_run_frac_wiki"),
    "prior": ("roll_instr_marker_rate",),
}
TOL = 1e-9


class ExportError(Exception):
    pass


# ---------------------------------------------------------------- helpers

def is_missing(v: Any) -> bool:
    return v is None or (isinstance(v, float) and (math.isnan(v) or math.isinf(v)))


def clean(obj: Any) -> Any:
    """Recursively replace NaN/Infinity with None and tuples with lists."""
    if isinstance(obj, float):
        return None if (math.isnan(obj) or math.isinf(obj)) else obj
    if isinstance(obj, dict):
        return {str(k): clean(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [clean(v) for v in obj]
    return obj


def load_json(path: str) -> Any:
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)  # Python's json accepts the bare NaN tokens the scripts write


def load_optional(adir: str, name: str, warnings: List[str]) -> Any:
    p = os.path.join(adir, name)
    if not os.path.exists(p):
        warnings.append(f"{name} not found in {adir}: the corresponding fields will be null")
        return None
    return load_json(p)


# ---------------------------------------------------------------- scoring (mirrors docs/vh_truebase.py)

def ramp(x: Optional[float], good: float, bad: float) -> Optional[float]:
    if is_missing(x):
        return None
    t = (x - bad) / (good - bad)
    return max(0.0, min(1.0, t))


def pick(f: Dict[str, Any], keys: Tuple[str, ...]) -> Tuple[Optional[float], Optional[str]]:
    for k in keys:
        v = f.get(k)
        if not is_missing(v):
            return v, k
    return None, None


def score_fingerprint(f: Dict[str, Any], score_version: int = 1) -> Dict[str, Any]:
    out: Dict[str, Any] = {}
    scored = SCORED_BY_VERSION[score_version]
    for name in SUBSCORES:
        value, src = pick(f, SOURCES[name])
        x = value
        if name == "calib" and value is not None:
            x = min(value, 0.0)  # a positive gap (under-confident) is not penalised
        out[name] = {"score": ramp(x, *RAMPS[name]), "value": value, "source": src}
        if score_version >= 1:
            out[name]["scored"] = name in scored
    avail = [out[k]["score"] for k in scored if out[k]["score"] is not None]
    out["overall"] = sum(avail) / len(avail) if avail else None
    out["n_avail"] = len(avail)
    return out


def close(a: Optional[float], b: Optional[float]) -> bool:
    if is_missing(a) or is_missing(b):
        return is_missing(a) and is_missing(b)
    return abs(a - b) <= TOL


# ---------------------------------------------------------------- bundle assembly

def load_registry(path: str) -> Dict[str, Any]:
    reg = load_json(path)
    models = reg.get("models") or {}
    for mid, meta in models.items():
        for k in ("family", "stage", "label", "order"):
            if k not in meta:
                raise ExportError(f"registry {path}: model {mid!r} lacks {k!r}")
        if meta["stage"] not in STAGES:
            raise ExportError(f"registry {path}: model {mid!r} has stage {meta['stage']!r}, expected one of {STAGES}")
        if not isinstance(meta["order"], int) or meta["order"] < 0:
            raise ExportError(f"registry {path}: model {mid!r} order must be a non-negative integer")
    reg["models"] = models
    reg["exclude"] = reg.get("exclude") or {}
    return reg


def tail_by_model(tail: Any) -> Dict[str, Dict[str, Any]]:
    if tail is None:
        return {}
    if isinstance(tail, dict):  # tolerate a {model: {...}} layout too
        return {m: {k: v for k, v in row.items() if k != "model"} for m, row in tail.items()}
    out = {}
    for row in tail:
        out[row["model"]] = {k: v for k, v in row.items() if k != "model"}
    return out


def ci_block(row: Any) -> Optional[Dict[str, Any]]:
    """bootstrap.json row -> {stat: {value, ci95|range, n...}}; only interval-bearing entries, None when empty."""
    if not isinstance(row, dict):
        return None
    out = {k: v for k, v in row.items() if isinstance(v, dict) and "value" in v and ("ci95" in v or "range" in v)}
    return out or None


# Models whose start token was never seen in training (their tokenizer adds no BOS and the probe had to prepend one):
# the distribution after it is not a document prior. Reported but flagged.
PRIOR_UNRELIABLE = {
    "kimi-k2-base": "tokenizer emits no [BOS]; after a prepended [BOS] the model puts 64% on ' .'",
    "Kimi-K2-Instruct": "tokenizer emits no [BOS]; after a prepended [BOS] the model puts 75% on ' &'",
}


def prior_block(pr: Optional[dict], mid: str) -> Optional[dict]:
    """The exact-prior block as the site consumes it. Primary masses are the whitespace-stripped ones
    (vh_tailmass.py: trailing whitespace-only tokens of a template cost 3-7 nats in every tokenizer because
    the following word carries its own leading space); the raw sums are kept under `raw`."""
    if not pr:
        return None
    if "logp_strip" not in pr:  # older analysis file: pass through
        return pr
    out = {
        "logp": pr["logp_strip"], "instr_mass": pr["instr_mass_strip"], "ctrl_mass": pr["ctrl_mass_strip"],
        "instr_logmass": math.log(max(pr["instr_mass_strip"], 1e-300)), "ctrl_logmass": math.log(max(pr["ctrl_mass_strip"], 1e-300)),
        "instr_argmax": pr["instr_argmax_strip"], "instr_max": pr["logp_strip"][pr["instr_argmax_strip"]],
        "stripped": bool(pr.get("stripped")), "n_stripped": pr.get("n_stripped"),
        "raw": {"logp": pr["logp"], "instr_mass": pr["instr_mass"], "ctrl_mass": pr["ctrl_mass"], "instr_argmax": pr["instr_argmax"]},
        "start": pr.get("start"),
    }
    if mid in PRIOR_UNRELIABLE:
        out["unreliable"] = PRIOR_UNRELIABLE[mid]
    return out


def prior_openers_of(adir: str, warnings: List[str]) -> Optional[Dict[str, Dict[str, str]]]:
    """{template name: {set, text}} from the prior corpus (analysis dir first, then the repo copy)."""
    for p in (os.path.join(adir, "prior.json"), DEFAULT_PRIOR_OPENERS):
        if os.path.exists(p):
            docs = load_json(p).get("tf") or []
            return {d["name"]: {"set": d["set"], "text": d["text"]} for d in docs if "name" in d}
    warnings.append("prior.json / data/prior_openers.json not found: reference.prior_openers omitted")
    return None


def build_bundle(adir: str, registry: Dict[str, Any], generated: str, strict: bool = False,
                 base: Optional[Dict[str, Any]] = None, base_name: str = "base bundle") -> Tuple[Dict[str, Any], List[str]]:
    """Assemble a bundle from an analysis directory. With `base` (a previous bundle), models that are not in the
    analysis are carried over unchanged, so a run that measured only new checkpoints still yields a full bundle."""
    warnings: List[str] = []
    fp_path = os.path.join(adir, "fingerprints.json")
    if not os.path.exists(fp_path):
        raise ExportError(f"{fp_path} not found (run docs/vh_analyze.py RESULTS --all first)")
    fps: Dict[str, Dict[str, Any]] = load_json(fp_path)
    scores = load_optional(adir, "truebase_scores.json", warnings) or {}
    # score version: v1 marks itself in truebase_scores.json ("_score_version"); an unmarked file or no file is v0
    score_version = int(scores.get("_score_version", 0)) if scores else 0
    scores = {k: v for k, v in scores.items() if not k.startswith("_")}
    scored = SCORED_BY_VERSION[score_version]
    names = load_optional(adir, "names_summary.json", warnings) or {}
    weird = load_optional(adir, "weird_summary.json", warnings) or {}
    selfboot_raw = load_optional(adir, "selfboot.json", warnings) or {}
    tails = tail_by_model(load_optional(adir, "tail_realised.json", warnings))
    runs = load_optional(adir, "runs.json", warnings) or {}  # provenance: model path, backend, run settings, dates
    selfboot = selfboot_raw.get("models", {}) if isinstance(selfboot_raw, dict) else {}
    boot = load_optional(adir, "bootstrap.json", warnings) or {}  # document-level bootstrap CIs
    tailmass = load_optional(adir, "tailmass.json", warnings) or {}  # predicted tail mass, OOD genres, exact prior mass
    prior_openers = prior_openers_of(adir, warnings)

    reg_models: Dict[str, Dict[str, Any]] = registry["models"]
    excluded: Dict[str, str] = registry["exclude"]

    measured = [m for m in fps if not m.startswith(("smoke", "vsmoke"))]
    unknown = sorted(m for m in measured if m not in reg_models and m not in excluded)
    if unknown:
        msg = "measured but not in the registry (skipped; add them to tools/models.json): " + ", ".join(unknown)
        if strict:
            raise ExportError(msg)
        warnings.append(msg)
    for m in sorted(set(measured) & set(excluded)):
        warnings.append(f"{m}: excluded by registry ({excluded[m]})")
    missing = sorted(m for m in reg_models if m not in fps and m not in excluded)
    if missing:
        warnings.append("in the registry but not in fingerprints.json (not exported): " + ", ".join(missing))

    models: List[Dict[str, Any]] = []
    for mid in measured:
        if mid not in reg_models or mid in excluded:
            continue
        meta = reg_models[mid]
        fp = fps[mid]
        recomputed = score_fingerprint(fp, score_version)
        given = scores.get(mid)
        if given is None:
            if scores:
                warnings.append(f"{mid}: not in truebase_scores.json, scores recomputed from the fingerprint")
            sc = recomputed
        else:
            sc = given
            for k in SUBSCORES:
                g, r = given.get(k) or {}, recomputed[k]
                if score_version >= 1:
                    g = dict(g); g.setdefault("scored", k in scored); sc[k] = g
                if not close(g.get("score"), r["score"]) or not close(g.get("value"), r["value"]):
                    raise ExportError(f"{mid}: truebase_scores.json {k} = {g} disagrees with recomputation {r}; "
                                      f"re-run docs/vh_truebase.py on this fingerprints.json")
            if not close(given.get("overall"), recomputed["overall"]):
                raise ExportError(f"{mid}: truebase_scores.json overall {given.get('overall')} != recomputed {recomputed['overall']}")
        models.append({
            "id": mid,
            "family": meta["family"],
            "stage": meta["stage"],
            "label": meta["label"],
            "order": meta["order"],
            "score": sc.get("overall"),
            "subscores": {k: sc.get(k) for k in SUBSCORES},
            "fingerprint": fp,
            "surnames": names.get(mid),
            "weird": weird.get(mid),
            "selfboot": selfboot.get(mid),
            "tail": tails.get(mid),
            "ci": ci_block(boot.get(mid)),
            "tailmass": (tailmass.get(mid) or {}).get("tail"),
            "prior": prior_block((tailmass.get(mid) or {}).get("prior"), mid),
            "ood": (tailmass.get(mid) or {}).get("ood"),
            **({"provenance": clean(runs[mid])} if runs.get(mid) else {}),
        })
        for part in ("surnames", "weird", "selfboot", "tail") + OPTIONAL_BLOCKS:
            if models[-1][part] is None:
                warnings.append(f"{mid}: no {part} data (null)")

    if base is not None:
        fresh = {m["id"] for m in models}
        for old in base.get("models", []):
            if old["id"] in fresh:
                warnings.append(f"{old['id']}: re-measured, replaces the entry in {base_name}")
            elif old["id"] in excluded:
                warnings.append(f"{old['id']}: in {base_name} but excluded by the registry (dropped)")
            else:
                models.append(dict(old))
        warnings.append(f"carried over {len(models) - len(fresh)} model(s) from {base_name}")

    if not models:
        raise ExportError("no models to export (check tools/models.json against fingerprints.json)")

    # Duplicate (family, order) pairs make ladder charts ambiguous.
    seen: Dict[Tuple[str, int], str] = {}
    for m in models:
        key = (m["family"], m["order"])
        if key in seen:
            raise ExportError(f"{m['id']} and {seen[key]} share family {key[0]!r} and order {key[1]}")
        seen[key] = m["id"]

    def sort_key(m: Dict[str, Any]):
        s = m["score"]
        return (1, 0.0, m["id"]) if is_missing(s) else (0, -s, m["id"])

    models.sort(key=sort_key)

    reference: Dict[str, Any] = dict(registry.get("reference") or {})
    if isinstance(selfboot_raw, dict) and selfboot_raw.get("reference") is not None:
        reference["pile_lexical"] = selfboot_raw["reference"]
    if reference.get("pile_lexical") is None and base is not None:
        reference["pile_lexical"] = (base.get("reference") or {}).get("pile_lexical")
    reference.setdefault("pile_lexical", None)
    if prior_openers is not None and any(m.get("prior") for m in models):
        reference["prior_openers"] = prior_openers  # describes the probe, so only when some model ran it
    elif base is not None and (base.get("reference") or {}).get("prior_openers") is not None:
        reference["prior_openers"] = base["reference"]["prior_openers"]
    # The Census entropy over the 2,000 probed surnames is computed by the names probe itself (H_ref, the
    # same for every model); prefer it at full precision over the rounded registry constant.
    h_ref = [m["surnames"].get("H_r") for m in models if isinstance(m.get("surnames"), dict)]
    h_ref = [h for h in h_ref if not is_missing(h)]
    if h_ref:
        if max(h_ref) - min(h_ref) > 1e-6:
            warnings.append(f"surnames.H_r differs across models ({min(h_ref)} .. {max(h_ref)}); using the median")
        reference["census_entropy_top2000"] = sorted(h_ref)[len(h_ref) // 2]

    if score_version >= 1:  # v0 bundles stay byte-identical (their reference block predates these keys)
        reference["score_version"] = score_version
        reference["scored_subscores"] = list(scored)
    bundle = clean({
        "schema_version": SCHEMA_VERSION,
        "generated": generated,
        "n_models": len(models),
        "reference": reference,
        "models": models,
    })
    validate_bundle(bundle)
    return bundle, warnings


# ---------------------------------------------------------------- validation (mirrors site/src/data/bench.schema.json essentials)

def validate_bundle(b: Dict[str, Any]) -> None:
    errs: List[str] = []
    for k in ("schema_version", "generated", "n_models", "reference", "models"):
        if k not in b:
            errs.append(f"missing top-level {k!r}")
    if not re.match(r"^\d{4}-\d{2}-\d{2}", str(b.get("generated", ""))):
        errs.append("generated must start with YYYY-MM-DD")
    models = b.get("models") or []
    if b.get("n_models") != len(models):
        errs.append(f"n_models {b.get('n_models')} != len(models) {len(models)}")
    ids = set()
    for m in models:
        mid = m.get("id")
        if not mid or mid in ids:
            errs.append(f"missing or duplicate id {mid!r}")
        ids.add(mid)
        for k in ("family", "stage", "label", "order", "score", "subscores", "fingerprint", "surnames", "weird", "selfboot", "tail"):
            if k not in m:
                errs.append(f"{mid}: missing {k!r}")
        if m.get("stage") not in STAGES:
            errs.append(f"{mid}: bad stage {m.get('stage')!r}")
        s = m.get("score")
        if s is not None and not (0.0 <= s <= 1.0):
            errs.append(f"{mid}: score {s} outside [0, 1]")
        if not isinstance(m.get("fingerprint"), dict):
            errs.append(f"{mid}: fingerprint must be an object")
        for k, sub in (m.get("subscores") or {}).items():
            if sub is None:
                continue
            if set(("score", "value", "source")) - set(sub):
                errs.append(f"{mid}: subscore {k} lacks score/value/source")
            elif sub["score"] is not None and not (0.0 <= sub["score"] <= 1.0):
                errs.append(f"{mid}: subscore {k} score {sub['score']} outside [0, 1]")
        w = m.get("weird")
        if w is not None:
            for g, t in w.items():
                if not (isinstance(t, list) and len(t) == 3):
                    errs.append(f"{mid}: weird[{g!r}] must be [gap, runfrac, CE]")
        ci = m.get("ci")
        if ci is not None:
            for k, v in ci.items():
                iv = (v or {}).get("ci95", (v or {}).get("range"))
                if not (isinstance(v, dict) and "value" in v and isinstance(iv, list) and len(iv) == 2):
                    errs.append(f"{mid}: ci[{k!r}] must be {{value, ci95|range:[lo, hi]}}")
        tm = m.get("tailmass")
        if tm is not None:
            for k in (2, 3, 4):
                if f"pred{k}" not in tm or f"real{k}" not in tm:
                    errs.append(f"{mid}: tailmass lacks pred{k}/real{k}")
        pr = m.get("prior")
        if pr is not None and not isinstance(pr.get("logp"), dict):
            errs.append(f"{mid}: prior.logp must be an object")
        ood = m.get("ood")
        if ood is not None:
            for g, t in ood.items():
                if not isinstance(t, dict) or "CE" not in t or "gap" not in t:
                    errs.append(f"{mid}: ood[{g!r}] must carry CE and gap")
        bins = ((m.get("selfboot") or {}).get("reliability") or {}).get("bins")
        if bins is not None:
            for row in bins:
                if not (isinstance(row, list) and len(row) == 5):
                    errs.append(f"{mid}: reliability bin must be [lo, hi, n, conf, acc]")
                    break
    if errs:
        raise ExportError("bundle failed validation:\n  " + "\n  ".join(errs[:40]))


# ---------------------------------------------------------------- manifest

def bundle_version(name: str) -> int:
    m = BUNDLE_RE.match(name)
    return int(m.group(1)) if m else -1


def existing_versions(data_dir: str, manifest: Optional[Dict[str, Any]]) -> List[int]:
    vs = [bundle_version(f) for f in os.listdir(data_dir)] if os.path.isdir(data_dir) else []
    for e in (manifest or {}).get("bundles", []):
        vs.append(bundle_version(e if isinstance(e, str) else e.get("file", "")))
    return sorted(v for v in vs if v >= 0)


def update_manifest(manifest: Optional[Dict[str, Any]], file: str, bundle: Dict[str, Any]) -> Dict[str, Any]:
    entries = []
    for e in (manifest or {}).get("bundles", []):
        e = {"file": e} if isinstance(e, str) else dict(e)
        if e.get("file") != file:
            entries.append(e)
    entries.append({"file": file, "schema_version": bundle["schema_version"],
                    "generated": bundle["generated"], "n_models": bundle["n_models"]})
    entries.sort(key=lambda e: bundle_version(e["file"]))
    latest = max(entries, key=lambda e: bundle_version(e["file"]))["file"]
    return {"manifest_version": MANIFEST_VERSION, "latest": latest, "bundles": entries}


def dump(obj: Any, indent: int = 1) -> str:
    return json.dumps(obj, indent=indent, ensure_ascii=False, allow_nan=False) + "\n"


def write_atomic(path: str, text: str) -> None:
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(text)
    os.replace(tmp, path)


# ---------------------------------------------------------------- CLI

def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("analysis_dir", help="results/analysis directory written by the docs/vh_*.py scripts")
    ap.add_argument("--data-dir", "--out", dest="data_dir", default=DEFAULT_DATA_DIR,
                    help="where bench_v<N>.json and manifest.json live (default: data/)")
    ap.add_argument("--registry", default=DEFAULT_REGISTRY, help="model registry JSON (default: tools/models.json)")
    ap.add_argument("--version", type=int, default=None, help="bundle number N (default: highest existing + 1)")
    ap.add_argument("--generated", default=None, help="date stamp YYYY-MM-DD (default: today, UTC)")
    ap.add_argument("--force", action="store_true", help="overwrite an existing bench_v<N>.json")
    ap.add_argument("--strict", action="store_true", help="fail if a measured model is missing from the registry")
    ap.add_argument("--base", default=None,
                    help="bundle whose models are carried over when not in the analysis (default: the latest bundle in --data-dir)")
    ap.add_argument("--no-merge", action="store_true", help="export only the models in the analysis directory")
    ap.add_argument("--no-manifest", action="store_true", help="write the bundle but leave manifest.json alone")
    ap.add_argument("--dry-run", action="store_true", help="build and validate, print a summary, write nothing")
    args = ap.parse_args(argv)

    generated = args.generated or _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%d")
    try:
        registry = load_registry(args.registry)
        man_path = os.path.join(args.data_dir, "manifest.json")
        manifest = load_json(man_path) if os.path.exists(man_path) else None
        versions = existing_versions(args.data_dir, manifest)
        base, base_name = None, ""
        if not args.no_merge:
            base_path = args.base or (os.path.join(args.data_dir, f"bench_v{versions[-1]}.json") if versions else None)
            if base_path:
                if not os.path.exists(base_path):
                    raise ExportError(f"base bundle {base_path} not found")
                base, base_name = load_json(base_path), os.path.basename(base_path)
        bundle, warnings = build_bundle(args.analysis_dir, registry, generated, strict=args.strict,
                                        base=base, base_name=base_name)
        n = args.version if args.version is not None else (versions[-1] + 1 if versions else 1)
        if n < 1:
            raise ExportError("--version must be >= 1")
        file = f"bench_v{n}.json"
        out_path = os.path.join(args.data_dir, file)
        if os.path.exists(out_path) and not args.force and not args.dry_run:
            raise ExportError(f"{out_path} exists; pass --force to overwrite or --version to pick another N")
    except ExportError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    for w in warnings:
        print(f"warning: {w}", file=sys.stderr)
    print(f"{file}: {bundle['n_models']} models, generated {bundle['generated']}")
    for m in bundle["models"]:
        s = m["score"]
        print(f"  {('%.3f' % s) if s is not None else '  -  '}  {m['stage']:12} {m['family']} · {m['label']}  [{m['id']}]")
    if args.dry_run:
        print("dry run: nothing written")
        return 0
    os.makedirs(args.data_dir, exist_ok=True)
    write_atomic(out_path, dump(bundle))
    print(f"wrote {out_path}")
    if not args.no_manifest:
        write_atomic(man_path, dump(update_manifest(manifest, file, bundle), indent=2))
        print(f"updated {man_path}")
    print("next: node tools/validate_data.mjs && (cd site && npm test), then python tools/upload_data.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
