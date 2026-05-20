#!/usr/bin/env python3
"""Download a URL to a local file. Used to materialise time-limited signed
links (e.g. Canva exports) so they can be delivered via send_file.

Emits one JSON line on stdout with status/files/count, matching sibling
wrappers.
"""

import argparse
import json
import os
import re
import sys
import urllib.parse
import urllib.request

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

DEFAULT_DIR = os.path.join("output", "downloads")
SAFE_NAME = re.compile(r"[^A-Za-z0-9._\- ]+")


def emit(payload: dict, code: int = 0) -> None:
    print(json.dumps(payload, ensure_ascii=False))
    sys.exit(code)


def pick_filename(url: str, explicit: str | None, content_disposition: str | None) -> str:
    if explicit:
        return SAFE_NAME.sub("_", explicit).strip() or "download"
    if content_disposition:
        m = re.search(r'filename="?([^";]+)"?', content_disposition)
        if m:
            return SAFE_NAME.sub("_", m.group(1)).strip() or "download"
    path = urllib.parse.urlparse(url).path
    name = os.path.basename(urllib.parse.unquote(path)) or "download"
    return SAFE_NAME.sub("_", name).strip() or "download"


def main() -> None:
    parser = argparse.ArgumentParser(description="Download URL to output\\downloads\\")
    parser.add_argument("--url", required=True)
    parser.add_argument("--filename", help="Override the saved filename")
    parser.add_argument("--output-dir", default=DEFAULT_DIR)
    args = parser.parse_args()

    if not re.match(r"^https?://", args.url):
        emit({"status": "error", "error": "url must start with http(s)://", "files": [], "count": 0}, 1)

    os.makedirs(args.output_dir, exist_ok=True)
    req = urllib.request.Request(args.url, headers={"User-Agent": "picoclaw-downloader/1.0"})

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            cd = resp.headers.get("Content-Disposition", "")
            name = pick_filename(args.url, args.filename, cd)
            dest = os.path.join(args.output_dir, name)
            i = 1
            base, ext = os.path.splitext(dest)
            while os.path.exists(dest):
                dest = f"{base} ({i}){ext}"
                i += 1
            with open(dest, "wb") as f:
                while True:
                    chunk = resp.read(65536)
                    if not chunk:
                        break
                    f.write(chunk)
            size = os.path.getsize(dest)
        emit({"status": "ok", "files": [os.path.abspath(dest)], "count": 1, "bytes": size})
    except Exception as e:
        emit({"status": "error", "error": str(e), "files": [], "count": 0}, 1)


if __name__ == "__main__":
    main()
