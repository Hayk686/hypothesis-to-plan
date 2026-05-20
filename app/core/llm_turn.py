from __future__ import annotations

from dataclasses import dataclass

from app.core.language import detect_target_language
from app.core.model_orchestrator import llm_kwargs_for_role, role_model, role_temperature
from app.core.tool_registry import ToolContext, ToolRegistry
from app.tools.common import ToolResult


@dataclass(frozen=True)
class LlmTurnPlan:
    target_language: str


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

    return with_agent_raw(result, plan)


def plan_llm_turn(prompt: str) -> LlmTurnPlan:
    return LlmTurnPlan(target_language=detect_target_language(prompt))


def with_agent_raw(result: ToolResult, plan: LlmTurnPlan) -> ToolResult:
    raw = dict(result.raw)
    raw["agent"] = {
        "target_language": plan.target_language,
        "quality_layer": "disabled",
    }
    return ToolResult(
        ok=result.ok,
        files=result.files,
        message=result.message,
        raw=raw,
        stdout=result.stdout,
        stderr=result.stderr,
    )


def log_agent_step(context: ToolContext, kind: str, **kwargs) -> None:
    task_logger = getattr(context, "logger", None)
    if task_logger and hasattr(task_logger, "event"):
        task_logger.event(kind, task_id=context.task_id, **kwargs)
