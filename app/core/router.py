from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.core.command_registry import cleanup_from_result
from app.core.model_orchestrator import llm_kwargs_for_role, role_temperature
from app.core.role_prompts import role_system_prompt
from app.core.tool_registry import ToolContext, ToolRegistry
from app.core.types import Outgoing


URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
AUDIO_FORMAT_RE = re.compile(r"\b(mp3|m4a|wav|flac|opus|aac|alac|vorbis|ogg|best)\b", re.IGNORECASE)
ORCHESTRATOR_CONFIDENCE_THRESHOLD = 0.55
ORCHESTRATOR_ROLES = {"chat", "research", "coder", "writer", "controller"}
ORCHESTRATOR_SCHEMA = {
    "type": "object",
    "properties": {
        "role": {"type": "string", "enum": ["chat", "research", "coder", "writer", "controller"]},
        "confidence": {"type": "number"},
        "needs_tools": {"type": "boolean"},
        "reason": {"type": "string"},
        "suggested_next_step": {"type": "string"},
    },
    "required": ["role", "confidence", "needs_tools", "reason"],
}


@dataclass(frozen=True)
class TextRoutePlan:
    action: str
    reason: str
    command_text: str = ""
    role: str = "chat"
    confidence: float = 0.5
    needs_tools: bool = False
    suggested_next_step: str = ""


def route_text(root: Path, text: str, registry: ToolRegistry, context: ToolContext, commands: Any) -> Outgoing:
    plan = plan_text_route(text, context)
    if should_ask_orchestrator(text, plan):
        plan = orchestrator_route(text, registry, context, fallback=plan)
    context.metadata["route_action"] = plan.action
    context.metadata["route_reason"] = plan.reason
    context.metadata["selected_role"] = plan.role
    context.metadata["orchestration"] = {
        "role": plan.role,
        "confidence": plan.confidence,
        "needs_tools": plan.needs_tools,
        "reason": plan.reason,
        "suggested_next_step": plan.suggested_next_step,
    }
    log_router_step(context, plan)

    if plan.action in {"download_audio", "research", "fetch", "browser", "verify_url"}:
        return commands.run(plan.command_text, root, registry, context)
    return commands.run(text, root, registry, context)


def plan_text_route(text: str, context: ToolContext | None = None) -> TextRoutePlan:
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

    if urls and url_verification_intent(lowered, context):
        return TextRoutePlan(
            action="verify_url",
            reason="URL follow-up verification against active research",
            command_text=f"/verify {urls[0]}",
            role="research",
            confidence=0.9,
            needs_tools=True,
            suggested_next_step="Fetch the URL and compare it with the active research requirements.",
        )

    if urls and fetch_intent(lowered) and not browser_intent(lowered):
        return TextRoutePlan(
            action="fetch",
            reason="fetch/read URL intent",
            command_text=f"/fetch {urls[0]}",
            role="research",
            confidence=0.88,
            needs_tools=True,
        )

    if urls and browser_intent(lowered):
        return TextRoutePlan(
            action="browser",
            reason="browser page intent with URL",
            command_text=f"/browser {stripped}",
            role="research",
            confidence=0.88,
            needs_tools=True,
        )

    if not urls and browser_followup_intent(lowered):
        url = latest_context_url(context)
        if url:
            return TextRoutePlan(
                action="browser",
                reason="browser follow-up using last URL",
                command_text=f"/browser {url}",
                role="research",
                confidence=0.9,
                needs_tools=True,
                suggested_next_step="Open the most recent URL from chat context in browser_read.",
            )

    if search_strategy_question(lowered):
        return TextRoutePlan(
            action="chat",
            reason="search strategy question, not an immediate web search",
            role="chat",
            confidence=0.86,
            needs_tools=False,
        )

    if artifact_followup_intent(lowered) and not force_web_intent(lowered):
        return TextRoutePlan(
            action="chat",
            reason="active artifact follow-up intent",
            role="chat",
            confidence=0.87 if active_artifact_available(context) else 0.76,
            needs_tools=False,
            suggested_next_step="Answer from the active artifact/context instead of starting a new web search.",
        )

    if research_intent(lowered):
        return TextRoutePlan(
            action="research",
            reason="web/current information intent",
            command_text=f"/research {stripped}",
            role="research",
            confidence=0.9,
            needs_tools=True,
        )

    if review_intent(lowered) and not fix_or_implement_intent(lowered):
        return TextRoutePlan(
            action="chat",
            reason="review/quality-check intent",
            role="chat",
            confidence=0.82,
        )

    if coding_intent(lowered):
        return TextRoutePlan(
            action="chat",
            reason="coding/technical intent",
            role="coder",
            confidence=0.82,
            needs_tools=project_change_intent(lowered),
        )

    if writing_intent(lowered):
        return TextRoutePlan(
            action="chat",
            reason="writing/translation intent",
            role="writer",
            confidence=0.78,
        )

    if explanation_intent(lowered):
        return TextRoutePlan(
            action="chat",
            reason="stable explanation/how-to intent",
            role="chat",
            confidence=0.84,
            suggested_next_step="Explain the topic directly without web search unless current sources are requested.",
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
    fallback_system = (
        "You are a cheap router for a local Telegram agent. Do not solve the user's task. "
        "Return only valid JSON matching the schema. Choose exactly one role. "
        "Use controller only for clearly multi-step work that must coordinate multiple roles. "
        "Use research only when current/web/source information is needed. "
        "Use coder for code/project/debug/implementation. Use writer for translation, rewriting, PDF/DOCX text. "
        "Use chat for review/check/improve/error-finding tasks unless they clearly require code. Otherwise use chat."
    )
    system = role_system_prompt(context.root, "orchestrator", fallback_system)
    prompt = (
        "Classify this user message for routing. Return JSON only.\n\n"
        f"User message:\n{text}\n\n"
        "Fields: role, confidence, needs_tools, reason, suggested_next_step."
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
    reason = str(decision.get("reason") or fallback.reason).strip() or fallback.reason
    suggested_next_step = str(decision.get("suggested_next_step") or fallback.suggested_next_step).strip()

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
        suggested_next_step=suggested_next_step,
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


def browser_intent(lowered: str) -> bool:
    markers = (
        "browser",
        "chrome",
        "open in browser",
        "open",
        "show",
        "browser use",
        "браузер",
        "браузере",
        "хром",
        "открой",
        "покажи",
        "открой в браузере",
        "через браузер",
        "скриншот страницы",
        "сделай скриншот",
    )
    return any(marker in lowered for marker in markers)


def browser_followup_intent(lowered: str) -> bool:
    stripped = re.sub(r"\s+", " ", lowered).strip(" .,!?:;")
    if len(stripped.split()) > 5:
        return False
    markers = {
        "открой",
        "открой ее",
        "открой её",
        "открой это",
        "открой ссылку",
        "открой страницу",
        "покажи",
        "покажи ее",
        "покажи её",
        "покажи это",
        "через браузер",
        "в браузере",
        "open",
        "open it",
        "open this",
        "show",
        "show it",
        "browser",
    }
    return stripped in markers


def latest_context_url(context: ToolContext | None) -> str:
    if not context:
        return ""

    url = latest_artifact_url(context)
    if url:
        return url

    for line in (context.memory_context or "").splitlines():
        if not line.startswith("Last URLs:"):
            continue
        urls = extract_urls(line)
        if urls:
            return urls[-1]
    return ""


def latest_artifact_url(context: ToolContext) -> str:
    if not context.artifact_store:
        return ""
    artifact = context.artifact_store.resolve(context.artifact_key)
    if not artifact or not artifact.urls:
        return ""
    if artifact.kind == "browser_page":
        metadata_url = str((artifact.metadata or {}).get("url") or "")
        urls = extract_urls(metadata_url)
        if urls:
            return urls[0]
        return artifact.urls[0]
    if artifact.kind in {"url_check", "web_page"} or len(artifact.urls) == 1:
        return artifact.urls[0]
    return ""


def url_verification_intent(lowered: str, context: ToolContext | None) -> bool:
    if not active_artifact_has_single_link_terms(context):
        return False

    non_url_text = URL_RE.sub(" ", lowered)
    markers = (
        "а эта",
        "а этот",
        "а это",
        "эта ссылка",
        "этот url",
        "этот линк",
        "проверь",
        "проверить",
        "подходит",
        "чего там",
        "что там",
        "что из этого",
        "есть ли",
        "нет ли",
        "is this",
        "does this",
        "check this",
        "verify this",
        "this link",
        "this url",
    )
    return any(marker in non_url_text for marker in markers)


def active_artifact_has_single_link_terms(context: ToolContext | None) -> bool:
    if not context or not context.artifact_store:
        return False
    artifact = context.artifact_store.resolve(context.artifact_key)
    if not artifact:
        return False
    metadata = artifact.metadata or {}
    terms = metadata.get("terms")
    return bool(isinstance(terms, list) and terms)


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


def artifact_followup_intent(lowered: str) -> bool:
    reference_markers = (
        "это",
        "этот",
        "этом",
        "этой",
        "эту",
        "тут",
        "здесь",
        "предыдущ",
        "последний результат",
        "this",
        "that",
        "here",
        "previous result",
        "last result",
    )
    artifact_subjects = (
        "репо",
        "репозит",
        "страниц",
        "сайт",
        "коммит",
        "commit",
        "repo",
        "repository",
        "page",
        "site",
    )
    if any(ref in lowered for ref in reference_markers) and any(subject in lowered for subject in artifact_subjects):
        return True
    return any(phrase in lowered for phrase in ("в этом репо", "на этой странице", "this repo", "this page"))


def force_web_intent(lowered: str) -> bool:
    markers = (
        "найди в интернете",
        "поищи в интернете",
        "погугли",
        "дай источники",
        "с источниками",
        "web search",
        "search the web",
        "google it",
        "with sources",
    )
    return any(marker in lowered for marker in markers)


def active_artifact_available(context: ToolContext | None) -> bool:
    if not context or not context.artifact_store:
        return False
    return bool(context.artifact_store.resolve(context.artifact_key))


def search_strategy_question(lowered: str) -> bool:
    strategy_markers = (
        "какими методами",
        "каким методом",
        "как будешь искать",
        "как хочешь найти",
        "как хочешь искать",
        "как искать",
        "какие методы",
        "методы поиска",
        "способы поиска",
        "если мало информации",
        "задай вопросы",
        "задай вопрос",
    )
    web_markers = ("интернет", "источник", "найди", "поиск", "research", "web")
    return any(marker in lowered for marker in strategy_markers) and any(marker in lowered for marker in web_markers)


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


def review_intent(lowered: str) -> bool:
    markers = (
        "review",
        "check",
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


def explanation_intent(lowered: str) -> bool:
    markers = (
        "мне нужно понять",
        "хочу понять",
        "объясни",
        "объяснить",
        "что такое",
        "как работает",
        "как создать",
        "как сделать",
        "по шагам",
        "простыми словами",
        "разбери",
        "explain",
        "understand",
        "how to",
        "step by step",
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
    if task_logger and hasattr(task_logger, "event"):
        task_logger.event(
            "router_planned",
            task_id=context.task_id,
            action=plan.action,
            role=plan.role,
            confidence=plan.confidence,
            needs_tools=plan.needs_tools,
            reason=plan.reason,
            suggested_next_step=plan.suggested_next_step,
            command_text=plan.command_text,
        )


def log_orchestrator_decision(context: ToolContext, plan: TextRoutePlan, raw: dict[str, Any]) -> None:
    task_logger = getattr(context, "logger", None)
    if task_logger and hasattr(task_logger, "event"):
        task_logger.event(
            "orchestrator_decision",
            task_id=context.task_id,
            role=plan.role,
            confidence=plan.confidence,
            needs_tools=plan.needs_tools,
            reason=plan.reason,
            suggested_next_step=plan.suggested_next_step,
            provider=raw.get("provider", ""),
            model=raw.get("model", ""),
        )


def log_orchestrator_fallback(context: ToolContext, fallback: TextRoutePlan, reason: str) -> None:
    task_logger = getattr(context, "logger", None)
    if task_logger and hasattr(task_logger, "event"):
        task_logger.event(
            "orchestrator_fallback",
            task_id=context.task_id,
            role=fallback.role,
            confidence=fallback.confidence,
            reason=reason,
        )
