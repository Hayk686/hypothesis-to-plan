from __future__ import annotations

import json
import re
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


@dataclass
class DialogueDecision:
    text: str
    changed: bool = False
    reason: str = ""
    state: dict[str, Any] | None = None


@dataclass
class DialogueState:
    active_entity: str = ""
    last_goal: str = ""
    pending_action: str = ""
    pending_target: str = ""
    waiting_for: str = ""
    updated_at: str = ""


class DialogueStateStore:
    def __init__(self, state_dir: Path):
        self.path = state_dir / "dialogue_state.json"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._data = self._load()

    def resolve(self, key: str, text: str, memory_context: str = "") -> DialogueDecision:
        original = text
        text = text.strip()
        if not text:
            return DialogueDecision(text=original)

        state = self._state(key)
        if memory_context:
            state = hydrate_from_memory(state, memory_context)
        command = first_command(text)
        if command and command not in {"ask", "research", "search"}:
            return DialogueDecision(text=original, state=state_to_dict(state))

        if is_rejection(text) and state.pending_action:
            self._clear_pending(key, state)
            return DialogueDecision(text=original, reason="rejected_pending_action", state=state_to_dict(state))

        if is_confirmation(text) and state.pending_action == "research" and state.pending_target:
            resolved = f"/research {state.pending_target}"
            return DialogueDecision(
                text=resolved,
                changed=True,
                reason="confirmed_pending_research",
                state=state_to_dict(state),
            )

        if weak_reference_research(text) and state.active_entity:
            resolved = f"/research {state.active_entity}"
            return DialogueDecision(
                text=resolved,
                changed=True,
                reason="resolved_research_reference",
                state=state_to_dict(state),
            )

        return DialogueDecision(text=original, state=state_to_dict(state))

    def record_turn(self, key: str, user_text: str, effective_text: str, assistant_text: str, route: str) -> None:
        state = self._state(key)
        now = datetime.now(timezone.utc).isoformat()

        entity = extract_entity(user_text) or extract_entity(effective_text)
        if entity:
            state.active_entity = entity

        goal = infer_goal(user_text, effective_text, route)
        if goal:
            state.last_goal = goal

        if route in {"research", "search"} or first_command(effective_text) in {"research", "search"}:
            state.pending_action = ""
            state.pending_target = ""
            state.waiting_for = ""

        pending_target = pending_search_target(user_text, assistant_text, state.active_entity)
        if pending_target:
            state.pending_action = "research"
            state.pending_target = pending_target
            state.waiting_for = "confirmation"

        state.updated_at = now
        self._data[key] = state_to_dict(state)
        self._save()

    def clear(self, key: str) -> None:
        if key in self._data:
            del self._data[key]
            self._save()

    def _clear_pending(self, key: str, state: DialogueState) -> None:
        state.pending_action = ""
        state.pending_target = ""
        state.waiting_for = ""
        state.updated_at = datetime.now(timezone.utc).isoformat()
        self._data[key] = state_to_dict(state)
        self._save()

    def _state(self, key: str) -> DialogueState:
        value = self._data.get(key)
        if not isinstance(value, dict):
            return DialogueState()
        return DialogueState(
            active_entity=str(value.get("active_entity", "")),
            last_goal=str(value.get("last_goal", "")),
            pending_action=str(value.get("pending_action", "")),
            pending_target=str(value.get("pending_target", "")),
            waiting_for=str(value.get("waiting_for", "")),
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


def first_command(text: str) -> str:
    text = text.strip()
    if not text.startswith("/"):
        return ""
    return text[1:].split(maxsplit=1)[0].split("@", 1)[0].lower()


def is_confirmation(text: str) -> bool:
    normalized = normalize(text)
    confirmations = {
        "да",
        "ага",
        "угу",
        "ок",
        "okay",
        "yes",
        "y",
        "go",
        "сделай",
        "ищи",
        "найди",
        "поиск",
        "research",
        "դա",
        "այո",
    }
    if normalized in confirmations:
        return True
    return normalized.startswith(("да ", "ок ", "yes ", "go ")) and any(
        marker in normalized for marker in ("найди", "ищи", "search", "find", "research")
    )


def is_rejection(text: str) -> bool:
    normalized = normalize(text)
    return normalized in {"нет", "не надо", "не нужно", "отмена", "cancel", "no", "stop"}


def weak_reference_research(text: str) -> bool:
    lowered = normalize(text)
    if first_command(lowered):
        lowered = command_args(lowered)
    references = ("его", "ее", "её", "это", "этого", "ней", "нем", "him", "her", "it", "that")
    research = ("найди", "поищи", "поиск", "искать", "research", "search", "find", "look up")
    words = set(lowered.split())
    return any(marker in lowered for marker in research) and any(ref in words for ref in references)


def pending_search_target(user_text: str, assistant_text: str, active_entity: str) -> str:
    if not active_entity:
        active_entity = extract_entity(user_text)
    if not active_entity:
        return ""

    lowered = normalize(assistant_text)
    pending_markers = (
        "могу поискать",
        "могу найти",
        "использовать /research",
        "нужна свежая информация",
        "нужен интернет",
        "поискать в интернете",
        "search the web",
        "look it up",
    )
    if any(marker in lowered for marker in pending_markers):
        return active_entity
    if any(marker in lowered for marker in ("поискать", "найти", "search", "look up")) and any(
        marker in lowered for marker in ("интернет", "web", "online")
    ):
        return active_entity
    return ""


def hydrate_from_memory(state: DialogueState, memory_context: str) -> DialogueState:
    if state.active_entity and state.pending_action:
        return state

    pairs = recent_memory_pairs(memory_context)
    for user_text, assistant_text in reversed(pairs):
        entity = extract_entity(user_text)
        if entity and not state.active_entity:
            state.active_entity = entity

        pending_target = pending_search_target(user_text, assistant_text, entity or state.active_entity)
        if pending_target and not state.pending_action:
            state.active_entity = pending_target
            state.pending_action = "research"
            state.pending_target = pending_target
            state.waiting_for = "confirmation"
            break

    return state


def recent_memory_pairs(memory_context: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    last_user = ""
    for line in memory_context.splitlines():
        if line.startswith("- user:"):
            last_user = line.split(":", 1)[1].strip()
            continue
        if line.startswith("- assistant:") and last_user:
            assistant = line.split(":", 1)[1].strip()
            pairs.append((last_user, assistant))
            last_user = ""
    return pairs


def infer_goal(user_text: str, effective_text: str, route: str) -> str:
    lowered = normalize(" ".join([user_text, effective_text]))
    if route in {"research", "search"} or any(marker in lowered for marker in ("найди", "поищи", "research", "search", "find")):
        return "research"
    if any(marker in lowered for marker in ("кто такой", "что такое", "who is", "what is")):
        return "identify"
    return ""


def extract_entity(text: str) -> str:
    text = repair_mojibake(text)
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""

    quoted = re.search(r"[\"'«“]([^\"'»”]{3,160})[\"'»”]", text)
    if quoted:
        return clean_entity(quoted.group(1))

    triggered = extract_after_trigger(text)
    if triggered:
        return triggered

    latin = re.search(
        r"\b[A-Z][A-Za-z0-9._-]+(?:\s+[A-Z][A-Za-z0-9._-]+){1,8}(?:\s+[a-z][A-Za-z0-9._-]+){0,6}",
        text,
    )
    if latin:
        return clean_entity(latin.group(0))

    return ""


def extract_after_trigger(text: str) -> str:
    patterns = (
        r"(?i)\bкто\s+такой\s+(.+)",
        r"(?i)\bкто\s+такая\s+(.+)",
        r"(?i)\bчто\s+такое\s+(.+)",
        r"(?i)\bнайди\s+(?:информацию\s+)?(?:в\s+интернете\s+)?(?:про\s+|о\s+|об\s+|about\s+)?(.+)",
        r"(?i)\bпоищи\s+(?:информацию\s+)?(?:про\s+|о\s+|об\s+|about\s+)?(.+)",
        r"(?i)\bпро\s+(.+)",
        r"(?i)\babout\s+(.+)",
        r"(?i)\bwho\s+is\s+(.+)",
        r"(?i)\bwhat\s+is\s+(.+)",
        r"(?i)\bfind\s+(?:information\s+)?(?:about\s+)?(.+)",
        r"(?i)\bsearch\s+(?:for\s+)?(.+)",
    )
    for pattern in patterns:
        match = re.search(pattern, text)
        if not match:
            continue
        entity = clean_entity(match.group(1))
        if entity and not is_weak_entity(entity):
            return entity
    return ""


def clean_entity(value: str) -> str:
    value = re.sub(r"https?://\S+", " ", value)
    value = re.sub(
        r"(?i)\b(его|ее|её|это|этого|him|her|it|that|please|пожалуйста|так|найди|поищи|поиск)\b",
        " ",
        value,
    )
    value = re.sub(r"\s+", " ", value).strip(" ,.!?:;()[]{}")
    if 3 <= len(value) <= 160:
        return value
    return ""


def is_weak_entity(value: str) -> bool:
    normalized = normalize(value)
    weak = {"его", "ее", "её", "это", "этого", "him", "her", "it", "that", "информацию", "information"}
    return normalized in weak


def command_args(text: str) -> str:
    text = text.strip()
    if not text.startswith("/"):
        return text
    parts = text.split(maxsplit=1)
    return parts[1] if len(parts) > 1 else ""


def normalize(text: str) -> str:
    text = repair_mojibake(text)
    text = text.strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text.strip(" .,!?:;")


def repair_mojibake(text: str) -> str:
    if "Ð" not in text and "Ñ" not in text and "â" not in text:
        return text
    for encoding in ("cp1252", "latin1"):
        try:
            repaired = text.encode(encoding).decode("utf-8")
        except UnicodeError:
            continue
        if cyrillic_score(repaired) > cyrillic_score(text):
            return repaired
    return text


def cyrillic_score(text: str) -> int:
    return sum(1 for char in text if "а" <= char.lower() <= "я" or char.lower() == "ё")


def state_to_dict(state: DialogueState) -> dict[str, Any]:
    return asdict(state)
