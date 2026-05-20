from __future__ import annotations

import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable

from app.tools.common import ToolResult


@dataclass
class ToolContext:
    root: Path
    task_id: str = ""
    logger: Any = None
    config: Any = None
    memory_context: str = ""
    artifact_context: str = ""
    artifact_store: Any = None
    artifact_key: str = ""
    task_state: Any = None
    metadata: dict[str, Any] = field(default_factory=dict)


ToolHandler = Callable[[ToolContext, dict[str, Any]], ToolResult]


@dataclass(frozen=True)
class ToolSpec:
    name: str
    description: str
    handler: ToolHandler


class ToolRegistry:
    def __init__(self) -> None:
        self._tools: dict[str, ToolSpec] = {}

    def register(self, name: str, description: str, handler: ToolHandler) -> None:
        if name in self._tools:
            raise ValueError(f"tool already registered: {name}")
        self._tools[name] = ToolSpec(name=name, description=description, handler=handler)

    def names(self) -> list[str]:
        return sorted(self._tools)

    def describe(self) -> str:
        return "\n".join(f"- {spec.name}: {spec.description}" for spec in self._tools.values())

    def run(self, name: str, context: ToolContext, **kwargs: Any) -> ToolResult:
        if name not in self._tools:
            return ToolResult(ok=False, message=f"Unknown tool: {name}")

        spec = self._tools[name]
        started_at = time.monotonic()
        if context.logger:
            context.logger.tool_started(context.task_id, name, kwargs)

        try:
            result = spec.handler(context, kwargs)
        except Exception as exc:
            if context.logger:
                context.logger.tool_failed(context.task_id, name, exc)
            return ToolResult(ok=False, message=str(exc))

        if context.logger:
            context.logger.tool_finished(context.task_id, name, result, elapsed_ms=elapsed_ms(started_at))
        return result


def elapsed_ms(started_at: float) -> int:
    return int((time.monotonic() - started_at) * 1000)
