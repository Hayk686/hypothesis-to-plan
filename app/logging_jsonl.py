from __future__ import annotations

import json
import traceback
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


class JsonlLogger:
    def __init__(self, path: Path):
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def event(self, kind: str, **fields: Any) -> None:
        payload = {
            "ts": datetime.now(timezone.utc).isoformat(),
            "kind": kind,
            **fields,
        }
        with self.path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(payload, ensure_ascii=False, default=str) + "\n")

    def exception(self, kind: str, exc: BaseException, **fields: Any) -> None:
        self.event(kind, error=str(exc), traceback=traceback.format_exc(), **fields)

