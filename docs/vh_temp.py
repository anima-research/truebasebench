#!/usr/bin/env python
"""Temperature-scaling cost from the tf_temp pass: CE(T) at T in TEMPS (surprisal columns sT08, sT09, s, sT11, sT125),
a quadratic fit in log T through the five points, C = CE(1) - min_T CE(T) (nats/token), T* = argmin, document-level
bootstrap CI for C, and the per-domain T* / C (spread of miscalibration that a single global T cannot fix).
Usage: vh_temp.py [RESULTS_DIR] [--B 1000] -> analysis/temp.json"""
import os, sys, json
import numpy as np
res = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith("--") else "/models/varentropy/results"
B = int(sys.argv[sys.argv.index("--B") + 1]) if "--B" in sys.argv else 1000
TEMPS = np.array([0.8, 0.9, 1.0, 1.1, 1.25]); COLS = ["sT08", "sT09", "s", "sT11", "sT125"]
X = np.log(TEMPS); rng = np.random.default_rng(0)


def fit(ce):
    """ce: (5,) mean CE at TEMPS -> (C, T*, CE_min, curvature). CE(T) is far from quadratic over the whole grid, so the
    parabola goes through the three grid points around the measured minimum (local in log T); its minimum is clipped
    to the grid. At an edge the three edge points are used and the caller flags T* as at the bound."""
    i = int(np.argmin(ce)); j = min(max(i, 1), len(ce) - 2)
    xs3, ys3 = X[j - 1:j + 2], ce[j - 1:j + 2]
    a, b, c = np.polyfit(xs3, ys3, 2)
    if a <= 0:
        return float(ce[2] - ce[i]), float(TEMPS[i]), float(ce[i]), float(a)
    xs = float(np.clip(-b / (2 * a), X[0], X[-1])); cem = float(a * xs * xs + b * xs + c)
    return float(ce[2] - min(cem, ce.min())), float(np.exp(xs)), float(min(cem, ce.min())), float(a)


out = {}
for m in sorted(os.listdir(res)):
    p = os.path.join(res, m, "tf_temp.npz")
    if m.startswith(("smoke", "vsmoke")) or not os.path.exists(p):
        continue
    z = np.load(p); docs = json.load(open(os.path.join(res, m, "tf_temp_docs.json")))
    S = np.stack([z[c].astype(np.float64) for c in COLS], 1)  # (N, 5)
    gap_pass = float((z["H"].astype(np.float64) - z["s"].astype(np.float64)).mean())  # = dCE/dlogT at T=1 exactly (H - s = z_y - E_p[z])
    doc = z["doc"]; ids, inv = np.unique(doc, return_inverse=True)
    n = np.bincount(inv).astype(np.float64); sums = np.stack([np.bincount(inv, weights=S[:, j]) for j in range(5)], 1)  # (D, 5)
    ce = sums.sum(0) / n.sum(); C, Ts, cem, curv = fit(ce)
    pick = rng.integers(0, len(ids), (B, len(ids))); vals = []
    for bi in range(B):
        pk = pick[bi]; vals.append(fit(sums[pk].sum(0) / n[pk].sum())[0])
    dom_of = {d["doc"]: d["set"] for d in docs}; dom = np.array([dom_of[i] for i in ids]); per = {}
    for dd in sorted(set(dom)):
        sel = dom == dd; cd = sums[sel].sum(0) / n[sel].sum(); Cd, Td, _, _ = fit(cd)
        per[dd] = {"C": Cd, "T_star": Td, "n_tokens": int(n[sel].sum())}
    at_bound = bool(Ts >= TEMPS[-1] - 1e-6 or Ts <= TEMPS[0] + 1e-6)  # minimum at the edge of the grid: C is a lower bound
    out[m] = {"CE_T": dict(zip([str(t) for t in TEMPS], ce.tolist())), "C": C, "T_star": Ts, "CE_min": cem, "curvature": curv, "T_star_at_bound": at_bound,
              "gap_pass": gap_pass,  # mean(H - s) on this pass: the exact derivative dCE/dlogT at T = 1
              "slope_central": float((ce[3] - ce[1]) / (X[3] - X[1])),  # measured central difference over 0.9..1.1 (O(h^2) check of the identity)
              "C_ci95": [float(np.percentile(vals, 2.5)), float(np.percentile(vals, 97.5))], "n_docs": int(len(ids)), "n_tokens": int(n.sum()),
              "domains": per, "C_domain_mean": float(np.mean([v["C"] for v in per.values()])), "T_star_domain_range": [float(min(v["T_star"] for v in per.values())), float(max(v["T_star"] for v in per.values()))]}
os.makedirs(os.path.join(res, "analysis"), exist_ok=True)
json.dump(out, open(os.path.join(res, "analysis", "temp.json"), "w"), indent=1)
print(f"{'model':28}{'CE(1)':>7}{'CE*':>7}{'C':>8}{'ci':>18}{'T*':>6}{'dom T* range':>14}{'C_dom':>7}{'gap':>8}{'slope':>8}")
for m, r in sorted(out.items(), key=lambda kv: kv[1]["C"]):
    print(f"{m[:28]:28}{r['CE_T']['1.0']:7.4f}{r['CE_min']:7.4f}{r['C']:8.4f}  [{r['C_ci95'][0]:.4f},{r['C_ci95'][1]:.4f}]{r['T_star']:6.2f}{'*' if r['T_star_at_bound'] else ' '}  {r['T_star_domain_range'][0]:.2f}-{r['T_star_domain_range'][1]:.2f}{r['C_domain_mean']:7.4f}{r['gap_pass']:+8.4f}{r['slope_central']:+8.4f}")
print("* = minimum at the edge of the temperature grid (C is a lower bound)")
