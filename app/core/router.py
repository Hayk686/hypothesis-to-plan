from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.core.command_registry import cleanup_from_result
from app.core.model_orchestrator import llm_kwargs_for_role, role_temperature
from app.core.tool_registry import ToolContext, ToolRegistry
from app.core.types import Outgoing


URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
AUDIO_FORMAT_RE = re.compile(r"\b(mp3|m4a|wav|flac|opus|aac|alac|vorbis|ogg|best)\b", re.IGNORECASE)
ORCHESTRATOR_CONFIDENCE_THRESHOLD = 0.55
ORCHESTRATOR_ROLES = {"chat", "research", "coder", "writer", "critic", "controller"}
ORCHESTRATOR_SCHEMA = {
    "type": "object",
    "properties": {
        "role": {"type": "string", "enum": ["chat", "research", "coder", "writer", "critic", "controller"]},
        "confidence": {"type": "number"},
        "needs_tools": {"type": "boolean"},
        "needs_critic": {"type": "boolean"},
        "reason": {"type": "string"},
    },
    "required": ["role", "confidence", "needs_tools", "needs_critic", "reason"],
}


@dataclass(frozen=True)
class TextRoutePlan:
    action: str
    reason: str
    command_text: str = ""
    role: str = "chat"
    confidence: float = 0.5
    needs_tools: bool = False
    needs_critic: bool = False


def route_text(root: Path, text: str, registry: ToolRegistry, context: ToolContext, commands: Any) -> Outgoing:
    plan = plan_text_route(text)
    if should_ask_orchestrator(text, plan):
        plan = orchestrator_route(text, registry, context, fallback=plan)
    context.metadata["route_action"] = plan.action
    context.metadata["route_reason"] = plan.reason
    context.metadata["selected_role"] = plan.role
    context.metadata["orchestration"] = {
        "role": plan.role,
        "confidence": plan.confidence,
        "needs_tools": plan.needs_tools,
        "needs_critic": plan.needs_critic,
        "reason": plan.reason,
    }
    log_router_step(context, plan)

    if plan.action in {"download_audio", "research", "fetch"}:
        return commands.run(plan.command_text, root, registry, context)
    return commands.run(text, root, registry, context)


def plan_text_route(text: str) -> TextRoutePlan:
    stripped = text.strip()
    if not stripped:
        return TextRoutePlan(action="chat", reason="empty text", role="chat", confidence=1.0)

    urls = extract_urls(stripped)
    lowered = stripped.lower()

    if urls and download_audio_intent(lowered, stripped, urls):
        return TextRoutePlan(
            action="download_audio",
            reason="audio download intent with URL",
            command_text=f"/dl {stripped}",
            role="writer",
            confidence=0.96,
            needs_tools=True,
        )

    if urls and fetch_intent(lowered):
        return TextRoutePlan(
            action="fetch",
            reason="fetch/read URL intent",
            command_text=f"/fetch {urls[0]}",
            role="research",
            confidence=0.88,
            needs_tools=True,
        )

    if research_intent(lowered):
        return TextRoutePlan(
            action="research",
            reason="web/current information intent",
            command_text=f"/research {stripped}",
            role="research",
            confidence=0.9,
            needs_tools=True,
            needs_critic=True,
        )

    if critic_intent(lowered) and not fix_or_implement_intent(lowered):
        return TextRoutePlan(
            action="chat",
            reason="review/quality-check intent",
            role="critic",
            confidence=0.82,
            needs_critic=False,
        )

    if coding_intent(lowered):
        return TextRoutePlan(
            action="chat",
            reason="coding/technical intent",
            role="coder",
            confidence=0.82,
            needs_tools=project_change_intent(lowered),
            needs_critic=True,
        )

    if writing_intent(lowered):
        return TextRoutePlan(
            action="chat",
            reason="writing/translation intent",
            role="writer",
            confidence=0.78,
            needs_critic=True,
        )

    if ambiguous_action_intent(lowered):
        return TextRoutePlan(action="chat", reason="ambiguous action intent", role="chat", confidence=0.42)

    return TextRoutePlan(action="chat", reason="default chat", role="chat", confidence=0.72)


def should_ask_orchestrator(text: str, plan: TextRoutePlan) -> bool:
    if plan.confidence >= ORCHESTRATOR_CONFIDENCE_THRESHOLD:
        return False
    if plan.action != "chat":
        return False
    lowered = text.strip().lower()
    return ambiguous_action_intent(lowered)


def orchestrator_route(
    text: str,
    registry: ToolRegistry,
    context: ToolContext,
    *,
    fallback: TextRoutePlan,
) -> TextRoutePlan:
    system = (
        "You are a cheap router for a local Telegram agent. Do not solve the user's task. "
        "Return only valid JSON matching the schema. Choose exactly one role. "
        "Use controller only for clearly multi-step work that must coordinate multiple roles. "
        "Use research only when current/web/source information is needed. "
        "Use coder for code/project/debug/implementation. Use writer for translation, rewriting, PDF/DOCX text. "
        "Use critic for review/check/improve/error-finding tasks. Otherwise use chat."
    )
    prompt = (
        "Classify this user message for routing. Return JSON only.\n\n"
        f"User message:\n{text}\n\n"
        "Fields: role, confidence, needs_tools, needs_critic, reason."
    )
    result = registry.run(
        "llm_chat",
        context,
        prompt=prompt,
        system=system,
        temperature=role_temperature(context.config, "orchestrator", 0.0),
        json_schema=ORCHESTRATOR_SCHEMA,
        **llm_kwargs_for_role(context.config, "orchestrator"),
    )
    if not result.ok:
        log_orchestrator_fallback(context, fallback, result.message)
        return fallback

    decision = parse_json_object(result.message)
    if not decision:
        log_orchestrator_fallback(context, fallback, "invalid json")
        return fallback

    role = str(decision.get("role", fallback.role)).strip().lower()
    if role not in ORCHESTRATOR_ROLES:
        role = fallback.role
    confidence = clamp_float(decision.get("confidence"), fallback.confidence)
    needs_tools = bool(decision.get("needs_tools", fallback.needs_tools))
    needs_critic = bool(decision.get("needs_critic", fallback.needs_critic))
    reason = str(decision.get("reason") or fallback.reason).strip() or fallback.reason

    action = "chat"
    command_text = ""
    if role == "research" and needs_tools:
        action = "research"
        command_text = f"/research {text.strip()}"

    plan = TextRoutePlan(
        action=action,
        reason=f"orchestrator: {reason}",
        command_text=command_text,
        role=role,
        confidence=confidence,
        needs_tools=needs_tools,
        needs_critic=needs_critic,
    )
    log_orchestrator_decision(context, plan, result.raw)
    return plan


def route_document(root: Path, path: Path, caption: str, registry: ToolRegistry, context: ToolContext) -> Outgoing:
    ext = path.suffix.lower()
    caption_l = caption.lower()

    if ext in {".doc", ".docx"} and ("pdf" in caption_l or "пдф" in caption_l):
        result = registry.run("convert_docx_to_pdf", context, path=path)
    elif ext == ".pdf" and any(word in caption_l for word in ("doc", "docx", "word", "докс", "ворд")):
        result = registry.run("convert_pdf_to_docx", context, path=path)
    else:
        return Outgoing(text=f"File received: {path.name}")

    if result.ok:
        context.metadata["artifact"] = {
            "kind": "document",
            "title": f"{path.name} conversion",
            "text": result.message,
            "files": result.files,
            "metadata": {"input": str(path), "extension": ext},
        }
        return Outgoing(text=result.message, files=result.files, cleanup_files=cleanup_from_result(root, result.files, result.raw))
    return Outgoing(text=result.message or "Document conversion failed.")


def extract_urls(text: str) -> list[str]:
    return [url.rstrip(".,;)") for url in URL_RE.findall(text)]


def download_audio_intent(lowered: str, original: str, urls: list[str]) -> bool:
    non_url_text = URL_RE.sub(" ", original).strip()
    tokens = [token for token in non_url_text.split() if token.strip()]
    if not tokens:
        return len(urls) == 1 and any(media_domain(url) for url in urls)
    if len(tokens) == 1 and AUDIO_FORMAT_RE.fullmatch(tokens[0]):
        return True
    if AUDIO_FORMAT_RE.search(non_url_text) and all(media_domain(url) for url in urls):
        return True

    markers = (
        "скачай",
        "скачать",
        "загрузи",
        "загрузить",
        "download",
        "save audio",
        "песня",
        "песню",
        "песни",
        "трек",
        "треки",
        "музык",
        "аудио",
        "mp3",
        "m4a",
        "flac",
        "wav",
        "song",
        "music",
        "audio",
    )
    return any(marker in lowered for marker in markers)


def media_domain(url: str) -> bool:
    lowered = url.lower()
    domains = (
        "youtube.com",
        "youtu.be",
        "soundcloud.com",
        "music.youtube.com",
        "spotify.com",
        "bandcamp.com",
        "vimeo.com",
        "tiktok.com",
        "instagram.com",
    )
    return any(domain in lowered for domain in domains)


def fetch_intent(lowered: str) -> bool:
    markers = (
        "прочитай",
        "открой",
        "fetch",
        "read this",
        "read page",
        "summarize this page",
        "суммируй страницу",
        "кратко страницу",
    )
    return any(marker in lowered for marker in markers)


def research_intent(lowered: str) -> bool:
    markers = (
        "найди",
        "поищи",
        "поиск",
        "погугли",
        "в интернете",
        "в сети",
        "свеж",
        "актуаль",
        "последн",
        "новост",
        "сегодня",
        "сейчас",
        "курс",
        "цена",
        "стоимость",
        "расписание",
        "ссылк",
        "источник",
        "search",
        "find",
        "look up",
        "google",
        "web",
        "internet",
        "latest",
        "current",
        "news",
        "today",
        "price",
        "schedule",
        "source",
    )
    return any(marker in lowered for marker in markers)


def coding_intent(lowered: str) -> bool:
    markers = (
        "code",
        "coding",
        "program",
        "script",
        "function",
        "class",
        "bug",
        "fix",
        "refactor",
        "implement",
        "python",
        "javascript",
        "typescript",
        "react",
        "fastapi",
        "код",
        "кодинг",
        "скрипт",
        "функц",
        "баг",
        "ошибк",
        "почини",
        "исправь",
        "рефактор",
        "реализуй",
    )
    return any(marker in lowered for marker in markers)


def critic_intent(lowered: str) -> bool:
    markers = (
        "review",
        "check",
        "critic",
        "improve",
        "quality",
        "errors",
        "mistakes",
        "проверь",
        "проверка",
        "улучши",
        "ошибки",
        "ошибок",
        "качество",
        "ревью",
    )
    return any(marker in lowered for marker in markers)


def fix_or_implement_intent(lowered: str) -> bool:
    markers = (
        "fix",
        "implement",
        "change",
        "modify",
        "patch",
        "почини",
        "исправь",
        "сделай",
        "реализуй",
        "измени",
        "поменяй",
    )
    return any(marker in lowered for marker in markers)


def project_change_intent(lowered: str) -> bool:
    markers = (
        "modify project",
        "edit project",
        "change code",
        "apply patch",
        "make changes",
        "in repo",
        "in the project",
        "измени код",
        "поменяй код",
        "в проекте",
        "в репо",
        "делай",
    )
    return any(marker in lowered for marker in markers)


def writing_intent(lowered: str) -> bool:
    markers = (
        "translate",
        "rewrite",
        "summarize",
        "summary",
        "docx",
        "pdf",
        "document",
        "переведи",
        "перевод",
        "перепиши",
        "суммир",
        "кратко",
        "коротко",
        "докс",
        "документ",
        "թարգմանի",
    )
    return any(marker in lowered for marker in markers)


def ambiguous_action_intent(lowered: str) -> bool:
    markers = (
        "сделай",
        "нужно",
        "надо",
        "можешь",
        "давай",
        "разбер",
        "помоги",
        "как лучше",
        "что лучше",
        "создай",
        "настрой",
        "добавь",
        "убери",
        "продолжи",
        "do it",
        "make it",
        "can you",
        "help me",
        "set up",
        "create",
        "add",
        "remove",
        "continue",
    )
    return any(marker in lowered for marker in markers)


def parse_json_object(text: str) -> dict[str, Any] | None:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
        stripped = re.sub(r"\s*```$", "", stripped)
    try:
        data = json.loads(stripped)
    except Exception:
        start = stripped.find("{")
        end = stripped.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            data = json.loads(stripped[start : end + 1])
        except Exception:
            return None
    return data if isinstance(data, dict) else None


def clamp_float(value: Any, fallback: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return fallback
    return max(0.0, min(1.0, number))


def log_router_step(context: ToolContext, plan: TextRoutePlan) -> None:
    task_logger = getattr(context, "logger", None)
    json_logger = getattr(task_logger, "logger", None)
    if json_logger:
        json_logger.event(
            "router_planned",
            task_id=context.task_id,
            action=plan.action,
            role=plan.role,
            confidence=plan.confidence,
            needs_tools=plan.needs_tools,
            needs_critic=plan.needs_critic,
            reason=plan.reason,
            command_text=plan.command_text,
        )


def log_orchestrator_decision(context: ToolContext, plan: TextRoutePlan, raw: dict[str, Any]) -> None:
    task_logger = getattr(context, "logger", None)
    json_logger = getattr(task_logger, "logger", None)
    if json_logger:
        json_logger.event(
            "orchestrator_decision",
            task_id=context.task_id,
            role=plan.role,
            confidence=plan.confidence,
            needs_tools=plan.needs_tools,
            needs_critic=plan.needs_critic,
            reason=plan.reason,
            provider=raw.get("provider", ""),
            model=raw.get("model", ""),
        )


def log_orchestrator_fallback(context: ToolContext, fallback: TextRoutePlan, reason: str) -> None:
    task_logger = getattr(context, "logger", None)
    json_logger = getattr(task_logger, "logger", None)
    if json_logger:
        json_logger.event(
            "orchestrator_fallback",
            task_id=context.task_id,
            role=fallback.role,
            confidence=fallback.confidence,
            reason=reason,
        )
