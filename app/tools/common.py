from __future__ import annotations

import json
import subprocess
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class ToolResult:
    ok: bool
    files: list[Path] = field(default_factory=list)
    message: str = ""
    raw: dict[str, Any] = field(default_factory=dict)
    stdout: str = ""
    stderr: str = ""


def final_json_line(stdout: str) -> dict[str, Any]:
    for line in reversed(stdout.splitlines()):
        line = line.strip()
        if not line.startswith("{"):
            continue
        return json.loads(line)
    raise ValueError("tool did not print a JSON result line")


def run_command(command: list[str], cwd: Path, timeout: int = 900) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=str(cwd),
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
    )

