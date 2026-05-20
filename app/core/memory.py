from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.types import IncomingMessage, Outgoing


MAX_TURNS = 16
MAX_TEXT_CHARS = 900
MAX_CONTEXT_CHARS = 2200
URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
SECRET_PATTERNS = (
    re.compile(r"\bnvapi-[A-Za-z0-9_-]+"),
    re.compile(r"\bsk-[A-Za-z0-9_-]+"),
    re.compile(r"(?i)\b(api[_ -]?key|token|password|secret)\b\s*[:=]?\s*\S+"),
)


@dataclass
class ChatMemory:
    messages: list[dict[str, Any]] = field(default_factory=list)
    last_route: str = ""
    last_urls: list[str] = field(default_factory=list)
    last_files: list[str] = field(default_factory=list)
    updated_at: str = ""


class ChatMemoryStore:
    def __init__(self, state_dir: Path):
        self.path = state_dir / "chat_memory.json"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._data = self._load()

    def key_for(self, message: IncomingMessage) -> str:
        chat_id = message.chat_id if message.chat_id is not None else "default"
        return f"{message.channel}:{chat_id}"

    def context_for(self, key: str) -> str:
        memory = self._memory(key)
        lines = []

        if memory.last_route:
            lines.append(f"Last route: {memory.last_route}")
        if memory.last_urls:
            lines.append("Last URLs: " + ", ".join(memory.last_urls[-4:]))
        if memory.last_files:
            lines.append("Last files: " + ", ".join(Path(item).name for item in memory.last_files[-4:]))

        recent = memory.messages[-8:]
        if recent:
            lines.append("Recent messages:")
            for item in recent:
                role = item.get("role", "unknown")
                text = str(item.get("text", "")).strip()
                if not text:
                    continue
                lines.append(f"- {role}: {text}")

        context = "\n".join(lines).strip()
        if len(context) > MAX_CONTEXT_CHARS:
            context = context[-MAX_CONTEXT_CHARS:].lstrip()
        return context

    def record_turn(self, key: str, message: IncomingMessage, outgoing: Outgoing, route: str = "") -> None:
        if should_skip_memory(message.text):
            return

        memory = self._memory(key)
        now = datetime.now(timezone.utc).isoformat()
        user_text = describe_incoming(message)
        assistant_text = describe_outgoing(outgoing)

        if user_text:
            memory.messages.append({"role": "user", "text": truncate(user_text), "ts": now})
        if assistant_text:
            memory.messages.append({"role": "assistant", "text": truncate(assistant_text), "ts": now})

        del memory.messages[:-MAX_TURNS]
        if route:
            memory.last_route = route

        urls = extract_urls(message.text)
        if urls:
            memory.last_urls = dedupe_keep_last([*memory.last_urls, *urls], limit=8)

        files = [str(path) for path in outgoing.files]
        files.extend(str(attachment.path) for attachment in message.attachments)
        if files:
            memory.last_files = dedupe_keep_last([*memory.last_files, *files], limit=8)

        memory.updated_at = now
        self._data[key] = memory_to_dict(memory)
        self._save()

    def clear(self, key: str) -> None:
        if key in self._data:
            del self._data[key]
            self._save()

    def _memory(self, key: str) -> ChatMemory:
        value = self._data.get(key)
        if not isinstance(value, dict):
            return ChatMemory()
        return ChatMemory(
            messages=list(value.get("messages", []))[-MAX_TURNS:],
            last_route=str(value.get("last_route", "")),
            last_urls=list(value.get("last_urls", []))[-8:],
            last_files=list(value.get("last_files", []))[-8:],
            updated_at=str(value.get("updated_at", "")),
        )

    def _load(self) -> dict[str, Any]:
        if not self.path.exists():
            return {}
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except Exception:
            return {}
        return data if isinstance(data, dict) else {}

    def _save(self) -> None:
        self.path.write_text(json.dumps(self._data, ensure_ascii=False, indent=2), encoding="utf-8")


def with_recent_context(system_prompt: str, memory_context: str) -> str:
    memory_context = memory_context.strip()
    if not memory_context:
        return system_prompt
    return (
        system_prompt.rstrip()
        + "\n\nRecent context from this chat. Use it only when the user refers to earlier messages, "
        "files, links, or says things like 'this', 'it', 'again', 'same', 'его', 'это', 'так же'. "
        "Do not mention this context unless it is useful.\n"
        + memory_context
    )


def memory_key(channel: str, chat_id: int | str | None) -> str:
    return f"{channel}:{chat_id if chat_id is not None else 'default'}"


def should_skip_memory(text: str) -> bool:
    command = text.strip().split(maxsplit=1)[0].lower() if text.strip().startswith("/") else ""
    return command in {
        "/help",
        "/start",
        "/status",
        "/tools",
        "/model",
        "/roles",
        "/ping",
        "/cancel",
        "/clear",
        "/artifacts",
        "/last",
        "/use",
        "/tasks",
        "/resume",
    }


def describe_incoming(message: IncomingMessage) -> str:
    parts = []
    if message.text.strip():
        parts.append(message.text.strip())
    for attachment in message.attachments:
        parts.append(f"[attached file: {attachment.filename or attachment.path.name}]")
    return "\n".join(parts)


def describe_outgoing(outgoing: Outgoing) -> str:
    parts = []
    if outgoing.text.strip():
        parts.append(outgoing.text.strip())
    for path in outgoing.files:
        parts.append(f"[sent file: {path.name}]")
    return "\n".join(parts)


def extract_urls(text: str) -> list[str]:
    return [sanitize_text(url.rstrip(".,;)")) for url in URL_RE.findall(text)]


def truncate(text: str) -> str:
    text = sanitize_text(text)
    text = re.sub(r"\s+", " ", text).strip()
    if len(text) <= MAX_TEXT_CHARS:
        return text
    return text[: MAX_TEXT_CHARS - 3].rstrip() + "..."


def sanitize_text(text: str) -> str:
    for pattern in SECRET_PATTERNS:
        text = pattern.sub("<redacted>", text)
    return text


def dedupe_keep_last(values: list[str], limit: int) -> list[str]:
    result = []
    seen = set()
    for value in reversed(values):
        marker = value.lower()
        if marker in seen:
            continue
        seen.add(marker)
        result.append(value)
    return list(reversed(result))[-limit:]


def memory_to_dict(memory: ChatMemory) -> dict[str, Any]:
    return {
        "messages": memory.messages[-MAX_TURNS:],
        "last_route": memory.last_route,
        "last_urls": memory.last_urls[-8:],
        "last_files": memory.last_files[-8:],
        "updated_at": memory.updated_at,
    }
