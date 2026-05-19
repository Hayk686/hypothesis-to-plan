from __future__ import annotations

import uuid
from typing import Any

from app.core.types import IncomingMessage, Outgoing
from app.logging_jsonl import JsonlLogger


class TaskLogger:
    def __init__(self, logger: JsonlLogger):
        self.logger = logger

    def start(self, message: IncomingMessage) -> str:
        task_id = uuid.uuid4().hex
        self.logger.event(
            "task_started",
            task_id=task_id,
            channel=message.channel,
            chat_id=message.chat_id,
            text=message.text,
            attachments=[
                {
                    "filename": attachment.filename,
                    "path": str(attachment.path),
                    "kind": attachment.kind,
                    "content_type": attachment.content_type,
                }
                for attachment in message.attachments
            ],
        )
        return task_id

    def finish(self, task_id: str, outgoing: Outgoing) -> None:
        self.logger.event(
            "task_finished",
            task_id=task_id,
            text=outgoing.text,
            files=[str(path) for path in outgoing.files],
            cleanup_files=[str(path) for path in outgoing.cleanup_files],
        )

    def failed(self, task_id: str, exc: BaseException) -> None:
        self.logger.exception("task_failed", exc, task_id=task_id)

    def tool_started(self, task_id: str, tool: str, args: dict[str, Any]) -> None:
        self.logger.event("tool_started", task_id=task_id, tool=tool, args=_safe_args(args))

    def tool_finished(self, task_id: str, tool: str, result: Any, elapsed_ms: int | None = None) -> None:
        self.logger.event(
            "tool_finished",
            task_id=task_id,
            tool=tool,
            elapsed_ms=elapsed_ms,
            ok=getattr(result, "ok", False),
            message=getattr(result, "message", ""),
            files=[str(path) for path in getattr(result, "files", [])],
            raw=getattr(result, "raw", {}),
        )

    def tool_failed(self, task_id: str, tool: str, exc: BaseException) -> None:
        self.logger.exception("tool_failed", exc, task_id=task_id, tool=tool)


def _safe_args(args: dict[str, Any]) -> dict[str, Any]:
    safe = {}
    for key, value in args.items():
        if key.lower() in {"token", "api_key", "password", "secret"}:
            safe[key] = "<redacted>"
        elif isinstance(value, list):
            safe[key] = [str(item) for item in value]
        else:
            safe[key] = str(value)
    return safe
