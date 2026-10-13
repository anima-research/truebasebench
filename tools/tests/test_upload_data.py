"""tools/upload_data.py without a network: upload plan, headers and skip-if-unchanged via botocore's Stubber.

Run: python -m unittest discover -s tools/tests -v
"""
import base64
import hashlib
import io
import json
import os
import shutil
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, os.path.join(REPO, "tools"))

import upload_data as ud  # noqa: E402

ENV = {
    "OVH_S3_ENDPOINT": "https://s3.gra.io.cloud.ovh.net",
    "OVH_S3_BUCKET": "truebasebench-data",
    "OVH_S3_REGION": "gra",
    "AWS_ACCESS_KEY_ID": "test",
    "AWS_SECRET_ACCESS_KEY": "test",
}


class Plan(unittest.TestCase):
    def test_repo_data_plan_puts_manifest_last(self):
        files = ud.plan(ud.DEFAULT_DATA_DIR)
        names = [n for n, _ in files]
        self.assertEqual(names[-1], "manifest.json")
        self.assertIn("bench_v1.json", names)

    def test_cache_policy(self):
        self.assertEqual(ud.cache_control("manifest.json"), "no-cache")
        self.assertIn("max-age", ud.cache_control("bench_v7.json"))

    def test_manifest_pointing_at_missing_bundle_is_rejected(self):
        tmp = tempfile.mkdtemp()
        try:
            with open(os.path.join(tmp, "manifest.json"), "w") as fh:
                json.dump({"bundles": ["bench_v9.json"]}, fh)
            with self.assertRaises(ud.UploadError):
                ud.plan(tmp)
        finally:
            shutil.rmtree(tmp)

    def test_env_config(self):
        with mock.patch.dict(os.environ, ENV, clear=True):
            cfg = ud.env_config()
        self.assertEqual(cfg["public"], "https://truebasebench-data.s3.gra.io.cloud.ovh.net")
        self.assertEqual(cfg["prefix"], "")
        with mock.patch.dict(os.environ, dict(ENV, OVH_S3_PREFIX="/live/"), clear=True):
            self.assertEqual(ud.env_config()["public"], "https://truebasebench-data.s3.gra.io.cloud.ovh.net/live")
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(ud.UploadError):
                ud.env_config()

    def test_dry_run_needs_no_credentials(self):
        with mock.patch.dict(os.environ, {}, clear=True), redirect_stdout(io.StringIO()) as out:
            self.assertEqual(ud.main(["--dry-run", "--no-dotenv"]), 0)
        self.assertIn("manifest.json", out.getvalue())

    def test_corpus_plan_writes_checksums(self):
        tmp = tempfile.mkdtemp()
        try:
            for f in ud.CORPUS_FILES:
                obj = {"surnames": [["SMITH", 2442977]]} if f == "names.json" else {"tf": [{"idx": 0, "set": "x", "text": "t"}]}
                with open(os.path.join(tmp, f), "w") as fh:
                    json.dump(obj, fh)
            files = ud.plan_corpus(tmp)
            self.assertEqual([n for n, _ in files], ["corpus/" + f for f in ud.CORPUS_FILES] + ["corpus/SHA256SUMS"])
            with open(os.path.join(tmp, "SHA256SUMS")) as fh:
                lines = fh.read().splitlines()
            self.assertEqual(len(lines), len(ud.CORPUS_FILES))
            self.assertEqual(lines[0].split("  ")[0], ud.sha256_file(os.path.join(tmp, ud.CORPUS_FILES[0])))
            self.assertEqual(ud.cache_control("corpus/weird.json"), ud.CACHE_CORPUS)
            self.assertTrue(ud.content_type("corpus/SHA256SUMS").startswith("text/plain"))
            os.remove(os.path.join(tmp, "weird.json"))
            with self.assertRaises(ud.UploadError):
                ud.plan_corpus(tmp)
        finally:
            shutil.rmtree(tmp)

    def test_cors_policy_shape(self):
        with open(ud.DEFAULT_CORS) as fh:
            cors = json.load(fh)
        rule = cors["CORSRules"][0]
        self.assertEqual(sorted(rule["AllowedMethods"]), ["GET", "HEAD"])
        self.assertTrue(rule["AllowedOrigins"])


class Upload(unittest.TestCase):
    def test_put_object_headers_and_skip_unchanged(self):
        try:
            from botocore.stub import Stubber, ANY
        except ImportError:  # pragma: no cover
            self.skipTest("boto3 not installed")
        with mock.patch.dict(os.environ, ENV, clear=True):
            cfg = ud.env_config()
            s3 = ud.client(cfg)
        files = ud.plan(ud.DEFAULT_DATA_DIR)
        stub = Stubber(s3)
        for i, (name, path) in enumerate(files):
            with open(path, "rb") as fh:
                body = fh.read()
            md5 = hashlib.md5(body).hexdigest()
            if i == 0:  # first file already up to date
                stub.add_response("head_object", {"ETag": f'"{md5}"'}, {"Bucket": cfg["bucket"], "Key": name})
                continue
            stub.add_client_error("head_object", service_error_code="404", http_status_code=404,
                                  expected_params={"Bucket": cfg["bucket"], "Key": name})
            stub.add_response("put_object", {"ETag": f'"{md5}"'}, {
                "Bucket": cfg["bucket"], "Key": name, "Body": ANY, "ACL": "public-read",
                "ContentType": "application/json; charset=utf-8", "CacheControl": ud.cache_control(name),
                "ContentMD5": base64.b64encode(hashlib.md5(body).digest()).decode(),
            })
        with stub, redirect_stdout(io.StringIO()):
            n = ud.upload(s3, cfg, files, force=False)
        stub.assert_no_pending_responses()
        self.assertEqual(n, len(files) - 1)


if __name__ == "__main__":
    unittest.main()
