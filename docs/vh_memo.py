#!/usr/bin/env python
"""Memorization / verbatim-run analysis on teacher-forced results.
Usage: vh_memo.py RESULTS_DIR MODEL [MODEL ...]   (first model = reference if >1)
Reference-free per-model features: per-doc CE distribution (memorized tail), fraction of tokens inside
long verbatim runs (consecutive tokens with rank==0 and H<0.2), per Pile set. With a reference model,
also the per-doc CE ratio and where the runs appear that the reference does not have."""
import sys, os, json
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vh_analyze as A


def runs_mask(H, rank, doc, minlen=16, hthr=0.2):
    """boolean mask of tokens inside a verbatim run (>= minlen consecutive confident-correct tokens within one doc)."""
    ok = (rank == 0) & (H < hthr)
    out = np.zeros_like(ok)
    n = len(ok)
    i = 0
    while i < n:
        if ok[i]:
            j = i
            while j + 1 < n and ok[j + 1] and doc[j + 1] == doc[i]:
                j += 1
            if j - i + 1 >= minlen:
                out[i:j + 1] = True
            i = j + 1
        else:
            i += 1
    return out


def per_doc(tf):
    docs = np.unique(tf["doc"])
    ce = np.array([tf["s"][tf["doc"] == d].mean() for d in docs])
    H = np.array([tf["H"][tf["doc"] == d].mean() for d in docs])
    n = np.array([(tf["doc"] == d).sum() for d in docs])
    return docs, ce, H, n


def main():
    res, names = sys.argv[1], sys.argv[2:]
    tfs = {n: A.load_tf(os.path.join(res, n)) for n in names}
    docset = {m["doc"]: m["set"] for m in tfs[names[0]]["docs"]}
    print("=== per-model reference-free memorization features")
    feats = {}
    for n, tf in tfs.items():
        docs, ce, H, cnt = per_doc(tf)
        med = np.median(ce)
        rm = runs_mask(tf["H"], tf["rank"], tf["doc"])
        f = {"doc_CE_median": float(med), "doc_CE_p10": float(np.percentile(ce, 10)), "doc_CE_p5": float(np.percentile(ce, 5)),
             "frac_docs_CE<0.33med": float((ce < med / 3).mean()), "frac_docs_CE<0.5med": float((ce < med / 2).mean()),
             "doc_CE_skew": float(((ce - ce.mean()) ** 3).mean() / ce.std() ** 3),
             "verbatim_run_frac": float(rm.mean()),
             "verbatim_run_frac_wiki": float(rm[np.array([docset[int(d)] == "Wikipedia (en)" for d in tf["doc"]])].mean()),
             "verbatim_run_frac_nocode": float(rm[np.array([docset[int(d)] not in ("Github",) for d in tf["doc"]])].mean())}
        feats[n] = f
        print(n, json.dumps({k: round(v, 4) for k, v in f.items()}))
        tf["_rm"] = rm; tf["_doc"] = (docs, ce, H, cnt)
    # per-set table
    print("\n=== per Pile set: CE / H / gap(H-CE) / verbatim-run frac, per model")
    sets = sorted(set(docset.values()), key=lambda s: -sum(1 for d in docset if docset[d] == s))
    hdr = f"{'set':22}" + "".join(f"{n[-14:]:>15}{'':>15}{'':>15}{'':>15}" for n in names)
    print(f"{'':22}" + "".join(f"{'CE':>15}{'H':>15}{'gap':>15}{'runfrac':>15}" for n in names))
    for s in sets:
        line = f"{s:22}"
        for n in names:
            tf = tfs[n]
            m = np.array([docset[int(d)] == s for d in tf["doc"]])
            if m.sum() == 0:
                line += " " * 60; continue
            line += f"{tf['s'][m].mean():15.3f}{tf['H'][m].mean():15.3f}{(tf['H'][m]-tf['s'][m]).mean():+15.3f}{tf['_rm'][m].mean():15.3f}"
        print(line + f"   n={m.sum()}")
    if len(names) > 1:
        ref = tfs[names[0]]
        d0, ce0, H0, n0 = ref["_doc"]
        for n in names[1:]:
            tf = tfs[n]
            d1, ce1, H1, n1 = tf["_doc"]
            assert np.array_equal(d0, d1)
            ratio = ce1 / np.maximum(ce0, 1e-3)
            order = np.argsort(ratio)
            print(f"\n=== docs where {n} CE collapsed relative to {names[0]} (CE ratio), top 15")
            for i in order[:15]:
                print(f"doc{int(d0[i]):4d} [{docset[int(d0[i])]:>18}] n={int(n0[i]):5d} CE_ref={ce0[i]:.3f} CE={ce1[i]:.3f} ratio={ratio[i]:.2f} H_ref={H0[i]:.2f} H={H1[i]:.2f}")
            print(f"docs with ratio<0.5: {(ratio<0.5).sum()}  <0.7: {(ratio<0.7).sum()}  of {len(ratio)}; median ratio {np.median(ratio):.3f}")
            # verbatim runs present in `n` but not in ref, by set
            ia, ib = A.align(ref, tf)
            new = tf["_rm"][ib] & ~ref["_rm"][ia]
            from collections import Counter
            c = Counter(docset[int(d)] for d in tf["doc"][ib][new])
            print(f"tokens in verbatim runs new in {n}: {int(new.sum())} ({new.mean()*100:.2f}% of aligned); by set: {c.most_common(8)}")
    json.dump(feats, open(os.path.join(res, "analysis", f"memo_{'_'.join(x[-12:] for x in names)}.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
