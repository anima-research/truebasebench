#!/usr/bin/env python3
"""Publish the data bundles to OVH Object Storage (S3-compatible) as public-read objects.

Uploads data/bench_v<N>.json and data/manifest.json (manifest last, so it never points at a bundle that is not
there yet). With --corpus-dir, also publishes the five fixed measurement corpora under corpus/ together with a
corpus/SHA256SUMS file, so that submitters measure on exactly the same text (see the site's "Measure your model"). Every file is parsed and checked before anything is sent; unchanged objects (same MD5 as the
remote ETag) are skipped.

Environment:
    OVH_S3_ENDPOINT        https://s3.<region>.io.cloud.ovh.net           required
    OVH_S3_BUCKET          bucket name                                     required
    OVH_S3_REGION          e.g. gra, sbg, de, uk, bhs                      required
    AWS_ACCESS_KEY_ID      S3 credentials of the OVH Public Cloud user     required
    AWS_SECRET_ACCESS_KEY                                                  required
    OVH_S3_PREFIX          optional key prefix inside the bucket, e.g. "v1/" (default: none)
    OVH_S3_PUBLIC_URL      optional public base URL of the objects
                           (default: https://<bucket>.s3.<region>.io.cloud.ovh.net[/<prefix>])
    OVH_S3_ADDRESSING      "virtual" (default) or "path"

Cache policy (the site always revalidates with fetch(..., {cache: "no-cache"}), so these mostly govern
intermediaries):
    manifest.json          Cache-Control: no-cache                  (the pointer to the latest bundle)
    bench_v<N>.json        Cache-Control: public, max-age=3600      (versioned by name, but correctable)
    corpus/*               Cache-Control: public, max-age=86400     (fixed inputs; checked by SHA256SUMS)

Usage:
    python tools/upload_data.py --dry-run          # show what would be uploaded
    python tools/upload_data.py                    # upload changed files
    python tools/upload_data.py --apply-cors       # also (re)apply infra/ovh/cors.json to the bucket
    python tools/upload_data.py --verify-only      # check the public URLs (status, content-type, CORS)
    python tools/upload_data.py --corpus-dir /path/to/corpus --corpus-only --verify   # publish the corpora
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from typing import Dict, List, Optional, Tuple

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DEFAULT_DATA_DIR = os.path.join(REPO, "data")
DEFAULT_CORS = os.path.join(REPO, "infra", "ovh", "cors.json")

CONTENT_TYPE = "application/json; charset=utf-8"
CONTENT_TYPE_TEXT = "text/plain; charset=utf-8"
CACHE_MANIFEST = "no-cache"
CACHE_BUNDLE = "public, max-age=3600"
CACHE_CORPUS = "public, max-age=86400"
CORPUS_PREFIX = "corpus/"
# The fixed inputs of docs/vh_score*.py (flag -> file); every published model was measured on these.
CORPUS_FILES = ("pile10k_sel.json", "wiki_gh.json", "uncheatable_2026_04.json", "weird.json", "names.json")
CORPUS_SUMS = "SHA256SUMS"
BUNDLE_RE = re.compile(r"^bench_v(\d+)\.json$")
REQUIRED_ENV = ("OVH_S3_ENDPOINT", "OVH_S3_BUCKET", "OVH_S3_REGION", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY")


class UploadError(Exception):
    pass


def load_dotenv(path: str = os.path.join(REPO, ".env")) -> None:
    """Read KEY=VALUE lines from the repo's .env (gitignored) without overriding the real environment."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip().removeprefix("export ").strip(), v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v


def cache_control(name: str) -> str:
    if name.startswith(CORPUS_PREFIX):
        return CACHE_CORPUS
    return CACHE_MANIFEST if name == "manifest.json" else CACHE_BUNDLE


def content_type(name: str) -> str:
    return CONTENT_TYPE if name.endswith(".json") else CONTENT_TYPE_TEXT


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def plan_corpus(corpus_dir: str) -> List[Tuple[str, str]]:
    """Return [(corpus/<file>, path)] for the five corpora plus corpus/SHA256SUMS (written into corpus_dir).

    Every file must exist and have the shape docs/vh_score.py reads: {"tf": [...]} for the teacher-forced corpora,
    {"surnames": [[name, count], ...]} for names.json."""
    if not os.path.isdir(corpus_dir):
        raise UploadError(f"--corpus-dir {corpus_dir} is not a directory")
    missing = [f for f in CORPUS_FILES if not os.path.exists(os.path.join(corpus_dir, f))]
    if missing:
        raise UploadError(f"--corpus-dir {corpus_dir} lacks {', '.join(missing)}")
    sums = []
    for f in CORPUS_FILES:
        path = os.path.join(corpus_dir, f)
        try:
            with open(path, encoding="utf-8") as fh:
                obj = json.load(fh)
        except ValueError as e:
            raise UploadError(f"{path}: not valid JSON ({e})") from e
        key = "surnames" if f == "names.json" else "tf"
        if not isinstance(obj, dict) or not isinstance(obj.get(key), list) or not obj[key]:
            raise UploadError(f"{path}: expected a non-empty {key!r} list")
        sums.append(f"{sha256_file(path)}  {f}\n")
    with open(os.path.join(corpus_dir, CORPUS_SUMS), "w", encoding="utf-8") as fh:
        fh.writelines(sums)
    return [(CORPUS_PREFIX + f, os.path.join(corpus_dir, f)) for f in CORPUS_FILES + (CORPUS_SUMS,)]


def plan(data_dir: str, only: Optional[List[str]] = None) -> List[Tuple[str, str]]:
    """Return [(name, path)] in upload order: bundles by version, manifest last. Validates every file."""
    if not os.path.isdir(data_dir):
        raise UploadError(f"{data_dir} is not a directory")
    names = sorted((f for f in os.listdir(data_dir) if BUNDLE_RE.match(f)), key=lambda f: int(BUNDLE_RE.match(f).group(1)))
    if not os.path.exists(os.path.join(data_dir, "manifest.json")):
        raise UploadError(f"{data_dir}/manifest.json not found")
    with open(os.path.join(data_dir, "manifest.json"), encoding="utf-8") as fh:
        manifest = json.load(fh)
    listed = [e if isinstance(e, str) else e.get("file") for e in manifest.get("bundles", [])]
    for f in listed:
        if f not in names:
            raise UploadError(f"manifest.json lists {f}, which is not in {data_dir}")
    for f in names:
        if f not in listed:
            print(f"warning: {f} is not listed in manifest.json (uploaded anyway; the site will not load it)", file=sys.stderr)
    for f in names:
        with open(os.path.join(data_dir, f), encoding="utf-8") as fh:
            b = json.load(fh)
        for k in ("schema_version", "generated", "n_models", "models"):
            if k not in b:
                raise UploadError(f"{f}: missing {k!r}; is this a bundle?")
        if b["n_models"] != len(b["models"]):
            raise UploadError(f"{f}: n_models {b['n_models']} != {len(b['models'])} models")
    files = [(f, os.path.join(data_dir, f)) for f in names] + [("manifest.json", os.path.join(data_dir, "manifest.json"))]
    if only:
        unknown = set(only) - {n for n, _ in files}
        if unknown:
            raise UploadError(f"--only: not found in {data_dir}: {', '.join(sorted(unknown))}")
        files = [(n, p) for n, p in files if n in only]
    return files


def env_config() -> Dict[str, str]:
    missing = [k for k in REQUIRED_ENV if not os.environ.get(k)]
    if missing:
        raise UploadError("missing environment variables: " + ", ".join(missing) + " (see .env.example)")
    endpoint = os.environ["OVH_S3_ENDPOINT"].rstrip("/")
    bucket = os.environ["OVH_S3_BUCKET"]
    region = os.environ["OVH_S3_REGION"]
    prefix = os.environ.get("OVH_S3_PREFIX", "").strip("/")
    prefix = prefix + "/" if prefix else ""
    host = re.sub(r"^https?://", "", endpoint)
    public = os.environ.get("OVH_S3_PUBLIC_URL", "").rstrip("/") or f"https://{bucket}.{host}" + (f"/{prefix.rstrip('/')}" if prefix else "")
    addressing = os.environ.get("OVH_S3_ADDRESSING", "virtual")
    if addressing not in ("virtual", "path"):
        raise UploadError("OVH_S3_ADDRESSING must be 'virtual' or 'path'")
    return {"endpoint": endpoint, "bucket": bucket, "region": region, "prefix": prefix, "public": public, "addressing": addressing}


def client(cfg: Dict[str, str]):
    try:
        import boto3
        from botocore.config import Config
    except ImportError as e:  # pragma: no cover
        raise UploadError("boto3 is required: pip install -r tools/requirements.txt") from e
    kw = dict(signature_version="s3v4", s3={"addressing_style": cfg["addressing"]}, retries={"max_attempts": 5, "mode": "standard"})
    try:
        # botocore >= 1.36 adds CRC32 checksum headers by default; S3-compatible stores may reject them.
        conf = Config(request_checksum_calculation="when_required", response_checksum_validation="when_required", **kw)
    except TypeError:
        conf = Config(**kw)
    return boto3.client("s3", endpoint_url=cfg["endpoint"], region_name=cfg["region"], config=conf)


def remote_etag(s3, bucket: str, key: str) -> Optional[str]:
    from botocore.exceptions import ClientError
    try:
        return s3.head_object(Bucket=bucket, Key=key)["ETag"].strip('"')
    except ClientError as e:
        if e.response.get("Error", {}).get("Code") in ("404", "NoSuchKey", "NotFound"):
            return None
        raise


def upload(s3, cfg: Dict[str, str], files: List[Tuple[str, str]], force: bool) -> int:
    sent = 0
    for name, path in files:
        key = cfg["prefix"] + name
        with open(path, "rb") as fh:
            body = fh.read()
        digest = hashlib.md5(body).hexdigest()
        cc = cache_control(name)
        ct = content_type(name)
        if not force and remote_etag(s3, cfg["bucket"], key) == digest:
            # Metadata is not compared; pass --force after changing the cache policy.
            print(f"unchanged  {key}")
            continue
        s3.put_object(Bucket=cfg["bucket"], Key=key, Body=body, ACL="public-read", ContentType=ct,
                      CacheControl=cc, ContentMD5=base64.b64encode(hashlib.md5(body).digest()).decode())
        print(f"uploaded   {key}  ({len(body)} B, {cc})")
        sent += 1
    return sent


def apply_cors(s3, cfg: Dict[str, str], path: str) -> None:
    with open(path, encoding="utf-8") as fh:
        cors = json.load(fh)
    s3.put_bucket_cors(Bucket=cfg["bucket"], CORSConfiguration=cors)
    print(f"applied CORS from {path} to bucket {cfg['bucket']}")


def verify(cfg: Dict[str, str], names: List[str], origin: Optional[str]) -> bool:
    ok = True
    for name in names:
        url = f"{cfg['public']}/{name}"
        req = urllib.request.Request(url, headers={"Origin": origin} if origin else {})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                ct, cc = r.headers.get("Content-Type", ""), r.headers.get("Cache-Control", "")
                acao = r.headers.get("Access-Control-Allow-Origin")
                body = r.read().decode("utf-8")
                if name.endswith(".json"):
                    json.loads(body)
                problems = []
                if name.endswith(".json") and "json" not in ct:
                    problems.append(f"content-type {ct!r}")
                if cc != cache_control(name):
                    problems.append(f"cache-control {cc!r}")
                if origin and acao not in ("*", origin):
                    problems.append(f"no CORS header for origin {origin} (got {acao!r}); apply infra/ovh/cors.json")
                print(("ok         " if not problems else "PROBLEM    ") + url + ("" if not problems else "  " + "; ".join(problems)))
                ok = ok and not problems
        except (urllib.error.URLError, ValueError) as e:
            print(f"FAILED     {url}  {e}")
            ok = False
    return ok


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="Upload data/*.json to OVH Object Storage (public-read).")
    ap.add_argument("--data-dir", default=DEFAULT_DATA_DIR)
    ap.add_argument("--only", nargs="+", metavar="FILE", help="upload only these files (e.g. bench_v2.json manifest.json)")
    ap.add_argument("--dry-run", action="store_true", help="validate and list, send nothing (no credentials needed)")
    ap.add_argument("--force", action="store_true", help="upload even if the remote object has the same content")
    ap.add_argument("--apply-cors", action="store_true", help="put the bucket CORS policy from --cors before uploading")
    ap.add_argument("--cors", default=DEFAULT_CORS, help="CORS policy JSON (default: infra/ovh/cors.json)")
    ap.add_argument("--verify", action="store_true", help="after uploading, fetch the public URLs and check headers")
    ap.add_argument("--verify-only", action="store_true", help="only check the public URLs")
    ap.add_argument("--origin", default=None,
                    help="site origin for the CORS check, e.g. https://truebasebench.org (default: $SITE_ORIGIN)")
    ap.add_argument("--corpus-dir", default=None,
                    help="also publish the measurement corpora (" + ", ".join(CORPUS_FILES) + ") from this directory "
                         "under corpus/, with a generated corpus/SHA256SUMS")
    ap.add_argument("--corpus-only", action="store_true", help="with --corpus-dir: publish only the corpora, not data/")
    ap.add_argument("--no-dotenv", action="store_true", help="do not read the repo's .env file")
    args = ap.parse_args(argv)
    if not args.no_dotenv:
        load_dotenv()
    args.origin = args.origin or os.environ.get("SITE_ORIGIN") or None

    try:
        if args.corpus_only and not args.corpus_dir:
            raise UploadError("--corpus-only needs --corpus-dir")
        files = [] if args.corpus_only else plan(args.data_dir, args.only)
        if args.corpus_dir:
            files = plan_corpus(args.corpus_dir) + files  # corpora first; manifest.json stays last
        if args.dry_run:
            bucket = os.environ.get("OVH_S3_BUCKET") or "<bucket>"
            prefix = os.environ.get("OVH_S3_PREFIX", "").strip("/")
            if args.apply_cors:
                print(f"would apply CORS from {args.cors} to bucket {bucket}")
            for name, path in files:
                key = f"{prefix}/{name}" if prefix else name
                print(f"would upload {path} -> s3://{bucket}/{key}  ({os.path.getsize(path)} B, {cache_control(name)}, public-read)")
            return 0
        if args.verify_only:
            return 0 if verify(env_config_public(), [n for n, _ in files], args.origin) else 1
        cfg = env_config()
        s3 = client(cfg)
        if args.apply_cors:
            apply_cors(s3, cfg, args.cors)
        n = upload(s3, cfg, files, args.force)
        print(f"{n} object(s) uploaded; public base: {cfg['public']}")
        print(f"the site reads it when the Railway service is built with VITE_DATA_BASE_URL={cfg['public']}")
        if args.verify:
            return 0 if verify(cfg, [n for n, _ in files], args.origin) else 1
    except UploadError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2
    return 0


def env_config_public() -> Dict[str, str]:
    """Config for --verify-only: needs only the public location, not credentials."""
    pub = os.environ.get("OVH_S3_PUBLIC_URL", "").rstrip("/")
    if pub:
        return {"public": pub}
    missing = [k for k in ("OVH_S3_ENDPOINT", "OVH_S3_BUCKET") if not os.environ.get(k)]
    if missing:
        raise UploadError("--verify-only needs OVH_S3_PUBLIC_URL or " + " and ".join(missing))
    host = re.sub(r"^https?://", "", os.environ["OVH_S3_ENDPOINT"].rstrip("/"))
    prefix = os.environ.get("OVH_S3_PREFIX", "").strip("/")
    return {"public": f"https://{os.environ['OVH_S3_BUCKET']}.{host}" + (f"/{prefix}" if prefix else "")}


if __name__ == "__main__":
    sys.exit(main())
