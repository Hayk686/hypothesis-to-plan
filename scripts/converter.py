#!/usr/bin/env python3
"""
Media converter:
  1) Downloads audio from YouTube URLs (yt-dlp + ffmpeg).
  2) Converts .webm files to .mp4 (libx264 + aac).
"""

import argparse
import glob
import json
import os
import re
import subprocess
import sys
import time
import zipfile

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

FFMPEG_DIR = os.path.join(
    os.environ.get("LOCALAPPDATA", ""),
    "Microsoft", "WinGet", "Packages",
    "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe",
    "ffmpeg-8.1.1-full_build", "bin"
)
FFMPEG_EXE = os.path.join(FFMPEG_DIR, "ffmpeg.exe")

DEFAULT_OUTPUT_DIR = os.path.join("output", "media")
SUPPORTED_AUDIO_FORMATS = {"mp3", "m4a", "wav", "flac", "opus", "aac", "alac", "vorbis", "ogg", "best"}
FORMAT_ALIASES = {"ogg": "vorbis"}
OUTPUT_AUDIO_EXTENSIONS = {".mp3", ".m4a", ".wav", ".flac", ".opus", ".ogg", ".aac", ".webm"}
VIDEO_ID_SUFFIX_RE = re.compile(r"\s*\[[A-Za-z0-9_-]{6,}\]$")
COMMON_TITLE_SUFFIXES = [
    re.compile(r"\s*[-–—]?\s*\(?\b(official|offical)\s+(music\s+)?(video|audio)(\s+\d{4})?\)?\s*$", re.IGNORECASE),
    re.compile(r"\s*[-–—]?\s*\(?\b(music\s+video|lyric\s+video|lyrics|visualizer|mood\s+video)\)?\s*$", re.IGNORECASE),
]


# ─── YouTube download ────────────────────────────────────────────────

def normalize_download_options(urls, items: str, fmt: str) -> tuple[list[str], str, str, str | None]:
    if isinstance(urls, str):
        urls = [urls]
    urls = [url.strip() for url in urls if url and url.strip()]
    if not urls:
        return [], items, fmt, "at least one --url is required"
    for url in urls:
        if not re.fullmatch(r"https?://\S+", url):
            return [], items, fmt, f"url must be http(s)://: {url}"

    m = re.fullmatch(r"(\d+)(?::(\d+))?", items)
    if not m:
        return [], items, fmt, "items must be N or N:M"
    if m.group(2) is None:
        items = f"{m.group(1)}:{m.group(1)}"  # "1" -> "1:1"

    fmt = fmt.lower()
    if fmt not in SUPPORTED_AUDIO_FORMATS:
        return [], items, fmt, f"unsupported format: {fmt}"

    return urls, items, fmt, None


def audio_files_changed_since(output_dir: str, filenames: set[str], started_at: float) -> list[str]:
    files = []
    for filename in filenames:
        path = os.path.join(output_dir, filename)
        if os.path.splitext(filename)[1].lower() not in OUTPUT_AUDIO_EXTENSIONS:
            continue
        if not os.path.isfile(path):
            continue
        if os.path.getmtime(path) >= started_at - 1:
            files.append(path)
    return sorted(files)


def clean_track_stem(stem: str) -> str:
    stem = VIDEO_ID_SUFFIX_RE.sub("", stem)
    stem = re.sub(r"^NA[_\s-]+[A-Za-z0-9_-]{11}[_\s-]+", "", stem)
    stem = re.sub(r"^NA[_\s-]+", "", stem)
    stem = stem.replace("_", " ")
    stem = re.sub(r"\s+", " ", stem).strip()

    for suffix in COMMON_TITLE_SUFFIXES:
        stem = suffix.sub("", stem).strip()

    stem = re.sub(r"\s+([,.;)])", r"\1", stem)
    stem = re.sub(r"([(])\s+", r"\1", stem)
    stem = stem.strip(" -_.,")
    return stem[:140].strip() or "audio"


def unique_file_path(directory: str, stem: str, extension: str) -> str:
    candidate = os.path.join(directory, f"{stem}{extension}")
    if not os.path.exists(candidate):
        return candidate

    for index in range(2, 1000):
        candidate = os.path.join(directory, f"{stem} ({index}){extension}")
        if not os.path.exists(candidate):
            return candidate

    raise RuntimeError("could not create a unique file name")


def rename_for_delivery(path: str) -> str:
    directory, filename = os.path.split(path)
    stem, extension = os.path.splitext(filename)
    clean_stem = clean_track_stem(stem)
    target = unique_file_path(directory, clean_stem, extension.lower())

    if os.path.normcase(os.path.abspath(path)) == os.path.normcase(os.path.abspath(target)):
        return path

    os.replace(path, target)
    return target


def rename_files_for_delivery(files: list[str]) -> list[str]:
    renamed = []
    for path in files:
        try:
            renamed.append(rename_for_delivery(path))
        except Exception as exc:
            print(f"WARNING: could not rename {path}: {exc}", file=sys.stderr)
            renamed.append(path)
    return renamed


def unique_archive_path(output_dir: str, files: list[str]) -> str:
    if files:
        first_stem = clean_track_stem(os.path.splitext(os.path.basename(files[0]))[0])
        remaining = len(files) - 1
        suffix = f" + {remaining} track" if remaining == 1 else f" + {remaining} tracks"
        stem = f"{first_stem}{suffix}" if remaining else first_stem
    else:
        stem = f"music_{time.strftime('%Y%m%d_%H%M%S')}"

    return unique_file_path(output_dir, stem[:140].strip(), ".zip")


def archive_files(files: list[str], output_dir: str) -> str:
    archive_path = unique_archive_path(output_dir, files)
    used_names = set()

    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for index, path in enumerate(files, 1):
            base_name = os.path.basename(path)
            archive_name = base_name
            if archive_name in used_names:
                stem, ext = os.path.splitext(base_name)
                archive_name = f"{index}_{stem}{ext}"
            used_names.add(archive_name)
            archive.write(path, arcname=archive_name)

    return archive_path


def download_one(url: str, items: str, fmt: str, output_dir: str, allow_existing_fallback: bool = False) -> dict:
    if not re.fullmatch(r"https?://\S+", url):
        return {"status": "error", "error": "url must be http(s)://"}
    ytdlp_format = FORMAT_ALIASES.get(fmt, fmt)
    output_dir = DEFAULT_OUTPUT_DIR  # ignore caller's value, always output/media
    os.makedirs(output_dir, exist_ok=True)
    before_files = set(os.listdir(output_dir))
    started_at = time.time()

    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--playlist-items", items,
        "-x",
        "--audio-format", ytdlp_format,
        "--audio-quality", "0",
        "--force-overwrites",
        "--windows-filenames",
        "--trim-filenames", "180",
        "--ffmpeg-location", FFMPEG_DIR,
        "-o", os.path.join(output_dir, "%(title).170s [%(id)s].%(ext)s"),
        url,
    ]

    print(f"Downloading items {items} from: {url}")
    print(f"Output directory: {output_dir}")
    print(f"Format: {fmt}")
    if ytdlp_format != fmt:
        print(f"yt-dlp audio format: {ytdlp_format}")
    print(f"ffmpeg: {FFMPEG_DIR}")
    print()

    result = subprocess.run(cmd, capture_output=False, text=True)

    if result.returncode != 0:
        return {"status": "error", "code": result.returncode, "files": [], "count": 0}

    after_files = set(os.listdir(output_dir))
    new_files = after_files - before_files
    files = audio_files_changed_since(output_dir, new_files, started_at)
    if not files:
        files = audio_files_changed_since(output_dir, after_files, started_at)
    if not files and allow_existing_fallback:
        files = sorted(
            os.path.join(output_dir, f)
            for f in after_files
            if os.path.splitext(f)[1].lower() in OUTPUT_AUDIO_EXTENSIONS
        )

    files = rename_files_for_delivery(files)
    return {"status": "ok", "count": len(files), "files": files}


def download(urls, items: str = "1:10", fmt: str = "mp3", output_dir: str = DEFAULT_OUTPUT_DIR) -> dict:
    urls, items, fmt, error = normalize_download_options(urls, items, fmt)
    if error:
        return {"status": "error", "error": error, "files": [], "count": 0}

    files = []
    errors = []
    seen = set()
    allow_existing_fallback = len(urls) == 1

    for index, url in enumerate(urls, 1):
        print(f"\n=== URL {index}/{len(urls)} ===")
        result = download_one(url, items, fmt, output_dir, allow_existing_fallback)
        if result.get("status") == "ok":
            for path in result.get("files", []):
                if path not in seen:
                    files.append(path)
                    seen.add(path)
        else:
            errors.append({"url": url, "error": result.get("error") or result.get("code") or "download failed"})

    if errors and files:
        status = "partial"
    elif errors:
        status = "error"
    else:
        status = "ok"

    response_files = files
    archive = None
    if len(files) > 1:
        archive = archive_files(files, DEFAULT_OUTPUT_DIR)
        response_files = [archive]

    result = {
        "status": status,
        "count": len(response_files),
        "files": response_files,
        "downloaded_count": len(files),
        "downloaded_files": files,
        "errors": errors,
        "url_count": len(urls),
    }
    if archive:
        result["archive"] = archive
    return result


# ─── WebM → MP4 converter ────────────────────────────────────────────

def convert_webm_to_mp4(source_dir: str = ".") -> dict:
    """
    Converts all .webm files in source_dir to .mp4.
    Video codec: libx264, Audio codec: aac.
    Returns a dict with status, converted files, and any errors.
    """
    webm_files = sorted(glob.glob(os.path.join(source_dir, "*.webm")))

    if not webm_files:
        print("No .webm files found in", os.path.abspath(source_dir))
        return {"status": "ok", "converted": [], "errors": [], "count": 0}

    # Verify ffmpeg is accessible
    if not os.path.isfile(FFMPEG_EXE):
        print(f"ERROR: ffmpeg not found at {FFMPEG_EXE}")
        return {"status": "error", "converted": [], "errors": ["ffmpeg not found"], "count": 0}

    total = len(webm_files)
    converted = []
    errors = []

    print(f"Found {total} .webm file(s) in {os.path.abspath(source_dir)}")
    print(f"Using ffmpeg: {FFMPEG_EXE}")
    print("=" * 60)

    for idx, webm_path in enumerate(webm_files, 1):
        filename = os.path.basename(webm_path)
        mp4_path = os.path.splitext(webm_path)[0] + ".mp4"
        mp4_name = os.path.basename(mp4_path)

        print(f"\n[{idx}/{total}] Converting: {filename}")
        print(f"         → {mp4_name}")

        start_time = time.time()

        cmd = [
            FFMPEG_EXE,
            "-i", webm_path,
            "-c:v", "libx264",
            "-c:a", "aac",
            "-strict", "experimental",
            "-y",                   # overwrite without asking
            "-loglevel", "warning", # show warnings/errors only
            "-stats",               # show progress (frame count, speed, etc.)
            mp4_path,
        ]

        try:
            proc = subprocess.run(cmd, capture_output=False, text=True, timeout=600)
            elapsed = time.time() - start_time

            if proc.returncode == 0:
                size_mb = os.path.getsize(mp4_path) / (1024 * 1024)
                print(f"         ✅ Done in {elapsed:.1f}s ({size_mb:.1f} MB)")
                converted.append(os.path.abspath(mp4_path))
            else:
                print(f"         ❌ ffmpeg exited with code {proc.returncode}")
                errors.append({"file": filename, "error": f"exit code {proc.returncode}"})

        except subprocess.TimeoutExpired:
            print(f"         ❌ Timeout (>600s)")
            errors.append({"file": filename, "error": "timeout"})
        except Exception as e:
            print(f"         ❌ {e}")
            errors.append({"file": filename, "error": str(e)})

    print("\n" + "=" * 60)
    print(f"Converted: {len(converted)}/{total}")
    if errors:
        print(f"Errors:    {len(errors)}")

    return {
        "status": "ok" if not errors else "partial",
        "converted": converted,
        "errors": errors,
        "count": len(converted),
    }


# ─── CLI ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Download & convert media")
    sub = parser.add_subparsers(dest="command")

    # download sub-command
    dl = sub.add_parser("download", help="Download audio from one or more URLs")
    dl.add_argument("--url", required=True, action="append", help="URL to download from. Repeat --url for multiple links.")
    dl.add_argument("--items", default="1:10", help="Playlist item range (e.g. 1:10)")
    dl.add_argument("--format", default="mp3", help="Audio format: mp3, m4a, wav, flac, opus, aac, alac, vorbis, ogg, best")
    dl.add_argument("--output-dir", default=DEFAULT_OUTPUT_DIR, help="Output directory")

    # convert sub-command
    cv = sub.add_parser("convert", help="Convert .webm files to .mp4")
    cv.add_argument("--dir", default=".", help="Directory with .webm files")

    args = parser.parse_args()

    if args.command == "download":
        result = download(args.url, args.items, args.format, args.output_dir)
    elif args.command == "convert":
        result = convert_webm_to_mp4(args.dir)
    else:
        parser.print_help()
        sys.exit(0)

    print()
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0 if result["status"] in ("ok", "partial") else 1)


if __name__ == "__main__":
    main()
