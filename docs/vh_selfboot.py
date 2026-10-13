#!/usr/bin/env python
"""Probe-free / self-bootstrapped statistics from existing results.
 A. top-1 reliability on post-cutoff text (tf_fresh.npz, falls back to tf.npz): ECE and over-confidence by bin.
 B. lexical law of the model's own bare-BOS samples (rollouts.jsonl) vs real text (the Pile corpus) at the
    same word budget: type-token ratio, hapax share, Zipf slope, distinct 4-gram ratio, gzip ratio.
Usage: vh_selfboot.py RESULTS_DIR [--corpus corpus.json]"""
import sys, os, json, re, gzip, math
import numpy as np

res = sys.argv[1]
corpus_path = sys.argv[sys.argv.index("--corpus") + 1] if "--corpus" in sys.argv else "/models/varentropy/corpus/pile10k_sel.json"
WORD = re.compile(r"[A-Za-z]+(?:'[a-z]+)?")


def lexical(texts, budget):
    """texts: list of strings; use the first `budget` words of each (equal budget per text)."""
    words_all, ttr, hapax, d4 = [], [], [], []
    for t in texts:
        w = [x.lower() for x in WORD.findall(t)][:budget]
        if len(w) < budget * 0.6:
            continue
        words_all += w
        ttr.append(len(set(w)) / len(w))
        c = {}
        for x in w:
            c[x] = c.get(x, 0) + 1
        hapax.append(sum(1 for v in c.values() if v == 1) / len(w))
        g = list(zip(w, w[1:], w[2:], w[3:]))
        d4.append(len(set(g)) / max(len(g), 1))
    if not words_all:
        return None
    c = {}
    for x in words_all:
        c[x] = c.get(x, 0) + 1
    freq = np.array(sorted(c.values(), reverse=True), float)
    r = np.arange(1, len(freq) + 1)
    n = min(2000, len(freq))
    slope = float(np.polyfit(np.log(r[:n]), np.log(freq[:n]), 1)[0])
    raw = " ".join(words_all).encode()
    gz = len(gzip.compress(raw)) / len(raw)
    return {"n_texts": len(ttr), "ttr": float(np.mean(ttr)), "hapax": float(np.mean(hapax)), "distinct4": float(np.mean(d4)),
            "zipf_slope": slope, "gzip_ratio": gz, "vocab": len(c)}


def reliability(z, nb=10):
    p1 = z["p1"].astype(np.float32); hit = (z["rank"] == 0).astype(np.float32)
    edges = np.linspace(0, 1, nb + 1)
    rows, ece = [], 0.0
    for lo, hi in zip(edges[:-1], edges[1:]):
        m = (p1 >= lo) & (p1 < hi) if hi < 1 else (p1 >= lo)
        if m.sum() == 0:
            continue
        conf, acc = float(p1[m].mean()), float(hit[m].mean())
        ece += m.mean() * abs(conf - acc)
        rows.append((lo, hi, int(m.sum()), conf, acc))
    hi_m = p1 >= 0.9
    return {"ECE": float(ece), "acc_minus_conf_p1>0.9": float(hit[hi_m].mean() - p1[hi_m].mean()) if hi_m.any() else None,
            "frac_p1>0.9": float(hi_m.mean()), "top1_acc": float(hit.mean()), "mean_p1": float(p1.mean()), "bins": rows}


corpus = json.load(open(corpus_path))
budget = 700
ref_texts = [d["text"] for d in corpus["tf"]][:200]
ref = lexical(ref_texts, budget)
print(f"REFERENCE (Pile docs, {budget} words each, n={ref['n_texts']}): ttr {ref['ttr']:.3f} hapax {ref['hapax']:.3f} distinct4 {ref['distinct4']:.3f} zipf {ref['zipf_slope']:.2f} gzip {ref['gzip_ratio']:.3f}")
print(f"\n{'model':30}{'ECE':>7}{'acc-conf@p1>.9':>15}{'frac>.9':>8}{'acc':>6} | {'ttr':>6}{'hapax':>7}{'dist4':>7}{'zipf':>6}{'gzip':>6}{'n':>4}  (lexical: own BOS samples vs ref)")
out = {}
for m in sorted(os.listdir(res)):
    d = os.path.join(res, m)
    if m.startswith("smoke") or m.startswith("vsmoke") or not os.path.isdir(d):
        continue
    p = os.path.join(d, "tf_fresh.npz") if os.path.exists(os.path.join(d, "tf_fresh.npz")) else os.path.join(d, "tf.npz")
    if not os.path.exists(p):
        continue
    rel = reliability(np.load(p))
    lex = None
    rp = os.path.join(d, "rollouts.jsonl")
    if os.path.exists(rp):
        texts = [json.loads(l)["text"] for l in open(rp) if json.loads(l)["group"] == "bos"]
        lex = lexical(texts, budget)
    out[m] = {"reliability": rel, "lexical": lex}
    lx = f"{lex['ttr']:6.3f}{lex['hapax']:7.3f}{lex['distinct4']:7.3f}{lex['zipf_slope']:6.2f}{lex['gzip_ratio']:6.3f}{lex['n_texts']:4d}" if lex else " " * 36
    print(f"{m[:30]:30}{rel['ECE']:7.3f}{(rel['acc_minus_conf_p1>0.9'] if rel['acc_minus_conf_p1>0.9'] is not None else float('nan')):15.3f}{rel['frac_p1>0.9']:8.3f}{rel['top1_acc']:6.2f} | {lx}")
json.dump({"reference": ref, "models": out}, open(os.path.join(res, "analysis", "selfboot.json"), "w"), indent=1)
print("\nECE: expected |hit-rate − p1| over 10 confidence bins (lower = better calibrated); acc-conf@p1>.9: negative = over-confident where most sure.")
print("Lexical: own samples with ttr/hapax/zipf far below the reference = mode-collapsed language; n = samples with ≥60% of the word budget.")
