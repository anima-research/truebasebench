#!/usr/bin/env python
"""Bootstrap confidence intervals for the headline statistics (analysis only; per-document aggregates, so O(B x docs)).
 - document-level bootstrap on post-cutoff text (tf_fresh.npz): calibration gap mean(H-s), mean |per-domain gap|, top-1 ECE
 - document-level on tf_wiki.npz: Wikipedia verbatim-run share (>=16 consecutive top-1 hits with H<0.2)
 - document-level on tf_tail.npz: tail-mass ratios realised/predicted (when present)
 - rollout-level on rollouts.jsonl: instruction-marker rate of bare-BOS samples
 - surname KL: spread across the three described / three few-shot frames (too few to bootstrap)
Usage: vh_boot.py [RESULTS_DIR] [--B 2000] -> analysis/bootstrap.json"""
import os, sys, json
import numpy as np
res = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else "/models/varentropy/results"
B = int(sys.argv[sys.argv.index("--B") + 1]) if "--B" in sys.argv else 2000
rng = np.random.default_rng(0)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vh_analyze import MARKERS
LN10 = np.log(10.0)


def ci(v):
    return [float(np.percentile(v, 2.5)), float(np.percentile(v, 97.5))]


def per_doc(z, cols):
    """sum each column per document -> (D, k) array plus counts (D,)"""
    doc = z["doc"]; ids, inv = np.unique(doc, return_inverse=True)
    n = np.bincount(inv).astype(np.float64)
    sums = np.stack([np.bincount(inv, weights=c.astype(np.float64)) for c in cols], 1)
    return ids, n, sums


def boot_ratio(num, den, B=B):
    """bootstrap of sum(num)/sum(den) over documents"""
    D = len(num); base = num.sum() / den.sum()
    pick = rng.integers(0, D, (B, D))
    vals = num[pick].sum(1) / den[pick].sum(1)
    return {"value": float(base), "ci95": ci(vals), "n_docs": int(D)}


def runmask(z, min_run=16):
    hit = (z["rank"] == 0) & (z["H"].astype(np.float32) < 0.2); doc = z["doc"]
    brk = np.r_[True, (doc[1:] != doc[:-1]) | ~hit[1:] | ~hit[:-1]]  # start of a new run (or non-hit)
    inrun = np.zeros(len(hit), bool)
    starts = np.flatnonzero(brk & hit); ends = np.r_[starts[1:], len(hit)]
    # a run is a maximal block of hits within one doc; compute block ends properly
    i = 0; n = len(hit)
    while i < n:
        if hit[i]:
            j = i
            while j < n and hit[j] and doc[j] == doc[i]: j += 1
            if j - i >= min_run: inrun[i:j] = True
            i = j
        else:
            i += 1
    return inrun


out = {}
for m in sorted(os.listdir(res)):
    d = os.path.join(res, m)
    if m.startswith(("smoke", "vsmoke")) or not os.path.isdir(d):
        continue
    row = {}
    p = os.path.join(d, "tf_fresh.npz")
    if os.path.exists(p):
        z = np.load(p); meta = json.load(open(os.path.join(d, "tf_fresh_docs.json")))
        H = z["H"].astype(np.float32); s = z["s"].astype(np.float32); gap = H - s
        p1 = z["p1"].astype(np.float32); hit = (z["rank"] == 0).astype(np.float32)
        b = np.minimum((p1 * 10).astype(int), 9)
        cols = [gap] + [(b == k) * 1.0 for k in range(10)] + [(b == k) * p1 for k in range(10)] + [(b == k) * hit for k in range(10)]
        ids, n, S = per_doc(z, cols)
        row["calib_gap"] = boot_ratio(S[:, 0], n)
        dom_of = {mm["doc"]: mm["set"] for mm in meta}; dom = np.array([dom_of[i] for i in ids]); doms = sorted(set(dom))
        D = len(ids); pick = rng.integers(0, D, (B, D)); vals = []
        onehot = np.stack([(dom == dd) for dd in doms], 1).astype(np.float64)  # (D, G)
        gs = S[:, 0:1] * onehot; gn = n[:, None] * onehot
        for bi in range(B):
            pk = pick[bi]; num = gs[pk].sum(0); den = gn[pk].sum(0); ok = den > 0
            vals.append(np.abs(num[ok] / den[ok]).mean())
        base = np.abs(gs.sum(0) / gn.sum(0)).mean()
        row["spread"] = {"value": float(base), "ci95": ci(vals), "n_docs": int(D), "n_domains": len(doms)}
        cnt, sp, sh = S[:, 1:11], S[:, 11:21], S[:, 21:31]
        def ece_of(pk):
            c = cnt[pk].sum(0); P = sp[pk].sum(0); Hh = sh[pk].sum(0); ok = c > 0
            return float(((c[ok] / c.sum()) * np.abs(P[ok] / c[ok] - Hh[ok] / c[ok])).sum())
        vals = [ece_of(pick[bi]) for bi in range(B)]
        row["ECE"] = {"value": ece_of(np.arange(D)), "ci95": ci(vals), "n_docs": int(D)}
    p = os.path.join(d, "tf_wiki.npz")
    if os.path.exists(p):
        z = np.load(p); meta = json.load(open(os.path.join(d, "tf_wiki_docs.json")))
        wiki = np.isin(z["doc"], [mm["doc"] for mm in meta if mm["set"] == "Wikipedia (en)"])
        inrun = runmask(z)
        zz = {"doc": z["doc"][wiki]}; ids, n, S = per_doc(zz, [inrun[wiki] * 1.0])
        row["memo_wiki"] = boot_ratio(S[:, 0], n)
    p = os.path.join(d, "tf_tail.npz")
    if os.path.exists(p):
        z = np.load(p); s = z["s"].astype(np.float32)
        for k, col in ((2, "m2"), (3, "m3"), (4, "m4")):
            ids, n, S = per_doc(z, [z[col].astype(np.float32), (s > k * LN10) * 1.0])
            row[f"tail_ratio{k}"] = boot_ratio(S[:, 1], S[:, 0])
    p = os.path.join(d, "rollouts.jsonl")
    if os.path.exists(p):
        texts = [json.loads(l)["text"] for l in open(p) if json.loads(l)["group"] == "bos"]
        flags = np.array([any(mk in t for mk in MARKERS) for t in texts], np.float64)
        if len(flags):
            pick = rng.integers(0, len(flags), (B, len(flags)))
            row["prior_marker"] = {"value": float(flags.mean()), "ci95": ci(flags[pick].mean(1)), "n": int(len(flags))}
    p = os.path.join(d, "names.json")
    if os.path.exists(p):
        try:
            j = json.load(open(p))["surnames"]
            few = [v["exact"]["KL(ref||model)"] for k, v in j.items() if k.startswith("fewshot")]
            desc = [v["exact"]["KL(ref||model)"] for k, v in j.items() if not k.startswith("fewshot")]
            if few: row["KL_few"] = {"value": float(np.mean(few)), "range": [min(few), max(few)], "n_frames": len(few)}
            if desc: row["KL_desc"] = {"value": float(np.mean(desc)), "range": [min(desc), max(desc)], "n_frames": len(desc)}
        except Exception as e:
            row["names_err"] = str(e)
    if row:
        out[m] = row
    print(m[:30].ljust(30), " ".join(f"{k}={v['value']:.4f}[{v['ci95'][0]:.4f},{v['ci95'][1]:.4f}]" for k, v in row.items() if isinstance(v, dict) and "ci95" in v), flush=True)
os.makedirs(os.path.join(res, "analysis"), exist_ok=True)
json.dump(out, open(os.path.join(res, "analysis", "bootstrap.json"), "w"), indent=1)
