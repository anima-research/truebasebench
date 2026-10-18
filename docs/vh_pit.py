#!/usr/bin/env python
"""Probability-integral-transform calibration from the tf_pit pass. Per position the scorers store `ma`, the model's mass on
tokens it rated more likely than the real one, and s = -log p(real). The randomised PIT u = ma + U*p(real) is Uniform(0,1)
for a calibrated model, whatever the shape of its distributions. Reported: the coverage curve P(u <= q) (model top-q mass
should contain the real token with probability q), its maximum absolute deviation KS (two-sided; noise cannot lower it below
the model's own value), the signed excess at q = 0.1 and 0.9 (over-confidence shows as coverage < q at small q: real tokens
fall outside the model's confident mass more often than it says), mean u - 0.5, and the same per entropy octile and per
domain, with a document-level bootstrap CI for KS. Usage: vh_pit.py [RESULTS_DIR] [--B 400] -> analysis/pit.json"""
import os, sys, json
import numpy as np
res = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else "/models/varentropy/results"
B = int(sys.argv[sys.argv.index("--B") + 1]) if "--B" in sys.argv else 400
Q = np.linspace(0.0, 1.0, 41)  # coverage grid, step 0.025


def coverage(u, w=None):
    """P(u <= q) on the grid Q (weights optional)"""
    if w is None: w = np.ones_like(u)
    order = np.argsort(u); cu = np.cumsum(w[order]) / w.sum()
    return np.interp(Q, u[order], cu, left=0.0, right=1.0)


def stats(u):
    cov = coverage(u); dev = cov - Q
    return {"KS": float(np.abs(dev).max()), "q_at_max": float(Q[int(np.argmax(np.abs(dev)))]), "mean_u": float(u.mean()),
            "cov": cov.round(5).tolist(), "excess_q10": float(dev[np.argmin(np.abs(Q - 0.1))]), "excess_q50": float(dev[np.argmin(np.abs(Q - 0.5))]),
            "excess_q90": float(dev[np.argmin(np.abs(Q - 0.9))]), "signed_area": float(np.trapz(dev, Q)), "n": int(len(u))}


out = {}
for m in sorted(os.listdir(res)):
    p = os.path.join(res, m, "tf_pit.npz")
    if m.startswith(("smoke", "vsmoke", "x_")) or not os.path.exists(p):
        continue
    z = np.load(p); rng = np.random.default_rng(0)
    ma = z["ma"].astype(np.float64); py = np.exp(-z["s"].astype(np.float64)); u = np.clip(ma + rng.random(len(ma)) * py, 0.0, 1.0)
    H = z["H"].astype(np.float64); doc = z["doc"]; docs = json.load(open(os.path.join(res, m, "tf_pit_docs.json")))
    row = stats(u)
    # document bootstrap of KS
    ids, inv = np.unique(doc, return_inverse=True); D = len(ids); by = [np.flatnonzero(inv == i) for i in range(D)]
    ks = []
    for _ in range(B):
        pk = rng.integers(0, D, D); idx = np.concatenate([by[i] for i in pk]); ks.append(stats(u[idx])["KS"])
    row["KS_ci95"] = [float(np.percentile(ks, 2.5)), float(np.percentile(ks, 97.5))]
    oct_ = np.digitize(H, np.quantile(H, np.linspace(0, 1, 9)[1:-1]))
    row["by_H_octile"] = [{"mean_H": float(H[oct_ == k].mean()), "KS": stats(u[oct_ == k])["KS"], "excess_q10": stats(u[oct_ == k])["excess_q10"], "mean_u": float(u[oct_ == k].mean())} for k in range(8)]
    dom_of = {d["doc"]: d["set"] for d in docs}; dom = np.array([dom_of[i] for i in doc.tolist()])
    row["by_domain"] = {dd: {"KS": stats(u[dom == dd])["KS"], "mean_u": float(u[dom == dd].mean()), "n": int((dom == dd).sum())} for dd in sorted(set(dom))}
    row["KS_domain_max"] = max(v["KS"] for v in row["by_domain"].values()); row["KS_H_max"] = max(v["KS"] for v in row["by_H_octile"])
    out[m] = row
os.makedirs(os.path.join(res, "analysis"), exist_ok=True)
json.dump(out, open(os.path.join(res, "analysis", "pit.json"), "w"), indent=1)
print(f"{'model':28}{'KS':>7}{'ci':>16}{'q@max':>6}{'mean_u':>8}{'exc.1':>8}{'exc.9':>8}{'KS_H':>7}{'KS_dom':>7}")
for m, r in sorted(out.items(), key=lambda kv: kv[1]["KS"]):
    print(f"{m[:28]:28}{r['KS']:7.4f}  [{r['KS_ci95'][0]:.4f},{r['KS_ci95'][1]:.4f}]{r['q_at_max']:6.2f}{r['mean_u']:8.4f}{r['excess_q10']:+8.4f}{r['excess_q90']:+8.4f}{r['KS_H_max']:7.4f}{r['KS_domain_max']:7.4f}")
print("KS = max |P(u<=q) - q|; excess < 0 at q=0.1 = real tokens fall outside the model's top-10% mass more often than claimed (over-confident)")
