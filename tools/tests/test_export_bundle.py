"""Round-trip test: split data/bench_v1.json back into the analysis files the measurement scripts write,
run tools/export_bundle.py on them, and check the result reproduces the bundle.

Run: python -m unittest discover -s tools/tests -v
"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stderr, redirect_stdout
import io

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(REPO, "tools"))

import export_bundle as eb  # noqa: E402

V1 = os.path.join(REPO, "data", "bench_v1.json")


def write_analysis(bundle, adir, drop=()):
    ms = bundle["models"]
    files = {
        "fingerprints.json": {m["id"]: m["fingerprint"] for m in ms},
        "truebase_scores.json": {m["id"]: dict(m["subscores"], overall=m["score"],
                                               n_avail=sum(1 for s in m["subscores"].values() if s and s["score"] is not None))
                                 for m in ms},
        "names_summary.json": {m["id"]: m["surnames"] for m in ms if m["surnames"] is not None},
        "weird_summary.json": {m["id"]: m["weird"] for m in ms if m["weird"] is not None},
        "selfboot.json": {"reference": bundle["reference"]["pile_lexical"],
                          "models": {m["id"]: m["selfboot"] for m in ms if m["selfboot"] is not None}},
        "tail_realised.json": [dict(model=m["id"], **m["tail"]) for m in ms if m["tail"] is not None],
        # bundle v6 blocks (absent in v1; written only when a model carries them)
        "bootstrap.json": {m["id"]: m["ci"] for m in ms if m.get("ci")},
        "tailmass.json": {m["id"]: {k: m.get(v) for k, v in (("tail", "tailmass"), ("prior", "prior"), ("ood", "ood")) if m.get(v)}
                          for m in ms if m.get("tailmass") or m.get("prior") or m.get("ood")},
    }
    files = {k: v for k, v in files.items() if v}
    for name, obj in files.items():
        if name in drop:
            continue
        with open(os.path.join(adir, name), "w") as fh:
            json.dump(obj, fh)  # Python writes bare NaN, as the measurement scripts do


class ExportRoundTrip(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with open(V1, encoding="utf-8") as fh:
            cls.v1_text = fh.read()
        cls.v1 = json.loads(cls.v1_text)
        cls.registry = eb.load_registry(eb.DEFAULT_REGISTRY)

    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="tbb-export-")
        self.adir = os.path.join(self.tmp, "analysis")
        self.data = os.path.join(self.tmp, "data")
        os.makedirs(self.adir)
        os.makedirs(self.data)

    def tearDown(self):
        shutil.rmtree(self.tmp)

    def test_registry_covers_v1(self):
        for m in self.v1["models"]:
            meta = self.registry["models"].get(m["id"])
            self.assertIsNotNone(meta, m["id"])
            # `order` is a ladder position and legitimately shifts when an earlier rung is added later
            self.assertEqual((meta["family"], meta["stage"], meta["label"]),
                             (m["family"], m["stage"], m["label"]), m["id"])

    def test_scores_recompute_from_fingerprint(self):
        for m in self.v1["models"]:
            r = eb.score_fingerprint(m["fingerprint"])
            self.assertAlmostEqual(r["overall"], m["score"], places=12, msg=m["id"])
            for k in eb.SUBSCORES:
                self.assertTrue(eb.close(r[k]["score"], m["subscores"][k]["score"]), (m["id"], k))
                self.assertEqual(r[k]["source"], m["subscores"][k]["source"], (m["id"], k))

    def test_shipped_bundle_is_strict_json(self):
        def reject(tok):
            raise ValueError(f"bare {tok} in {V1}: not valid JSON")
        json.loads(self.v1_text, parse_constant=reject)

    def test_shipped_bundle_is_exporter_output(self):
        # The repo copy is byte-identical to what the exporter's writer produces.
        self.assertEqual(self.v1_text, eb.dump(self.v1))

    def test_round_trip_reproduces_v1(self):
        write_analysis(self.v1, self.adir)
        bundle, _ = eb.build_bundle(self.adir, self.registry, self.v1["generated"])
        self.assertEqual(bundle["n_models"], self.v1["n_models"])
        self.assertEqual(self.v1["reference"], bundle["reference"])
        got = {m["id"]: m for m in bundle["models"]}
        for m in self.v1["models"]:
            a, b = dict(m), dict(got[m["id"]])
            a.pop("order", None); b.pop("order", None)  # ladder positions may be renumbered by later registry additions
            for k in eb.OPTIONAL_BLOCKS:  # v6 blocks: null in new exports, absent in v1
                if k not in a and b.get(k) is None:
                    b.pop(k, None)
            self.assertEqual(a, b, m["id"])
        scores = [m["score"] for m in bundle["models"]]
        self.assertEqual(scores, sorted(scores, reverse=True))
        json.dumps(bundle, allow_nan=False)  # strict JSON

    def test_v6_blocks_round_trip_and_degrade(self):
        """ci / tailmass / prior / ood come through the exporter and are null for models without them."""
        one = dict(self.v1, models=[dict(m) for m in self.v1["models"][:2]])
        ci = {"calib_gap": {"value": -0.01, "ci95": [-0.015, -0.005], "n_docs": 900}, "KL_few": {"value": 0.2, "range": [0.1, 0.3], "n_frames": 3}}
        tm = {"n": 1000, "CE": 1.5, "H": 1.4, "gap": -0.1, "pred2": 0.1, "real2": 0.11, "ratio2": 1.1, "pred3": 0.03, "real3": 0.03, "ratio3": 1.0,
              "pred4": 0.01, "real4": 0.012, "ratio4": 1.2, "bins2": [[0.01, 0.012, 250]] * 4, "bins3": [[0.003, 0.003, 250]] * 4, "bins4": [[0.001, 0.001, 250]] * 4}
        pr = {"logp": {"q_colon": -5.0, "the": -3.0}, "instr_logmass": -5.0, "ctrl_logmass": -3.0, "instr_mass": 0.0067, "ctrl_mass": 0.05, "instr_max": -5.0, "instr_argmax": "q_colon"}
        one["models"][0].update(ci=ci, tailmass=tm, prior=pr, ood={"base64": dict(tm), "ALL": dict(tm)})
        write_analysis(one, self.adir)
        bundle, warnings = eb.build_bundle(self.adir, self.registry, "2026-11-01")
        got = {m["id"]: m for m in bundle["models"]}
        a, b = got[one["models"][0]["id"]], got[one["models"][1]["id"]]
        self.assertEqual(a["ci"], ci)
        self.assertEqual(a["tailmass"], tm)
        self.assertEqual(a["prior"], pr)
        self.assertEqual(set(a["ood"]), {"base64", "ALL"})
        for k in eb.OPTIONAL_BLOCKS:
            self.assertIsNone(b[k], k)
        self.assertIn("q_colon", bundle["reference"]["prior_openers"])  # from data/prior_openers.json
        self.assertTrue(any("no ci data" in w for w in warnings))
        # a malformed ci entry is rejected
        one["models"][0]["ci"] = {"calib_gap": {"value": 0.0, "ci95": [1]}}
        write_analysis(one, self.adir)
        with self.assertRaises(eb.ExportError):
            eb.build_bundle(self.adir, self.registry, "2026-11-01")

    def test_shipped_v6_carries_blocks(self):
        p = os.path.join(REPO, "data", "bench_v6.json")
        if not os.path.exists(p):
            self.skipTest("bench_v6.json not shipped")
        with open(p, encoding="utf-8") as fh:
            b = json.load(fh)
        self.assertTrue(all("ci" in m for m in b["models"]))
        self.assertTrue(any(m.get("tailmass") for m in b["models"]))
        self.assertIn("prior_openers", b["reference"])

    def test_missing_scores_file_is_recomputed(self):
        write_analysis(self.v1, self.adir, drop=("truebase_scores.json", "tail_realised.json"))
        bundle, warnings = eb.build_bundle(self.adir, self.registry, "2026-10-13")
        self.assertTrue(any("truebase_scores.json" in w for w in warnings))
        got = {m["id"]: m for m in bundle["models"]}
        for m in self.v1["models"]:
            self.assertAlmostEqual(got[m["id"]]["score"], m["score"], places=12)
            self.assertIsNone(got[m["id"]]["tail"])

    def test_inconsistent_scores_rejected(self):
        write_analysis(self.v1, self.adir)
        p = os.path.join(self.adir, "truebase_scores.json")
        with open(p) as fh:
            sc = json.load(fh)
        first = self.v1["models"][0]["id"]
        sc[first]["overall"] = 0.1
        with open(p, "w") as fh:
            json.dump(sc, fh)
        with self.assertRaises(eb.ExportError):
            eb.build_bundle(self.adir, self.registry, "2026-10-13")

    def test_unknown_model_skipped_or_strict(self):
        write_analysis(self.v1, self.adir)
        p = os.path.join(self.adir, "fingerprints.json")
        with open(p) as fh:
            fps = json.load(fh)
        fps["Mystery-7B"] = dict(self.v1["models"][0]["fingerprint"])
        with open(p, "w") as fh:
            json.dump(fps, fh)
        bundle, warnings = eb.build_bundle(self.adir, self.registry, "2026-10-13")
        self.assertNotIn("Mystery-7B", {m["id"] for m in bundle["models"]})
        self.assertTrue(any("Mystery-7B" in w for w in warnings))
        with self.assertRaises(eb.ExportError):
            eb.build_bundle(self.adir, self.registry, "2026-10-13", strict=True)

    def test_merge_carries_over_unmeasured_models(self):
        one = dict(self.v1, models=[m for m in self.v1["models"] if m["id"] == "gemma-2-9b"])
        write_analysis(one, self.adir)
        bundle, warnings = eb.build_bundle(self.adir, self.registry, "2026-11-01", base=eb.clean(self.v1), base_name="bench_v1.json")
        self.assertEqual(bundle["n_models"], self.v1["n_models"])
        self.assertTrue(any("replaces" in w for w in warnings))
        alone, _ = eb.build_bundle(self.adir, self.registry, "2026-11-01")
        self.assertEqual(alone["n_models"], 1)

    def test_cli_writes_next_bundle_and_manifest(self):
        write_analysis(self.v1, self.adir)
        shutil.copy(V1, self.data)
        with open(os.path.join(REPO, "data", "manifest.json")) as fh:
            man0 = json.load(fh)
        man0["bundles"] = [e for e in man0["bundles"] if e["file"] == "bench_v1.json"]  # seed a v1-only manifest
        man0["latest"] = "bench_v1.json"
        with open(os.path.join(self.data, "manifest.json"), "w") as fh:
            json.dump(man0, fh)
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            rc = eb.main([self.adir, "--data-dir", self.data, "--generated", "2026-11-01"])
        self.assertEqual(rc, 0)
        with open(os.path.join(self.data, "manifest.json")) as fh:
            man = json.load(fh)
        self.assertEqual(man["latest"], "bench_v2.json")
        self.assertEqual([e["file"] for e in man["bundles"]], ["bench_v1.json", "bench_v2.json"])
        self.assertEqual(man["bundles"][1]["n_models"], self.v1["n_models"])
        with open(os.path.join(self.data, "bench_v2.json")) as fh:
            text = fh.read()
        self.assertNotIn("NaN", text)
        # Refuses to overwrite without --force.
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            self.assertEqual(eb.main([self.adir, "--data-dir", self.data, "--version", "2"]), 2)


if __name__ == "__main__":
    unittest.main()
