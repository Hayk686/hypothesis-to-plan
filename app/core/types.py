from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class Attachment:
    path: Path
    filename: str = ""
    content_type: str = ""
    kind: str = "document"


@dataclass
class IncomingMessage:
    text: str = ""
    attachments: list[Attachment] = field(default_factory=list)
    channel: str = "unknown"
    chat_id: int | str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class Outgoing:
    text: str = ""
    files: list[Path] = field(default_factory=list)
    cleanup_files: list[Path] = field(default_factory=list)

