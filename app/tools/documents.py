from __future__ import annotations

import sys
import uuid
from pathlib import Path

from app.tools.common import ToolResult, final_json_line, run_command


def convert_docx_to_pdf(root: Path, path: Path) -> ToolResult:
    return _run_powershell_converter(root, "scripts\\convert_docx_to_pdf.ps1", path)


def convert_pdf_to_docx(root: Path, path: Path) -> ToolResult:
    return _run_powershell_converter(root, "scripts\\convert_pdf_to_docx.ps1", path)


def create_docx(root: Path, text: str, title: str = "document") -> ToolResult:
    output_dir = root / "output" / "documents"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{safe_filename(title)}_{uuid.uuid4().hex[:8]}.docx"
    temp_text_path = root / "state" / "runtime" / f"docx_text_{uuid.uuid4().hex}.txt"
    temp_text_path.parent.mkdir(parents=True, exist_ok=True)

    command = [
        sys.executable,
        "scripts\\edit_docx.py",
        "create",
        "--output",
        str(output_path),
    ]

    if len(text) > 4000:
        temp_text_path.write_text(text, encoding="utf-8")
        command.extend(["--text-file", str(temp_text_path)])
    else:
        command.extend(["--text", text])

    try:
        proc = run_command(command, cwd=root, timeout=300)
    finally:
        try:
            if temp_text_path.exists():
                temp_text_path.unlink()
        except Exception:
            pass

    try:
        data = final_json_line(proc.stdout)
    except Exception as exc:
        return ToolResult(
            ok=False,
            message=f"DOCX tool failed to return JSON: {exc}",
            stdout=proc.stdout,
            stderr=proc.stderr,
        )

    files = [Path(item) if Path(item).is_absolute() else root / item for item in data.get("files", [])]
    ok = proc.returncode == 0 and data.get("status") == "ok" and bool(files)
    message = "DOCX created." if ok else data.get("error") or f"DOCX creation failed with code {proc.returncode}"
    return ToolResult(ok=ok, files=files, message=message, raw=data, stdout=proc.stdout, stderr=proc.stderr)


def _run_powershell_converter(root: Path, script: str, path: Path) -> ToolResult:
    if sys.platform != "win32":
        return ToolResult(
            ok=False,
            message="This converter currently uses Microsoft Word COM and only runs on Windows.",
        )

    command = [
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        script,
        "-InputPath",
        str(path),
    ]
    proc = run_command(command, cwd=root, timeout=300)

    try:
        data = final_json_line(proc.stdout)
    except Exception as exc:
        return ToolResult(
            ok=False,
            message=f"Document tool failed to return JSON: {exc}",
            stdout=proc.stdout,
            stderr=proc.stderr,
        )

    files = [root / item for item in data.get("files", [])]
    ok = proc.returncode == 0 and data.get("status") == "ok" and bool(files)
    message = "" if ok else data.get("error") or f"Document conversion failed with code {proc.returncode}"
    return ToolResult(ok=ok, files=files, message=message, raw=data, stdout=proc.stdout, stderr=proc.stderr)


def safe_filename(value: str) -> str:
    cleaned = "".join(char if char.isalnum() or char in ("-", "_") else "_" for char in value.strip())
    cleaned = "_".join(part for part in cleaned.split("_") if part)
    return (cleaned or "document")[:70]
