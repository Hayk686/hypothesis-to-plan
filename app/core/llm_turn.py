from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass

from app.core.language import detect_target_language
from app.core.model_orchestrator import llm_kwargs_for_role, role_model, role_temperature
from app.core.tool_registry import ToolContext, ToolRegistry
from app.tools.common import ToolResult


MOJIBAKE_RE = re.compile(r"[ÐÑÕÖØÙÂÃÅ]")
CODE_BLOCK_RE = re.compile(r"```.*?```", re.DOTALL)
INLINE_CODE_RE = re.compile(r"`[^`]+`")
URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
MARKDOWN_LINK_RE = re.compile(r"\[[^\]]+\]\([^)]+\)")
SOURCE_LINE_RE = re.compile(r"^\s*\[\d+\].*$", re.MULTILINE)
LATIN_TOKEN_RE = re.compile(r"\b[A-Za-z][A-Za-z0-9+_.-]*\b")
REPAIR_SOURCE_LIMIT = 4200

ALLOWED_FOREIGN_TERMS = {
    "a100",
    "aac",
    "alac",
    "amd",
    "api",
    "argo",
    "aws",
    "azure",
    "bert",
    "blob",
    "capex",
    "ci",
    "cpu",
    "cuda",
    "cudnn",
    "csv",
    "doc",
    "docx",
    "elasticsearch",
    "fastapi",
    "flac",
    "fp16",
    "gcp",
    "github",
    "git",
    "google",
    "gpu",
    "grafana",
    "h100",
    "html",
    "http",
    "https",
    "jax",
    "jenova",
    "json",
    "kubernetes",
    "llm",
    "logstash",
    "m4a",
    "microsoft",
    "mlops",
    "mp3",
    "nemotron",
    "nim",
    "nvidia",
    "nvlink",
    "nvme",
    "openai",
    "openrouter",
    "opex",
    "opus",
    "pdf",
    "prometheus",
    "pytorch",
    "python",
    "rdma",
    "rtx",
    "s3",
    "telegram",
    "tensorflow",
    "tf32",
    "tpu",
    "url",
    "usd",
    "vrAM".lower(),
    "wav",
    "windows",
    "xlsx",
    "youtube",
}


@dataclass(frozen=True)
class LlmTurnPlan:
    target_language: str
    repair_attempts: int = 1


@dataclass(frozen=True)
class Critique:
    ok: bool
    reason: str = ""


def run_llm_turn(
    registry: ToolRegistry,
    context: ToolContext,
    *,
    prompt: str,
    system: str,
    temperature: float | None = None,
    language_text: str = "",
    role: str = "",
) -> ToolResult:
    plan = plan_llm_turn(language_text or prompt)
    llm_args = {
        "prompt": prompt,
        "system": system,
        "temperature": temperature if temperature is not None else 0.4,
    }
    if role:
        selection = role_model(context.config, role)
        log_agent_step(
            context,
            "model_role_selected",
            role=selection.role,
            provider=selection.provider,
            model=selection.model,
            source=selection.source,
        )
        llm_args["temperature"] = temperature if temperature is not None else role_temperature(context.config, role, 0.4)
        llm_args.update(llm_kwargs_for_role(context.config, role))

    result = registry.run(
        "llm_chat",
        context,
        **llm_args,
    )
    if not result.ok:
        return result

    critique = critique_answer(plan, result.message)
    if critique.ok:
        return with_agent_raw(result, plan, critique, repaired=False)

    log_agent_step(context, "agent_critic_failed", target_language=plan.target_language, reason=critique.reason)
    current = result
    for attempt in range(plan.repair_attempts):
        repaired = repair_answer(
            registry,
            context,
            plan=plan,
            original_prompt=prompt,
            bad_answer=current.message,
            reason=critique.reason,
        )
        if not repaired.ok:
            log_agent_step(context, "agent_repair_failed", target_language=plan.target_language, reason=repaired.message)
            return quality_failure(plan, critique, repair_error=repaired.message)

        repaired_critique = critique_answer(plan, repaired.message)
        if repaired_critique.ok:
            log_agent_step(
                context,
                "agent_repair_succeeded",
                target_language=plan.target_language,
                attempt=attempt + 1,
            )
            return with_agent_raw(repaired, plan, repaired_critique, repaired=True)

        log_agent_step(
            context,
            "agent_repair_still_failed",
            target_language=plan.target_language,
            attempt=attempt + 1,
            reason=repaired_critique.reason,
        )
        current = repaired
        critique = repaired_critique

    return quality_failure(plan, critique, repair_error=critique.reason)


def plan_llm_turn(prompt: str) -> LlmTurnPlan:
    return LlmTurnPlan(target_language=detect_target_language(prompt))


def critique_answer(plan: LlmTurnPlan, answer: str) -> Critique:
    target = plan.target_language
    if target not in {"armenian", "russian", "english"}:
        return Critique(ok=True)

    counts = script_counts(answer)
    total = sum(counts.values())
    if total < 12:
        return Critique(ok=True)

    if looks_mojibaked(answer, counts):
        return Critique(ok=False, reason="answer looks like encoding noise")

    target_count = counts[target]
    target_ratio = target_count / max(total, 1)
    foreign_count = total - target_count

    if target_count == 0:
        return Critique(ok=False, reason=f"answer does not contain {target} text")

    if target == "russian":
        hard_foreign = counts["armenian"] + counts["other"]
        if hard_foreign >= 4:
            return Critique(ok=False, reason="answer contains non-Russian scripts")
        suspicious = suspicious_latin_tokens(answer)
        if len(suspicious) >= 3:
            return Critique(ok=False, reason=f"answer contains untranslated foreign terms: {', '.join(suspicious[:5])}")
        if target_ratio < 0.45 and foreign_count > target_count:
            return Critique(ok=False, reason="answer is not mostly Russian")
        return Critique(ok=True)

    if target == "armenian":
        hard_foreign = counts["russian"] + counts["other"]
        if hard_foreign >= 3:
            return Critique(ok=False, reason="answer contains non-Armenian scripts")
        suspicious = suspicious_latin_tokens(answer)
        if len(suspicious) >= 3:
            return Critique(ok=False, reason=f"answer contains untranslated foreign terms: {', '.join(suspicious[:5])}")
        if target_ratio < 0.5:
            return Critique(ok=False, reason="answer is not mostly Armenian")
        return Critique(ok=True)

    if target == "english":
        hard_foreign = counts["armenian"] + counts["russian"] + counts["other"]
        if hard_foreign >= 4:
            return Critique(ok=False, reason="answer contains non-English scripts")
        if target_ratio < 0.55:
            return Critique(ok=False, reason="answer is not mostly English")
        return Critique(ok=True)

    return Critique(ok=True)


def repair_answer(
    registry: ToolRegistry,
    context: ToolContext,
    *,
    plan: LlmTurnPlan,
    original_prompt: str,
    bad_answer: str,
    reason: str,
) -> ToolResult:
    target = language_name(plan.target_language)
    repair_system = (
        "You are the repair step inside a Telegram agent. Rewrite the assistant answer so it "
        f"fully obeys the requested language: {target}. Preserve the original meaning, numbers, "
        "links, filenames, commands, markdown structure, and essential brand/model names. "
        "Translate non-essential English and foreign words into the requested language. "
        "Do not add new facts. Return only the corrected final answer."
    )
    repair_prompt = (
        f"Original user request:\n{original_prompt}\n\n"
        f"Problem found by critic: {reason}\n\n"
        f"Bad assistant answer:\n{trim_for_repair(bad_answer)}\n\n"
        f"Rewrite the bad assistant answer in {target} only."
    )
    return registry.run(
        "llm_chat",
        context,
        prompt=repair_prompt,
        system=repair_system,
        temperature=0.1,
        **llm_kwargs_for_role(context.config, "writer"),
    )


def script_counts(text: str) -> dict[str, int]:
    counts = {"armenian": 0, "russian": 0, "english": 0, "other": 0}
    for char in text:
        codepoint = ord(char)
        if 0x0530 <= codepoint <= 0x058F:
            counts["armenian"] += 1
        elif 0x0400 <= codepoint <= 0x04FF:
            counts["russian"] += 1
        elif ("A" <= char <= "Z") or ("a" <= char <= "z"):
            counts["english"] += 1
        elif unicodedata.category(char).startswith("L"):
            counts["other"] += 1
    return counts


def suspicious_latin_tokens(text: str) -> list[str]:
    cleaned = strip_non_language_regions(text)
    suspicious = []
    seen = set()
    for match in LATIN_TOKEN_RE.finditer(cleaned):
        token = match.group(0)
        lowered = token.lower().strip("._-")
        if not lowered or len(lowered) < 3:
            continue
        if lowered in ALLOWED_FOREIGN_TERMS:
            continue
        if token.isupper():
            continue
        if any(char.isdigit() for char in token):
            continue
        if "/" in token or "\\" in token:
            continue
        if token.startswith(("http", "www")):
            continue
        if token.startswith(("/", "--")):
            continue
        if lowered in seen:
            continue
        suspicious.append(token)
        seen.add(lowered)
    return suspicious


def strip_non_language_regions(text: str) -> str:
    text = CODE_BLOCK_RE.sub("", text)
    text = INLINE_CODE_RE.sub("", text)
    text = MARKDOWN_LINK_RE.sub("", text)
    text = URL_RE.sub("", text)
    text = SOURCE_LINE_RE.sub("", text)
    return text


def looks_mojibaked(text: str, counts: dict[str, int]) -> bool:
    if not MOJIBAKE_RE.search(text):
        return False
    if counts["armenian"] or counts["russian"]:
        return False
    return counts["english"] + counts["other"] >= 12


def language_name(language: str) -> str:
    return {
        "armenian": "Armenian",
        "russian": "Russian",
        "english": "English",
    }.get(language, "the user's language")


def with_agent_raw(
    result: ToolResult,
    plan: LlmTurnPlan,
    critique: Critique,
    *,
    repaired: bool,
    repair_error: str = "",
) -> ToolResult:
    raw = dict(result.raw)
    raw["agent"] = {
        "target_language": plan.target_language,
        "critic_ok": critique.ok,
        "critic_reason": critique.reason,
        "repaired": repaired,
        "repair_error": repair_error,
    }
    return ToolResult(
        ok=result.ok,
        files=result.files,
        message=result.message,
        raw=raw,
        stdout=result.stdout,
        stderr=result.stderr,
    )


def quality_failure(plan: LlmTurnPlan, critique: Critique, *, repair_error: str = "") -> ToolResult:
    detail = critique.reason or "quality check failed"
    message = (
        "Ответ модели не прошёл проверку качества, поэтому я не отправляю его как финальный.\n"
        f"Причина: {detail}."
    )
    if repair_error:
        message += f"\nАвтоисправление не сработало: {repair_error}"
    message += "\nПопробуй ещё раз или выбери другую модель через /model или роль через /roles."
    return ToolResult(
        ok=True,
        message=message,
        raw={
            "agent": {
                "target_language": plan.target_language,
                "critic_ok": False,
                "critic_reason": detail,
                "repaired": False,
                "repair_error": repair_error,
            }
        },
    )


def trim_for_repair(text: str) -> str:
    text = text.strip()
    if len(text) <= REPAIR_SOURCE_LIMIT:
        return text
    marker = "\n\n[truncated for repair]"
    return text[: REPAIR_SOURCE_LIMIT - len(marker)].rstrip() + marker


def log_agent_step(context: ToolContext, kind: str, **kwargs) -> None:
    task_logger = getattr(context, "logger", None)
    json_logger = getattr(task_logger, "logger", None)
    if json_logger:
        json_logger.event(kind, task_id=context.task_id, **kwargs)
