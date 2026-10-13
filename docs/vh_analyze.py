#!/usr/bin/env python
"""Analysis of vh_score.py outputs: per-model summaries, paired (token-aligned) comparisons,
rollout trajectories and collapse detection. Usage:
    vh_analyze.py RESULTS_DIR --pair A B [--pair C D ...] [--out figs]
A, B are result subdirectory names; the first of a pair is the reference (e.g. the base / TrueBase).
"""
import argparse, json, os, sys
import numpy as np

MINI = 1e-6


def load_tf(d):
    z = np.load(os.path.join(d, "tf.npz"))
    r = {k: z[k] for k in z.files}
    for k in ["H", "V", "s", "p1"]:
        r[k] = r[k].astype(np.float32)
    r["docs"] = json.load(open(os.path.join(d, "tf_docs.json")))
    return r


def load_ro(d):
    p = os.path.join(d, "rollouts.npz")
    if not os.path.exists(p):
        return None
    z = np.load(p)
    return {k: (z[k].astype(np.float32) if z[k].dtype == np.float16 else z[k]) for k in z.files}


def summary(r, label):
    H, V, s, p1 = r["H"], r["V"], r["s"], r["p1"]
    out = {
        "tokens": int(len(H)),
        "CE(nats)": float(s.mean()),
        "H_mean": float(H.mean()), "H_median": float(np.median(H)),
        "V_mean": float(V.mean()), "V_median": float(np.median(V)),
        "frac_H<0.1": float((H < 0.1).mean()),
        "frac_H>3": float((H > 3).mean()),
        "frac_p1>0.99": float((p1 > 0.99).mean()),
        "frac_rank0": float((r["rank"] == 0).mean()),
        "calib_gap(H-s)": float((H - s).mean()),  # <0: model more surprised than its own entropy predicts
    }
    return out


def per_set(r):
    sets = {}
    docset = {m["doc"]: m["set"] for m in r["docs"]}
    ds = np.array([docset[int(d)] for d in r["doc"]])
    for name in sorted(set(ds)):
        m = ds == name
        sets[name] = {"n": int(m.sum()), "CE": float(r["s"][m].mean()), "H": float(r["H"][m].mean()),
                      "V": float(r["V"][m].mean()), "frac_H<0.1": float((r["H"][m] < 0.1).mean())}
    return sets


def align(a, b):
    """Token-align two tf results (same tokenizer, same corpus). Returns boolean masks into a and b."""
    ka = a["doc"].astype(np.int64) * 100000 + a["pos"]
    kb = b["doc"].astype(np.int64) * 100000 + b["pos"]
    common, ia, ib = np.intersect1d(ka, kb, return_indices=True)
    assert np.array_equal(a["tok"][ia], b["tok"][ib]), "token mismatch between models — tokenizers differ?"
    return ia, ib


def paired(a, b, la, lb):
    ia, ib = align(a, b)
    Ha, Hb = a["H"][ia], b["H"][ib]
    Va, Vb = a["V"][ia], b["V"][ib]
    sa, sb = a["s"][ia], b["s"][ib]
    res = {"n_aligned": int(len(ia)),
           "dH_mean(b-a)": float((Hb - Ha).mean()), "dV_mean(b-a)": float((Vb - Va).mean()),
           "dCE(b-a)": float((sb - sa).mean()),
           "corr_H": float(np.corrcoef(Ha, Hb)[0, 1]), "corr_V": float(np.corrcoef(Va, Vb)[0, 1])}
    # conditional table: given reference entropy bin, what happens in the other model
    bins = [0, 0.1, 0.5, 1, 2, 3, 4, 6, 20]
    tab = []
    for lo, hi in zip(bins[:-1], bins[1:]):
        m = (Ha >= lo) & (Ha < hi)
        if m.sum() < 50:
            continue
        tab.append({"H_ref_bin": f"[{lo},{hi})", "n": int(m.sum()),
                    "H_ref": float(Ha[m].mean()), "H_other": float(Hb[m].mean()),
                    "V_ref": float(Va[m].mean()), "V_other": float(Vb[m].mean()),
                    "P(other H<0.3)": float((Hb[m] < 0.3).mean()),
                    "P(other H<0.3 & its top1==actual)": float(((Hb[m] < 0.3) & (b["rank"][ib][m] == 0)).mean()),
                    "CE_ref": float(sa[m].mean()), "CE_other": float(sb[m].mean())})
    res["by_ref_H_bin"] = tab
    # "collapsed branch points": reference sees a genuine branch (H>=2), other is near-deterministic
    m = (Ha >= 2) & (Hb < 0.3)
    res["collapsed_branch_points"] = {"n": int(m.sum()), "frac_of_ref_H>=2": float(m.sum() / max((Ha >= 2).sum(), 1)),
                                      "other_top1_was_actual": float((b["rank"][ib][m] == 0).mean()) if m.sum() else None,
                                      "other_CE_there": float(sb[m].mean()) if m.sum() else None,
                                      "ref_CE_there": float(sa[m].mean()) if m.sum() else None}
    m2 = (Hb >= 2) & (Ha < 0.3)
    res["reverse_branch_points"] = {"n": int(m2.sum()), "frac_of_other_H>=2": float(m2.sum() / max((Hb >= 2).sum(), 1))}
    # varentropy-given-entropy curve: median V in H bins, both models (shape of the distribution at fixed H)
    hb = np.linspace(0, 8, 33)
    curve = []
    for lo, hi in zip(hb[:-1], hb[1:]):
        ma = (Ha >= lo) & (Ha < hi); mb = (Hb >= lo) & (Hb < hi)
        if ma.sum() > 100 and mb.sum() > 100:
            curve.append({"H": float((lo + hi) / 2), f"V_med_{la}": float(np.median(Va[ma])), f"V_med_{lb}": float(np.median(Vb[mb])),
                          f"n_{la}": int(ma.sum()), f"n_{lb}": int(mb.sum())})
    res["V_given_H"] = curve
    return res, (ia, ib)


def repetition(tokens, n=8):
    """fraction of positions t whose n-gram ending at t already occurred earlier in the same sequence."""
    B, T = tokens.shape
    out = np.zeros((B, T), dtype=bool)
    for b in range(B):
        seen = set()
        row = tokens[b]
        for t in range(n - 1, T):
            g = tuple(row[t - n + 1: t + 1].tolist())
            if g in seen:
                out[b, t] = True
            seen.add(g)
    return out


def rollout_summary(ro, label, window=64):
    res = {}
    for g in ["bos", "openers"]:
        if f"{g}_H" not in ro:
            continue
        H, V, tok = ro[f"{g}_H"], ro[f"{g}_V"], ro[f"{g}_tok"]
        B, T = H.shape
        rep = repetition(tok)
        # running mean of H over trailing window; "collapsed" once it stays < 0.2 for the rest of the sequence
        cs = np.cumsum(np.pad(H, ((0, 0), (1, 0))), axis=1)
        run = (cs[:, window:] - cs[:, :-window]) / window  # (B, T-window+1)
        low = run < 0.2
        collapsed_from = np.full(B, -1)
        for b in range(B):
            idx = np.where(low[b])[0]
            if len(idx):
                # first index after which it stays low
                last_high = np.where(~low[b])[0]
                start = (last_high[-1] + 1) if len(last_high) else 0
                if start < low.shape[1] - 1:
                    collapsed_from[b] = start + window
        q = [0, T // 4, T // 2, 3 * T // 4]
        res[g] = {"B": B, "T": T,
                  "H_by_quarter": [float(H[:, a:a + T // 4].mean()) for a in q],
                  "V_by_quarter": [float(V[:, a:a + T // 4].mean()) for a in q],
                  "rep8_by_quarter": [float(rep[:, a:a + T // 4].mean()) for a in q],
                  "frac_seqs_collapsed": float((collapsed_from >= 0).mean()),
                  "collapse_step_median": float(np.median(collapsed_from[collapsed_from >= 0])) if (collapsed_from >= 0).any() else None,
                  "frac_steps_H<0.1": float((H < 0.1).mean()),
                  "frac_steps_H<0.1_last_quarter": float((H[:, 3 * T // 4:] < 0.1).mean()),
                  "seq_meanH_min/med/max": [float(x) for x in np.percentile(H.mean(1), [0, 50, 100])]}
    return res


def wasserstein1(a, b, lo=0.0, hi=10.0, nb=200):
    ha, _ = np.histogram(np.clip(a, lo, hi), bins=nb, range=(lo, hi)); hb, _ = np.histogram(np.clip(b, lo, hi), bins=nb, range=(lo, hi))
    ca = np.cumsum(ha) / max(ha.sum(), 1); cb = np.cumsum(hb) / max(hb.sum(), 1)
    return float(np.abs(ca - cb).sum() * (hi - lo) / nb)


MARKERS = ["Assistant:", "\nHuman:", "\nUser:", "### Instruction", "### Response", "You will be given", "<|im_start|>",
           "<|start_header_id|>", "Let's think step by step", "I hope this helps", "As an AI", "Sure! Here", "Sure, here",
           "Certainly!", "Here's a", "Here is a", "step by step", "Final Answer", "\\boxed{"]


def marker_rate(texts):
    return float(np.mean([any(m in t for m in MARKERS) for t in texts])) if texts else float("nan")


def fingerprint(tf, ro, corpus=None, extra=None, rollout_texts=None, fresh=None):
    """Reference-free per-model features for 'true-baseness' scoring."""
    H, V, s, p1, pos = tf["H"], tf["V"], tf["s"], tf["p1"], tf["pos"]
    f = {}
    # tokenizer normalisation: chars per token on the shared corpus
    if corpus is not None:
        chars = sum(len(corpus["tf"][m["doc"]]["text"]) if m["ntok"] < 2048 else None or 0 for m in tf["docs"])
        full = [m for m in tf["docs"] if m["ntok"] < 2048]
        chars = sum(len(corpus["tf"][m["doc"]]["text"]) for m in full); toks = sum(m["ntok"] for m in full)
        f["chars_per_tok"] = chars / max(toks, 1)
    else:
        f["chars_per_tok"] = float("nan")
    cpt = f["chars_per_tok"]
    f["CE_tok"] = float(s.mean()); f["CE_char"] = float(s.mean() / cpt)
    f["H_tok"] = float(H.mean()); f["H_char"] = float(H.mean() / cpt)
    f["calib_gap"] = float((H - s).mean()); f["H_over_s"] = float(H.mean() / s.mean())
    f["frac_H<0.1"] = float((H < 0.1).mean()); f["frac_p1>0.99"] = float((p1 > 0.99).mean())
    f["frac_H>3"] = float((H > 3).mean())
    for lo, hi in [(1, 2), (2, 3), (3, 4)]:
        m = (H >= lo) & (H < hi)
        f[f"Vmed|H{lo}-{hi}"] = float(np.median(V[m])) if m.sum() > 100 else float("nan")
    m = H > 1
    f["V/H|H>1"] = float((V[m] / H[m]).mean())
    f["H_pos<64"] = float(H[pos < 64].mean()); f["H_pos>512"] = float(H[pos > 512].mean())
    f["H_ctx_drop"] = f["H_pos<64"] - f["H_pos>512"]

    # domain structure + memorization (reference-free)
    if tf.get("docs"):
        docset = {m["doc"]: m["set"] for m in tf["docs"]}
        ds = np.array([docset[int(d)] for d in tf["doc"]])
        def ce(setname):
            m = ds == setname
            return float(s[m].mean()) if m.sum() > 500 else float("nan")
        web = np.nanmean([ce("Pile-CC"), ce("OpenWebText2")])
        f["CE_web"] = float(web); f["CE_wiki/web"] = ce("Wikipedia (en)") / web; f["CE_github/web"] = ce("Github") / web
        f["CE_stackex/web"] = ce("StackExchange") / web; f["CE_pubmed/web"] = ce("PubMed Abstracts") / web
        gaps = []
        for name in set(ds):
            m = ds == name
            if m.sum() > 2000:
                gaps.append(float((H[m] - s[m]).mean()))
        f["calib_gap_domain_min"] = float(min(gaps)); f["calib_gap_domain_absmean"] = float(np.mean(np.abs(gaps)))
        try:
            import vh_memo
            rm = vh_memo.runs_mask(H, tf["rank"], tf["doc"])
            f["verbatim_run_frac"] = float(rm.mean()); f["verbatim_run_frac_wiki"] = float(rm[ds == "Wikipedia (en)"].mean())
            f["verbatim_run_frac_nocode"] = float(rm[ds != "Github"].mean())
            docs, dce, dH, dn = vh_memo.per_doc(tf)
            med = np.median(dce)
            f["doc_CE_p5/med"] = float(np.percentile(dce, 5) / med); f["frac_docs_CE<0.33med"] = float((dce < med / 3).mean())
        except Exception as e:
            print("memo features failed:", e)
    # tail of the surprisal distribution: how often the model is very surprised by real text
    f["frac_s>8"] = float((s > 8).mean())
    if ro is not None and "bos_H" in ro:
        Hb, Vb, tb = ro["bos_H"], ro["bos_V"], ro["bos_tok"]
        T = Hb.shape[1]
        f["roll_H_bos"] = float(Hb.mean()); f["roll_V_bos"] = float(Vb.mean())
        f["roll/TF_H"] = float(Hb.mean() / H.mean())
        f["roll_H_q1"] = float(Hb[:, : T // 4].mean()); f["roll_H_q4"] = float(Hb[:, 3 * T // 4:].mean())
        f["roll_H_slope"] = f["roll_H_q4"] - f["roll_H_q1"]
        f["roll_frac_H<0.1"] = float((Hb < 0.1).mean())
        f["roll_rep8_q4"] = float(repetition(tb)[:, 3 * T // 4:].mean())
        f["roll_seqH_std"] = float(Hb.mean(1).std())
        f["W1(TF_H, roll_H)"] = wasserstein1(H, Hb.ravel())
        f["W1(TF_V, roll_V)"] = wasserstein1(V, Vb.ravel())
        if "openers_H" in ro:
            Ho = ro["openers_H"]; f["roll_H_open"] = float(Ho.mean()); f["W1(TF_H, open_H)"] = wasserstein1(H, Ho.ravel())
    if rollout_texts:
        f["roll_instr_marker_rate"] = marker_rate(rollout_texts.get("bos", []))
        f["roll_instr_marker_rate_open"] = marker_rate(rollout_texts.get("openers", []))
    if extra is not None:
        import vh_memo
        rm = vh_memo.runs_mask(extra["H"], extra["rank"], extra["doc"])
        eset = {m["doc"]: m["set"] for m in extra["docs"]}
        eds = np.array([eset[int(d)] for d in extra["doc"]])
        for nm, key in [("wiki", "Wikipedia (en)"), ("gh", "Github")]:
            m = eds == key
            if m.sum() > 1000:
                f[f"X_CE_{nm}"] = float(extra["s"][m].mean()); f[f"X_gap_{nm}"] = float((extra["H"][m] - extra["s"][m]).mean())
                f[f"X_runfrac_{nm}"] = float(rm[m].mean())
                docs, dce, dH, dn = vh_memo.per_doc({k: extra[k][m] for k in ["s", "H", "doc"]})
                f[f"X_docCE_p10/med_{nm}"] = float(np.percentile(dce, 10) / np.median(dce))
                f[f"X_frac_docs_CE<0.33med_{nm}"] = float((dce < np.median(dce) / 3).mean())
        f["X_CE_wiki/web"] = f.get("X_CE_wiki", float("nan")) / f["CE_web"]
    if fresh is not None:
        import vh_memo
        Hf, sf = fresh["H"], fresh["s"]
        f["F_CE"] = float(sf.mean()); f["F_H"] = float(Hf.mean()); f["F_calib_gap"] = float((Hf - sf).mean())
        f["F_H_over_s"] = float(Hf.mean() / sf.mean())
        fset = {m["doc"]: m["set"] for m in fresh["docs"]}
        fds = np.array([fset[int(d)] for d in fresh["doc"]])
        gaps = {}
        for name in sorted(set(fds)):
            m = fds == name
            if m.sum() > 2000:
                gaps[name] = float((Hf[m] - sf[m]).mean()); f[f"F_CE_{name}"] = float(sf[m].mean()); f[f"F_gap_{name}"] = gaps[name]; f[f"F_n_{name}"] = int(m.sum())
        f["F_gap_domain_min"] = float(min(gaps.values())); f["F_gap_domain_max"] = float(max(gaps.values())); f["F_gap_domain_absmean"] = float(np.mean(np.abs(list(gaps.values()))))
        f["F_n_positions"] = int(len(Hf))
        rm = vh_memo.runs_mask(Hf, fresh["rank"], fresh["doc"])
        f["F_verbatim_run_frac"] = float(rm.mean())
        f["F_frac_H<0.1"] = float((Hf < 0.1).mean())
        m = Hf > 1; f["F_V/H|H>1"] = float((fresh["V"][m] / Hf[m]).mean())
    return f


def load_rollout_texts(d):
    p = os.path.join(d, "rollouts.jsonl")
    if not os.path.exists(p):
        return None
    out = {}
    for line in open(p):
        r = json.loads(line); out.setdefault(r["group"], []).append(r["text"])
    return out


def fingerprint_table(results_dir, names, corpus_path=None, out=None):
    corpus = json.load(open(corpus_path)) if corpus_path and os.path.exists(corpus_path) else None
    rows = {}
    for n in names:
        d = os.path.join(results_dir, n)
        if not os.path.exists(os.path.join(d, "tf.npz")):
            continue
        extra = None
        if os.path.exists(os.path.join(d, "tf_wiki.npz")):
            z = np.load(os.path.join(d, "tf_wiki.npz")); extra = {k: z[k] for k in z.files}
            for k in ["H", "V", "s", "p1"]:
                extra[k] = extra[k].astype(np.float32)
            extra["docs"] = json.load(open(os.path.join(d, "tf_wiki_docs.json")))
        fresh = None
        if os.path.exists(os.path.join(d, "tf_fresh.npz")):
            z = np.load(os.path.join(d, "tf_fresh.npz")); fresh = {k: z[k] for k in z.files}
            for k in ["H", "V", "s", "p1"]:
                fresh[k] = fresh[k].astype(np.float32)
            fresh["docs"] = json.load(open(os.path.join(d, "tf_fresh_docs.json")))
        rows[n] = fingerprint(load_tf(d), load_ro(d), corpus, extra, load_rollout_texts(d), fresh)
    keys = sorted({k for r in rows.values() for k in r})
    w = max(len(n) for n in rows) + 1
    print("feature".ljust(22) + "".join(n[-18:].rjust(19) for n in rows))
    for k in keys:
        print(k.ljust(22) + "".join(f"{rows[n].get(k, float('nan')):19.3f}" for n in rows))
    if out:
        with open(out, "w") as fh:
            json.dump(rows, fh, indent=1)
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("results")
    ap.add_argument("--pair", nargs="+", action="append", default=[], help="A B [C ...]: A is the reference")
    ap.add_argument("--out", default=None)
    ap.add_argument("--all", action="store_true", help="fingerprint every result dir")
    ap.add_argument("--corpus", default="/models/varentropy/corpus/pile10k_sel.json")
    args = ap.parse_args()
    out = args.out or os.path.join(args.results, "analysis")
    os.makedirs(out, exist_ok=True)
    cache = {}

    def get(n):
        if n not in cache:
            d = os.path.join(args.results, n)
            cache[n] = (load_tf(d), load_ro(d))
        return cache[n]

    report = {"models": {}, "pairs": []}
    names = sorted({n for p in args.pair for n in p})
    if args.all:
        allnames = sorted(d for d in os.listdir(args.results) if os.path.exists(os.path.join(args.results, d, "tf.npz")))
        fingerprint_table(args.results, allnames, args.corpus, os.path.join(out, "fingerprints.json"))
    for n in names:
        tf, ro = get(n)
        report["models"][n] = {"summary": summary(tf, n), "per_set": per_set(tf),
                               "rollouts": rollout_summary(ro, n) if ro else None}
        print(f"== {n}: {json.dumps(report['models'][n]['summary'])}")
        if ro:
            print("   rollouts:", json.dumps(report["models"][n]["rollouts"]))
    for p in args.pair:
        ref = p[0]
        for other in p[1:]:
            a, _ = get(ref); b, _ = get(other)
            res, _ = paired(a, b, ref, other)
            res["ref"], res["other"] = ref, other
            report["pairs"].append(res)
            print(f"== pair {ref} -> {other}: n={res['n_aligned']} dH={res['dH_mean(b-a)']:+.3f} dV={res['dV_mean(b-a)']:+.3f} "
                  f"dCE={res['dCE(b-a)']:+.3f} corrH={res['corr_H']:.3f} collapsed_branch_points={res['collapsed_branch_points']}")
            for row in res["by_ref_H_bin"]:
                print("   ", json.dumps(row))
    with open(os.path.join(out, "report.json"), "w") as f:
        json.dump(report, f, indent=1)
    print("wrote", os.path.join(out, "report.json"))


if __name__ == "__main__":
    main()
