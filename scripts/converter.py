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
import subprocess
import sys
import time

FFMPEG_DIR = os.path.join(
    os.environ.get("LOCALAPPDATA", ""),
    "Microsoft", "WinGet", "Packages",
    "Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe",
    "ffmpeg-8.1.1-full_build", "bin"
)
FFMPEG_EXE = os.path.join(FFMPEG_DIR, "ffmpeg.exe")

DEFAULT_OUTPUT_DIR = os.path.join("output", "media")


# ─── YouTube download ────────────────────────────────────────────────

def download(url: str, items: str = "1:10", fmt: str = "mp3", output_dir: str = DEFAULT_OUTPUT_DIR) -> dict:
    os.makedirs(output_dir, exist_ok=True)

    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--playlist-items", items,
        "-x",
        "--audio-format", fmt,
        "--audio-quality", "0",
        "--no-overwrites",
        "--restrict-filenames",
        "--ffmpeg-location", FFMPEG_DIR,
        "-o", os.path.join(output_dir, "%(playlist_index)s_%(title)s.%(ext)s"),
        url,
    ]

    print(f"Downloading items {items} from: {url}")
    print(f"Output directory: {output_dir}")
    print(f"Format: {fmt}")
    print(f"ffmpeg: {FFMPEG_DIR}")
    print()

    result = subprocess.run(cmd, capture_output=False, text=True)

    if result.returncode != 0:
        return {"status": "error", "code": result.returncode, "files": [], "count": 0}

    files = sorted([
        os.path.join(output_dir, f)
        for f in os.listdir(output_dir)
        if f.endswith(f".{fmt}")
    ])

    return {"status": "ok", "count": len(files), "files": files}


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
    dl = sub.add_parser("download", help="Download audio from a URL")
    dl.add_argument("--url", required=True, help="URL to download from")
    dl.add_argument("--items", default="1:10", help="Playlist item range (e.g. 1:10)")
    dl.add_argument("--format", default="mp3", help="Audio format: mp3, m4a, wav, flac, opus")
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
