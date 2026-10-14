#!/usr/bin/env python
"""Tail-mass calibration, OOD behaviour and exact prior mass on chat openers.
 tf_tail.npz : post-cutoff text (uncheat_small). Predicted tail mass m_k = P(token with p < 10^-k) at every position,
               realised rate r_k = share of real tokens with p < 10^-k (s > k ln 10). A density model has r_k ≈ m_k;
               r_k > m_k means the model's "impossible" set contains more real text than it admits (over-confidence in the tail).
 tf_ood.npz  : per-genre CE, gap mean(H-s), tail reliability on noise / code / PGN / DNA / shuffled / CSV.
 tf_prior.npz: log P(opener | <bos>) per template; logsumexp over the instruction set and the control set.
Usage: vh_tailmass.py [RESULTS_DIR]  -> analysis/tailmass.json"""
import os, sys, json
import numpy as np
res = sys.argv[1] if len(sys.argv) > 1 else "/models/varentropy/results"
LN10 = np.log(10.0)


def tail(z):
    s = z["s"].astype(np.float32); H = z["H"].astype(np.float32)
    out = {"n": int(len(s)), "CE": float(s.mean()), "H": float(H.mean()), "gap": float((H - s).mean())}
    for k, col in ((2, "m2"), (3, "m3"), (4, "m4")):
        m = z[col].astype(np.float32); r = (s > k * LN10).astype(np.float32)
        out[f"pred{k}"] = float(m.mean()); out[f"real{k}"] = float(r.mean())
        out[f"ratio{k}"] = float(r.mean() / max(m.mean(), 1e-9))
        # tail reliability inside bins of predicted mass: does realised rate track predicted mass?
        q = np.quantile(m, [0, .25, .5, .75, 1.0]); rows = []
        for lo, hi in zip(q[:-1], q[1:]):
            sel = (m >= lo) & (m <= hi)
            if sel.sum(): rows.append([float(m[sel].mean()), float(r[sel].mean()), int(sel.sum())])
        out[f"bins{k}"] = rows
    return out


def logsumexp(a):
    a = np.array(a, np.float64); mx = a.max(); return float(mx + np.log(np.exp(a - mx).sum()))


out = {}
for m in sorted(os.listdir(res)):
    d = os.path.join(res, m)
    if m.startswith(("smoke", "vsmoke")) or not os.path.isdir(d):
        continue
    row = {}
    p = os.path.join(d, "tf_tail.npz")
    if os.path.exists(p):
        row["tail"] = tail(np.load(p))
    p = os.path.join(d, "tf_ood.npz")
    if os.path.exists(p):
        z = np.load(p); docs = json.load(open(os.path.join(d, "tf_ood_docs.json")))
        sets = {}
        for dm in docs: sets.setdefault(dm["set"], []).append(dm["doc"])
        row["ood"] = {}
        for st, ids in sets.items():
            sel = np.isin(z["doc"], ids)
            row["ood"][st] = tail({k: z[k][sel] for k in ["s", "H", "m2", "m3", "m4"]})
        row["ood"]["ALL"] = tail(z)
    p = os.path.join(d, "tf_prior.npz")
    if os.path.exists(p):
        z = np.load(p); docs = json.load(open(os.path.join(d, "tf_prior_docs.json")))
        names = json.load(open("/models/varentropy/corpus/prior.json"))["tf"]
        logp, by_set = {}, {"instr": [], "ctrl": []}
        for dm in docs:
            nm = names[dm["idx"]]["name"]; st = names[dm["idx"]]["set"]
            lp = -float(z["s"][z["doc"] == dm["doc"]].astype(np.float32).sum())
            logp[nm] = lp; by_set[st].append(lp)
        row["prior"] = {"logp": logp, "instr_logmass": logsumexp(by_set["instr"]), "ctrl_logmass": logsumexp(by_set["ctrl"]),
                        "instr_mass": float(np.exp(logsumexp(by_set["instr"]))), "ctrl_mass": float(np.exp(logsumexp(by_set["ctrl"]))),
                        "instr_max": max(by_set["instr"]), "instr_argmax": max(logp, key=lambda k: logp[k] if names and any(n["name"] == k and n["set"] == "instr" for n in names) else -1e9)}
    if row:
        out[m] = row
os.makedirs(os.path.join(res, "analysis"), exist_ok=True)
json.dump(out, open(os.path.join(res, "analysis", "tailmass.json"), "w"), indent=1)
print(f"{'model':28}{'CE':>6}{'gap':>7} {'pred2':>6}{'real2':>6}{'pred3':>6}{'real3':>6}{'pred4':>6}{'real4':>6} | {'instr%':>8}{'ctrl%':>7}{'top instr':>18} | OOD gap: hex b64 js pgn dna shuf csv")
for m, r in out.items():
    t = r.get("tail", {}); pr = r.get("prior", {}); o = r.get("ood", {})
    tl = f"{t.get('CE', float('nan')):6.2f}{t.get('gap', float('nan')):7.3f} " + "".join(f"{t.get(f'pred{k}', float('nan')):6.3f}{t.get(f'real{k}', float('nan')):6.3f}" for k in (2, 3, 4)) if t else " " * 50
    pm = f"{100*pr['instr_mass']:8.3f}{100*pr['ctrl_mass']:7.1f}{pr['instr_argmax'][:18]:>18}" if pr else " " * 33
    og = " ".join(f"{o[s]['gap']:+.2f}" for s in ["hexdump", "base64", "minified_js", "chess_pgn", "dna_fasta", "shuffled_english", "random_csv"] if s in o)
    print(f"{m[:28]:28}{tl} | {pm} | {og}")
