from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.types import IncomingMessage, Outgoing


MAX_ARTIFACTS = 40
MAX_TEXT_CHARS = 24_000
MAX_ARTIFACT_CONTEXT_CHARS = 8_000
MAX_SUMMARY_CHARS = 220
SECRET_PATTERNS = (
    re.compile(r"\bnvapi-[A-Za-z0-9_-]+"),
    re.compile(r"\bsk-[A-Za-z0-9_-]+"),
    re.compile(r"(?i)\b(api[_ -]?key|token|password|secret)\b\s*[:=]?\s*\S+"),
)
REFERENCE_MARKERS = (
    "this",
    "that",
    "it",
    "same",
    "previous",
    "last",
    "above",
    "translate",
    "rewrite",
    "summarize",
    "convert",
    "export",
    "это",
    "этот",
    "эту",
    "эти",
    "того",
    "тот",
    "та же",
    "так же",
    "предыдущ",
    "последн",
    "переведи",
    "перевод",
    "сделай",
    "сохрани",
    "конверт",
    "դա",
    "այս",
    "նույն",
    "նախորդ",
    "թարգմանի",
)


@dataclass
class Artifact:
    id: str
    kind: str
    title: str
    text: str = ""
    files: list[str] = field(default_factory=list)
    urls: list[str] = field(default_factory=list)
    route: str = ""
    metadata: dict[str, Any] = field(default_factory=dict)
    created_at: str = ""


class ArtifactStore:
    def __init__(self, state_dir: Path):
        self.path = state_dir / "artifacts.json"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._data = self._load()

    def add(
        self,
        key: str,
        *,
        kind: str,
        title: str,
        text: str = "",
        files: list[Path | str] | None = None,
        urls: list[str] | None = None,
        route: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> Artifact:
        bucket = self._bucket(key)
        artifact_id = str(int(bucket.get("next_id", 1)))
        bucket["next_id"] = int(bucket.get("next_id", 1)) + 1

        artifact = Artifact(
            id=artifact_id,
            kind=normalize_kind(kind),
            title=clean_title(title) or fallback_title(kind, text, files or []),
            text=truncate_text(text),
            files=normalize_files(files or []),
            urls=dedupe_keep_last([sanitize_text(url) for url in urls or []], limit=12),
            route=route,
            metadata=json_safe(metadata or {}),
            created_at=datetime.now(timezone.utc).isoformat(),
        )

        items = [artifact_to_dict(item) for item in self._items(bucket)]
        items.append(artifact_to_dict(artifact))
        bucket["items"] = items[-MAX_ARTIFACTS:]
        bucket["active_id"] = artifact.id
        self._data[key] = bucket
        self._save()
        return artifact

    def record_turn(
        self,
        key: str,
        message: IncomingMessage,
        outgoing: Outgoing,
        *,
        route: str = "",
        metadata: dict[str, Any] | None = None,
    ) -> Artifact | None:
        metadata = metadata or {}
        spec = metadata.get("artifact")
        if isinstance(spec, dict):
            return self.add(
                key,
                kind=str(spec.get("kind") or route or "result"),
                title=str(spec.get("title") or title_from_message(message, route)),
                text=str(spec.get("text") or outgoing.text or ""),
                files=list(spec.get("files") or outgoing.files),
                urls=list(spec.get("urls") or extract_urls(message.text)),
                route=route,
                metadata=dict(spec.get("metadata") or {}),
            )

        if outgoing.files:
            return self.add(
                key,
                kind=route or "file",
                title=title_from_files(outgoing.files, route),
                text=outgoing.text,
                files=outgoing.files,
                urls=extract_urls(message.text),
                route=route,
            )

        if route in {"ask", "chat"} and len(outgoing.text.strip()) >= 300:
            return self.add(
                key,
                kind="answer",
                title=title_from_message(message, route),
                text=outgoing.text,
                urls=extract_urls(message.text),
                route=route,
            )

        return None

    def context_for(self, key: str, query: str = "") -> str:
        bucket = self._bucket(key)
        items = self._items(bucket)
        if not items:
            return ""

        lines = ["Saved artifacts from this chat:"]
        for item in items[-6:]:
            bits = [f"#{item.id}", item.kind]
            if item.title:
                bits.append(item.title)
            if item.urls:
                bits.append("urls: " + ", ".join(item.urls[:3]))
            if item.files:
                bits.append("files: " + ", ".join(Path(path).name for path in item.files[:3]))
            preview = one_line(item.text)
            if preview:
                bits.append("preview: " + preview[:MAX_SUMMARY_CHARS])
            lines.append("- " + " | ".join(bits))

        active = self._active_or_latest(bucket)
        if active:
            lines.append(f"Active artifact: #{active.id} {active.kind} | {active.title}")

        if active and should_include_full_artifact(query):
            lines.append(
                "Full active artifact text follows. Use it when the user refers to this/previous/last result:"
            )
            lines.append(active.text or file_only_text(active))

        context = "\n".join(line for line in lines if line).strip()
        if len(context) > MAX_ARTIFACT_CONTEXT_CHARS:
            context = context[:MAX_ARTIFACT_CONTEXT_CHARS].rstrip() + "..."
        return context

    def list_text(self, key: str) -> str:
        items = self._items(self._bucket(key))
        if not items:
            return "Пока нет сохраненных результатов."

        lines = ["Сохраненные результаты:"]
        for item in reversed(items[-12:]):
            title = item.title or "без названия"
            extra = []
            if item.files:
                extra.append(", ".join(Path(path).name for path in item.files[:2]))
            if item.urls:
                extra.append(", ".join(item.urls[:2]))
            suffix = f" ({'; '.join(extra)})" if extra else ""
            lines.append(f"#{item.id} {item.kind}: {title}{suffix}")
        lines.append("Команда /use <id> выбирает результат для следующих сообщений.")
        return "\n".join(lines)

    def show_text(self, key: str, ref: str = "") -> str:
        item = self.resolve(key, ref)
        if not item:
            return "Не нашел такой результат."

        parts = [f"#{item.id} {item.kind}: {item.title}"]
        if item.urls:
            parts.append("URLs:\n" + "\n".join(item.urls))
        if item.files:
            parts.append("Files:\n" + "\n".join(Path(path).name for path in item.files))
        if item.text:
            parts.append(item.text)
        return "\n\n".join(parts).strip()

    def set_active(self, key: str, ref: str) -> Artifact | None:
        item = self.resolve(key, ref)
        if not item:
            return None
        bucket = self._bucket(key)
        bucket["active_id"] = item.id
        self._data[key] = bucket
        self._save()
        return item

    def resolve(self, key: str, ref: str = "") -> Artifact | None:
        bucket = self._bucket(key)
        items = self._items(bucket)
        if not items:
            return None

        ref = ref.strip().lstrip("#").lower()
        if not ref or ref in {"last", "latest", "последний", "последнее"}:
            return self._active_or_latest(bucket)
        for item in items:
            if item.id == ref:
                return item
        return None

    def clear(self, key: str) -> None:
        if key in self._data:
            del self._data[key]
            self._save()

    def _bucket(self, key: str) -> dict[str, Any]:
        value = self._data.get(key)
        if isinstance(value, dict):
            return value
        return {"next_id": 1, "active_id": "", "items": []}

    def _items(self, bucket: dict[str, Any]) -> list[Artifact]:
        values = bucket.get("items", [])
        if not isinstance(values, list):
            return []
        return [artifact_from_dict(item) for item in values if isinstance(item, dict)][-MAX_ARTIFACTS:]

    def _active_or_latest(self, bucket: dict[str, Any]) -> Artifact | None:
        items = self._items(bucket)
        if not items:
            return None
        active_id = str(bucket.get("active_id", ""))
        for item in reversed(items):
            if item.id == active_id:
                return item
        return items[-1]

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


def with_artifact_context(system_prompt: str, artifact_context: str) -> str:
    artifact_context = artifact_context.strip()
    if not artifact_context:
        return system_prompt
    return (
        system_prompt.rstrip()
        + "\n\nArtifact context. These are saved results from this chat. Use them when the user refers to "
        "the previous result, active artifact, files, links, or asks to translate/rewrite/convert 'this'. "
        "Do not mention artifact ids unless useful.\n"
        + artifact_context
    )


def should_include_full_artifact(query: str) -> bool:
    lowered = query.lower()
    if not lowered.strip():
        return False
    if first_command(lowered) in {"last", "use", "artifacts"}:
        return False
    return any(marker in lowered for marker in REFERENCE_MARKERS)


def title_from_message(message: IncomingMessage, route: str) -> str:
    text = re.sub(r"\s+", " ", message.text.strip())
    text = re.sub(r"^/\w+(?:@\w+)?\s*", "", text)
    if text:
        return text[:120]
    if message.attachments:
        return ", ".join(attachment.filename or attachment.path.name for attachment in message.attachments[:3])
    return route or "result"


def title_from_files(files: list[Path], route: str) -> str:
    names = [Path(path).name for path in files[:3]]
    return f"{route or 'file'}: " + ", ".join(names)


def fallback_title(kind: str, text: str, files: list[Path | str]) -> str:
    if files:
        return ", ".join(Path(path).name for path in files[:3])
    preview = one_line(text)
    return preview[:120] if preview else kind or "result"


def file_only_text(item: Artifact) -> str:
    if not item.files:
        return ""
    return "Files: " + ", ".join(Path(path).name for path in item.files)


def extract_urls(text: str) -> list[str]:
    return dedupe_keep_last(
        [sanitize_text(url.rstrip(".,;)")) for url in re.findall(r"https?://\S+", text, re.IGNORECASE)],
        limit=12,
    )


def normalize_files(files: list[Path | str]) -> list[str]:
    return dedupe_keep_last([str(path) for path in files if str(path).strip()], limit=12)


def normalize_kind(kind: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9_-]+", "_", kind.strip().lower())
    return value or "result"


def clean_title(title: str) -> str:
    return one_line(sanitize_text(title))[:160]


def truncate_text(text: str) -> str:
    text = sanitize_text(text).strip()
    if len(text) <= MAX_TEXT_CHARS:
        return text
    return text[: MAX_TEXT_CHARS - 3].rstrip() + "..."


def sanitize_text(text: str) -> str:
    for pattern in SECRET_PATTERNS:
        text = pattern.sub("<redacted>", text)
    return text


def one_line(text: str) -> str:
    return re.sub(r"\s+", " ", sanitize_text(text)).strip()


def dedupe_keep_last(values: list[str], limit: int) -> list[str]:
    result = []
    seen = set()
    for value in reversed(values):
        marker = value.lower()
        if not marker or marker in seen:
            continue
        seen.add(marker)
        result.append(value)
    return list(reversed(result))[-limit:]


def json_safe(value: dict[str, Any]) -> dict[str, Any]:
    return json.loads(json.dumps(value, ensure_ascii=False, default=str))


def artifact_to_dict(artifact: Artifact) -> dict[str, Any]:
    return {
        "id": artifact.id,
        "kind": artifact.kind,
        "title": artifact.title,
        "text": artifact.text,
        "files": artifact.files,
        "urls": artifact.urls,
        "route": artifact.route,
        "metadata": artifact.metadata,
        "created_at": artifact.created_at,
    }


def artifact_from_dict(value: dict[str, Any]) -> Artifact:
    return Artifact(
        id=str(value.get("id", "")),
        kind=str(value.get("kind", "result")),
        title=str(value.get("title", "")),
        text=str(value.get("text", "")),
        files=[str(item) for item in value.get("files", []) if str(item).strip()],
        urls=[str(item) for item in value.get("urls", []) if str(item).strip()],
        route=str(value.get("route", "")),
        metadata=dict(value.get("metadata", {})) if isinstance(value.get("metadata"), dict) else {},
        created_at=str(value.get("created_at", "")),
    )


def first_command(text: str) -> str:
    token = text.strip().split(maxsplit=1)[0] if text.strip().startswith("/") else ""
    return token.lower().lstrip("/").split("@", 1)[0]
