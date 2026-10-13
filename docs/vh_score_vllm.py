#!/usr/bin/env python
"""vLLM-backed twin of vh_score.py (same corpora, same output files) for checkpoints HF transformers
cannot load (FP8 custom-code MoE such as MiMo-V2.5). Exact per-step statistics come from the
VHRecorder logits processor (vh_lp.py); teacher forcing is done by replaying each document token by
token with the realised token forced through the logits mask."""
import argparse, json, os, sys, time, glob, shutil
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import vh_score as base  # corpus helpers + log


def collect(tmp, prefix):
    out = {}
    for f in glob.glob(os.path.join(tmp, f"{prefix}*.npz")):
        out[os.path.basename(f)[:-4]] = dict(np.load(f))
    return out


def run_tf(llm, tok, docs, max_len, tag, tmp, sp_kwargs):
    from vllm import SamplingParams
    prompts, params, meta, forces = [], [], [], {}
    for di, d in enumerate(docs):
        ids = tok(d["text"], add_special_tokens=True, truncation=True, max_length=max_len)["input_ids"]
        if len(ids) < 8:
            continue
        prompts.append({"prompt_token_ids": ids[:1]})
        params.append(SamplingParams(max_tokens=len(ids) - 1, temperature=1.0, top_p=1.0, ignore_eos=True,
                                     extra_args={"vh_id": f"{tag}_{di:04d}", "vh_out": tmp, "force": ids[1:]}, **sp_kwargs))
        meta.append({"doc": di, "idx": d["idx"], "set": d["set"], "ntok": len(ids)}); forces[di] = ids[1:]
    t0 = time.time()
    outs = llm.generate(prompts, params, use_tqdm=False)
    base.log(f"{tag}: {len(prompts)} docs replayed in {time.time()-t0:.0f}s")
    rec = collect(tmp, tag + "_")
    cols = {k: [] for k in ["H", "V", "s", "p1", "top1", "rank", "tok", "doc", "pos"]}
    mism = 0
    for m, o in zip(meta, outs):
        r = rec.get(f"{tag}_{m['doc']:04d}")
        if r is None:
            continue
        n = len(r["H"])
        gen = list(o.outputs[0].token_ids)
        k = min(n, len(gen), len(r["tok"]))
        if gen[:k] != list(r["tok"][:k]):
            mism += 1
        for k in ["H", "V", "s", "p1", "top1", "rank"]:
            cols[k].append(r[k][:n])
        cols["tok"].append(np.array(forces[m["doc"]][:n], np.int32))  # the forced targets (vLLM's output list can differ at the final step)
        cols["doc"].append(np.full(n, m["doc"], np.int32)); cols["pos"].append(np.arange(n, dtype=np.int32))
    if mism:
        base.log(f"WARNING: {mism} docs where forced tokens != generated tokens")
    arrs = {k: np.concatenate(v) for k, v in cols.items()}
    arrs["H"], arrs["V"], arrs["s"], arrs["p1"] = (arrs[k].astype(np.float16) for k in ["H", "V", "s", "p1"])
    return arrs, meta


def names_probe_vllm(llm, tok, out_dir, names_path, args, tmp):
    """Surname/first-name distribution probe through vLLM: exact log P(name|frame) by forced decode of the
    name tokens (Title + UPPER spellings, logsumexp), sampled lists via free generation. Same names.json format."""
    from vllm import SamplingParams
    data = json.load(open(names_path))
    res = {"surnames": {}, "firstnames": {}}
    for key, prompts, ref in [("surnames", base.SURNAME_PROMPTS, data["surnames"]), ("firstnames", base.FIRSTNAME_PROMPTS, data.get("firstnames", []))]:
        if not ref:
            continue
        top = ref[: args.names_topk]; cands = [n for n, _ in top]; counts = [c for _, c in top]
        ref_by_name = {n: c for n, c in ref}; ref_total = sum(c for _, c in ref)
        for pname, prompt in prompts.items():
            t0 = time.time()
            pid = tok(prompt, add_special_tokens=True)["input_ids"]
            reqs, params = [], []
            for ci, c in enumerate(cands):
                for vi, spell in enumerate([" " + c, " " + c.upper()]):
                    f = tok(spell, add_special_tokens=False)["input_ids"]
                    reqs.append({"prompt_token_ids": pid})
                    params.append(SamplingParams(max_tokens=len(f), temperature=1.0, top_p=1.0, ignore_eos=True,
                                                 extra_args={"vh_id": f"nm_{key}_{pname}_{ci:04d}_{vi}", "vh_out": tmp, "force": f}))
            llm.generate(reqs, params, use_tqdm=False)
            rec = collect(tmp, f"nm_{key}_{pname}_")
            lp = np.full((len(cands), 2), -np.inf)
            for ci in range(len(cands)):
                for vi in range(2):
                    r = rec.get(f"nm_{key}_{pname}_{ci:04d}_{vi}")
                    if r is not None and len(r["s"]):
                        lp[ci, vi] = -float(r["s"].sum())
            lp = np.logaddexp(lp[:, 0], lp[:, 1])
            m = base.dist_metrics(lp, counts); m["top5_model"] = [(cands[i], p) for i, p in m["top5_model"]]
            m["logp_top50"] = {cands[i]: round(float(lp[i]), 3) for i in np.argsort(-lp)[:50]}
            sm = {"n": 0}
            if args.names_lists > 0:
                B = args.names_lists
                sp = [SamplingParams(max_tokens=args.names_steps, temperature=1.0, top_p=1.0, ignore_eos=True, seed=args.seed + 7 + i,
                                     extra_args={"vh_id": f"nl_{key}_{pname}_{i:03d}", "vh_out": tmp, "force": None}) for i in range(B)]
                outs = llm.generate([{"prompt_token_ids": pid}] * B, sp, use_tqdm=False)
                texts = [o.outputs[0].text for o in outs]
                gen, pld = [], []
                for t in texts:
                    ns = base.parse_list("1." + t); gen += ns; pld.append(len(set(ns)) / max(len(ns), 1))
                sm = base.sample_metrics(gen, ref_by_name, ref_total)
                sm["within_list_distinct_frac"] = float(np.mean(pld)); sm["sample_text"] = texts[0][:600]
                recl = collect(tmp, f"nl_{key}_{pname}_")
                Hs = [r["H"] for r in recl.values() if len(r["H"])]
                sm["mean_step_H"] = float(np.concatenate(Hs).mean()) if Hs else None
            res[key][pname] = {"exact": m, "sampled": sm, "secs": time.time() - t0}
            base.log(f"names[{key}/{pname}] KL(ref||m)={m['KL(ref||model)']:.3f} H_m={m['H_model']:.2f} H_ref={m['H_ref']:.2f} top10_m={m['top10_model']:.3f} mass_in_set={m['mass_in_set']:.3f} | sampled n={sm.get('n')} distinct={sm.get('distinct_frac')} junk={sm.get('junk_frac')} surprise={sm.get('mean_ref_surprise_nats')}")
    json.dump(res, open(os.path.join(out_dir, "names.json"), "w"), indent=1)
    base.log("names probe done")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True); ap.add_argument("--name", default=None)
    ap.add_argument("--out", default="/models/varentropy/results")
    ap.add_argument("--corpus", default="/models/varentropy/corpus/pile10k_sel.json")
    ap.add_argument("--n-tf", type=int, default=400); ap.add_argument("--max-len", type=int, default=2048)
    ap.add_argument("--n-bos", type=int, default=32); ap.add_argument("--n-openers", type=int, default=32)
    ap.add_argument("--opener-len", type=int, default=32); ap.add_argument("--rollout-steps", type=int, default=1536)
    ap.add_argument("--seed", type=int, default=1234)
    ap.add_argument("--extra-corpus", action="append", default=[])
    ap.add_argument("--tp", type=int, default=8); ap.add_argument("--max-model-len", type=int, default=4096)
    ap.add_argument("--gpu-mem", type=float, default=0.90); ap.add_argument("--max-num-seqs", type=int, default=64)
    ap.add_argument("--skip-tf", action="store_true"); ap.add_argument("--skip-rollouts", action="store_true")
    ap.add_argument("--trust-remote-code", action="store_true")
    ap.add_argument("--enforce-eager", action="store_true")
    ap.add_argument("--prepend-bos", action="store_true", help="prepend bos_token_id when the tokenizer does not (DeepSeek V4)")
    ap.add_argument("--names-probe", default=None); ap.add_argument("--names-topk", type=int, default=2000)
    ap.add_argument("--names-lists", type=int, default=16); ap.add_argument("--names-steps", type=int, default=400)
    ap.add_argument("--max-num-batched-tokens", type=int, default=None)
    args = ap.parse_args()

    from vllm import LLM, SamplingParams
    from transformers import AutoTokenizer
    name = args.name or os.path.basename(args.model.rstrip("/"))
    out_dir = os.path.join(args.out, name); os.makedirs(out_dir, exist_ok=True)
    tmp = os.path.join(out_dir, "_vllm_tmp"); shutil.rmtree(tmp, ignore_errors=True); os.makedirs(tmp)
    corpus = base.load_corpus(args.corpus)
    tok = AutoTokenizer.from_pretrained(args.model, trust_remote_code=args.trust_remote_code)
    if args.prepend_bos:
        _orig_call = tok.__call__
        _bos = tok.bos_token_id
        class _Wrap:
            def __init__(self, t): self._t = t
            def __getattr__(self, k): return getattr(self._t, k)
            def __call__(self, text, add_special_tokens=True, **kw):
                out = _orig_call(text, add_special_tokens=add_special_tokens, **kw)
                if add_special_tokens and _bos is not None and (not out["input_ids"] or out["input_ids"][0] != _bos):
                    out["input_ids"] = [_bos] + out["input_ids"][: (kw.get("max_length") or 10**9) - 1]
                return out
        tok = _Wrap(tok)
        base.log(f"prepend_bos active (bos={_bos})")
    t0 = time.time()
    llm = LLM(model=args.model, tensor_parallel_size=args.tp, max_model_len=args.max_model_len, gpu_memory_utilization=args.gpu_mem,
              max_num_seqs=args.max_num_seqs, logits_processors=["vh_lp:VHRecorder"], trust_remote_code=args.trust_remote_code,
              seed=args.seed, enable_prefix_caching=False, enforce_eager=args.enforce_eager,
              **({"max_num_batched_tokens": args.max_num_batched_tokens} if args.max_num_batched_tokens else {}))
    base.log(f"vLLM engine up in {time.time()-t0:.0f}s")
    json.dump({"args": vars(args), "backend": "vllm", "vocab": tok.vocab_size, "bos": tok.bos_token_id, "eos": tok.eos_token_id,
               "load_s": time.time() - t0}, open(os.path.join(out_dir, "run.json"), "w"), indent=1)
    sp = {}
    if not args.skip_tf:
        arrs, meta = run_tf(llm, tok, corpus["tf"][: args.n_tf], args.max_len, "tf", tmp, sp)
        np.savez_compressed(os.path.join(out_dir, "tf.npz"), **arrs)
        json.dump(meta, open(os.path.join(out_dir, "tf_docs.json"), "w"))
        base.log(f"tf done: {len(arrs['H'])} tokens; mean CE {arrs['s'].astype(np.float32).mean():.3f} H {arrs['H'].astype(np.float32).mean():.3f}")
    if not args.skip_rollouts:
        start_id = tok.bos_token_id if tok.bos_token_id is not None else tok.eos_token_id
        groups = {"bos": [[start_id]] * args.n_bos}
        ops = []
        for d in corpus["openers"][: args.n_openers]:
            ids = tok(d["text"], add_special_tokens=True, truncation=True, max_length=args.opener_len)["input_ids"]
            if len(ids) == args.opener_len:
                ops.append(ids)
        groups["openers"] = ops
        res = {}
        for g, prompts in groups.items():
            params = [SamplingParams(max_tokens=args.rollout_steps, temperature=1.0, top_p=1.0, ignore_eos=True, seed=args.seed + i,
                                     extra_args={"vh_id": f"ro_{g}_{i:03d}", "vh_out": tmp, "force": None}) for i in range(len(prompts))]
            t0 = time.time()
            outs = llm.generate([{"prompt_token_ids": p} for p in prompts], params, use_tqdm=False)
            base.log(f"rollouts[{g}]: {len(prompts)} x {args.rollout_steps} in {time.time()-t0:.0f}s")
            rec = collect(tmp, f"ro_{g}_")
            B, T = len(prompts), args.rollout_steps
            for k in ["H", "V", "s", "p1"]:
                res[f"{g}_{k}"] = np.zeros((B, T), np.float16)
            for k in ["top1", "tok"]:
                res[f"{g}_{k}"] = np.zeros((B, T), np.int32)
            for i, o in enumerate(outs):
                r = rec.get(f"ro_{g}_{i:03d}")
                gen = np.array(o.outputs[0].token_ids[:T], np.int32)
                res[f"{g}_tok"][i, :len(gen)] = gen
                if r is None:
                    continue
                n = min(T, len(r["H"]))
                for k in ["H", "V", "p1"]:
                    res[f"{g}_{k}"][i, :n] = r[k][:n]
                res[f"{g}_top1"][i, :n] = r["top1"][:n]
                ns = min(T, len(r["s"])); res[f"{g}_s"][i, :ns] = r["s"][:ns]
            res[f"{g}_prompt"] = np.array(prompts, np.int32)
        res["start_id"] = np.array(start_id)
        np.savez_compressed(os.path.join(out_dir, "rollouts.npz"), **res)
        with open(os.path.join(out_dir, "rollouts.jsonl"), "w") as f:
            for g in groups:
                for i in range(res[f"{g}_tok"].shape[0]):
                    f.write(json.dumps({"group": g, "i": i, "prompt": tok.decode(res[f"{g}_prompt"][i].tolist()),
                                        "text": tok.decode(res[f"{g}_tok"][i].tolist()),
                                        "meanH": float(res[f"{g}_H"][i].astype(np.float32).mean()),
                                        "meanV": float(res[f"{g}_V"][i].astype(np.float32).mean())}) + "\n")
        base.log("rollouts done")
    for spec in args.extra_corpus:
        nm, path = spec.split("=", 1) if "=" in spec else ("tf_wiki", spec)
        if os.path.exists(os.path.join(out_dir, f"{nm}.npz")):
            continue
        extra = base.load_corpus(path)
        arrs, meta = run_tf(llm, tok, extra["tf"], args.max_len, nm, tmp, sp)
        np.savez_compressed(os.path.join(out_dir, f"{nm}.npz"), **arrs)
        json.dump(meta, open(os.path.join(out_dir, f"{nm}_docs.json"), "w"))
        base.log(f"{nm} done: {len(arrs['H'])} tokens")
    if args.names_probe:
        names_probe_vllm(llm, tok, out_dir, args.names_probe, args, tmp)
    shutil.rmtree(tmp, ignore_errors=True)
    base.log("ALL DONE")


if __name__ == "__main__":
    main()
