from __future__ import annotations

import re
import sys
from pathlib import Path

from app.tools.common import ToolResult, final_json_line, run_command


SUPPORTED_AUDIO_FORMATS = {"mp3", "m4a", "wav", "flac", "opus", "aac", "alac", "vorbis", "ogg", "best"}
URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
ITEMS_RE = re.compile(r"^\d+(?::\d+)?$")


def parse_download_request(text: str) -> tuple[list[str], str, str]:
    urls = [url.rstrip(".,;)") for url in URL_RE.findall(text)]
    cleaned = URL_RE.sub(" ", text)
    tokens = [token.strip() for token in cleaned.split() if token.strip()]

    fmt = "mp3"
    items = "1"
    for token in reversed(tokens):
        normalized = token.lower().replace("а", "a")
        if normalized in SUPPORTED_AUDIO_FORMATS:
            fmt = normalized
            break

    for token in reversed(tokens):
        if ITEMS_RE.fullmatch(token):
            items = token
            break

    return urls, items, fmt


def download_audio(root: Path, urls: list[str], items: str = "1", fmt: str = "mp3") -> ToolResult:
    if not urls:
        return ToolResult(ok=False, message="No audio URL found.")

    command = [
        sys.executable,
        str(root / "scripts" / "converter.py"),
        "download",
    ]
    for url in urls:
        command.extend(["--url", url])
    command.extend(["--items", items, "--format", fmt])

    proc = run_command(command, cwd=root, timeout=1800)
    try:
        data = final_json_line(proc.stdout)
    except Exception as exc:
        return ToolResult(
            ok=False,
            message=f"Download tool failed to return JSON: {exc}",
            stdout=proc.stdout,
            stderr=proc.stderr,
        )

    files = [root / path for path in data.get("files", [])]
    ok = proc.returncode == 0 and data.get("status") in {"ok", "partial"} and bool(files)
    message = ""
    if not ok:
        message = data.get("error") or f"Download failed with code {proc.returncode}"
    elif data.get("errors"):
        message = f"Downloaded with errors: {data['errors']}"

    return ToolResult(ok=ok, files=files, message=message, raw=data, stdout=proc.stdout, stderr=proc.stderr)
