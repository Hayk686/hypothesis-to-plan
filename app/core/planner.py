from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.llm_turn import run_llm_turn
from app.core.role_prompts import role_system_prompt
from app.core.tool_registry import ToolContext, ToolRegistry
from app.core.types import Outgoing


URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)
MAX_TASKS = 80
STEP_ATTEMPTS = 3


@dataclass
class PlanStep:
    action: str
    args: dict[str, Any] = field(default_factory=dict)
    label: str = ""


@dataclass
class TaskPlan:
    title: str
    steps: list[PlanStep]
    reason: str = ""


class TaskStateStore:
    def __init__(self, state_dir: Path):
        self.path = state_dir / "task_state.json"
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._data = self._load()

    def start(self, key: str, plan: TaskPlan, user_text: str) -> str:
        task_id = uuid.uuid4().hex[:12]
        task = {
            "id": task_id,
            "status": "running",
            "title": plan.title,
            "reason": plan.reason,
            "user_text": user_text,
            "steps": [
                {
                    "index": index,
                    "action": step.action,
                    "label": step.label,
                    "args": json_safe(step.args),
                    "status": "pending",
                }
                for index, step in enumerate(plan.steps, 1)
            ],
            "created_at": now_iso(),
            "updated_at": now_iso(),
        }
        bucket = self._bucket(key)
        tasks = list(bucket.get("tasks", []))
        tasks.append(task)
        bucket["tasks"] = tasks[-MAX_TASKS:]
        bucket["last_task_id"] = task_id
        self._data[key] = bucket
        self._save()
        return task_id

    def step(self, key: str, task_id: str, index: int, status: str, message: str = "") -> None:
        task = self._task(key, task_id)
        if not task:
            return
        for step in task.get("steps", []):
            if step.get("index") == index:
                step["status"] = status
                if status in {"running", "retrying"}:
                    step["attempts"] = int(step.get("attempts", 0)) + 1
                if message:
                    step["message"] = truncate(message, 500)
                break
        task["updated_at"] = now_iso()
        self._save()

    def finish(self, key: str, task_id: str, status: str, message: str = "", files: list[Path] | None = None) -> None:
        task = self._task(key, task_id)
        if not task:
            return
        task["status"] = status
        task["message"] = truncate(message, 1000)
        task["files"] = [str(path) for path in files or []]
        task["updated_at"] = now_iso()
        self._save()

    def list_text(self, key: str) -> str:
        tasks = list(self._bucket(key).get("tasks", []))
        if not tasks:
            return "Пока нет задач."

        lines = ["Последние задачи:"]
        for task in reversed(tasks[-10:]):
            lines.append(f"#{task.get('id')} {task.get('status')}: {task.get('title')}")
            step_bits = []
            for step in task.get("steps", []):
                step_bits.append(f"{step.get('index')}.{step.get('action')}={step.get('status')}")
            if step_bits:
                lines.append("  " + ", ".join(step_bits))
        return "\n".join(lines)

    def latest_resumable_text(self, key: str) -> str:
        task = self.latest_resumable(key)
        return str(task.get("user_text", "")) if task else ""

    def latest_resumable(self, key: str) -> dict[str, Any] | None:
        tasks = list(self._bucket(key).get("tasks", []))
        for task in reversed(tasks):
            if task.get("status") in {"paused", "failed"} and task.get("user_text"):
                return task
        return None

    def mark_resumed(self, key: str, task_id: str) -> None:
        task = self._task(key, task_id)
        if not task:
            return
        task["status"] = "resumed"
        task["updated_at"] = now_iso()
        self._save()

    def clear(self, key: str) -> None:
        if key in self._data:
            del self._data[key]
            self._save()

    def _bucket(self, key: str) -> dict[str, Any]:
        value = self._data.get(key)
        if isinstance(value, dict):
            return value
        return {"last_task_id": "", "tasks": []}

    def _task(self, key: str, task_id: str) -> dict[str, Any] | None:
        for task in self._bucket(key).get("tasks", []):
            if task.get("id") == task_id:
                return task
        return None

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


def run_planned_workflow(
    root: Path,
    text: str,
    registry: ToolRegistry,
    context: ToolContext,
    commands: Any,
) -> Outgoing | None:
    plan = plan_workflow(text, context)
    if not plan:
        return None

    context.metadata["route_action"] = "workflow"
    context.metadata["route_reason"] = plan.reason
    context.metadata["selected_role"] = "controller"
    context.metadata["orchestration"] = {
        "role": "controller",
        "confidence": 0.86,
        "needs_tools": True,
        "reason": f"multi-step workflow: {plan.reason}",
    }
    log_planner_event(context, "planner_started", plan=plan_to_dict(plan))

    task_id = ""
    if context.task_state:
        task_id = context.task_state.start(context.artifact_key, plan, text)

    current_text = ""
    source_urls: list[str] = []
    output_files: list[Path] = []
    cleanup_files: list[Path] = []
    last_docx: Path | None = None

    for index, step in enumerate(plan.steps, 1):
        mark_step(context, task_id, index, "running", step.label or step.action)
        log_planner_event(context, "planner_step_started", index=index, action=step.action, args=step.args)

        if step.action == "research":
            outgoing = retry_outgoing(
                context,
                task_id,
                index,
                lambda: commands.run(f"/research {step.args.get('query', '')}", root, registry, context),
            )
            if is_failure(outgoing):
                return fail_workflow(context, task_id, outgoing.text, output_files, cleanup_files)
            artifact = context.metadata.get("artifact") if isinstance(context.metadata.get("artifact"), dict) else {}
            if artifact_has_llm_error(artifact):
                return fail_workflow(
                    context,
                    task_id,
                    "Research нашел источники, но AI-вывод не получился. Я остановился, чтобы не создавать пустой файл.",
                    output_files,
                    cleanup_files,
                )
            current_text = str(artifact.get("text") or outgoing.text)
            source_urls.extend(str(url) for url in artifact.get("urls", []) if url)
            save_intermediate_artifact(context, artifact, "research")

        elif step.action == "fetch":
            outgoing = retry_outgoing(
                context,
                task_id,
                index,
                lambda: commands.run(f"/fetch {step.args.get('url', '')}", root, registry, context),
            )
            if is_failure(outgoing):
                return fail_workflow(context, task_id, outgoing.text, output_files, cleanup_files)
            artifact = context.metadata.get("artifact") if isinstance(context.metadata.get("artifact"), dict) else {}
            current_text = str(artifact.get("text") or outgoing.text)
            source_urls.extend(str(url) for url in artifact.get("urls", []) if url)
            save_intermediate_artifact(context, artifact, "web_page")

        elif step.action == "use_artifact":
            artifact = active_artifact(context)
            if not artifact:
                return fail_workflow(context, task_id, "Не нашел предыдущий результат для этой задачи.", output_files, cleanup_files)
            current_text = artifact.text or ""
            source_urls.extend(artifact.urls)

        elif step.action == "transform":
            result = retry_tool_result(
                context,
                task_id,
                index,
                lambda: transform_text(registry, context, current_text, step.args.get("instruction", "")),
            )
            if not result.ok:
                return fail_workflow(context, task_id, result.message or "AI transform failed.", output_files, cleanup_files)
            current_text = result.message

        elif step.action == "create_docx":
            result = retry_tool_result(
                context,
                task_id,
                index,
                lambda: registry.run(
                    "create_docx",
                    context,
                    text=current_text,
                    title=step.args.get("title") or plan.title,
                ),
            )
            if not result.ok:
                return fail_workflow(context, task_id, result.message or "DOCX creation failed.", output_files, cleanup_files)
            last_docx = result.files[0] if result.files else None
            output_files.extend(result.files)
            cleanup_files.extend(result.files)

        elif step.action == "convert_docx_to_pdf":
            if not last_docx:
                return fail_workflow(context, task_id, "Не из чего сделать PDF: DOCX не был создан.", output_files, cleanup_files)
            result = retry_tool_result(
                context,
                task_id,
                index,
                lambda: registry.run("convert_docx_to_pdf", context, path=last_docx),
            )
            if not result.ok:
                return fail_workflow(context, task_id, result.message or "PDF conversion failed.", output_files, cleanup_files)
            output_files.extend(result.files)
            cleanup_files.extend(result.files)
            if step.args.get("pdf_only"):
                output_files = list(result.files)

        else:
            return fail_workflow(context, task_id, f"Unknown workflow step: {step.action}", output_files, cleanup_files)

        mark_step(context, task_id, index, "done", step.label or step.action)
        log_planner_event(context, "planner_step_finished", index=index, action=step.action)

    final_text = current_text.strip() if not output_files else "Готово."
    context.metadata["artifact"] = {
        "kind": "workflow",
        "title": plan.title,
        "text": current_text,
        "files": output_files,
        "urls": dedupe(source_urls),
        "metadata": {"task_id": task_id, "plan": plan_to_dict(plan)},
    }
    if context.task_state:
        context.task_state.finish(context.artifact_key, task_id, "done", final_text, output_files)
    log_planner_event(context, "planner_finished", workflow_task_id=task_id, files=[str(path) for path in output_files])
    return Outgoing(text=final_text, files=dedupe_paths(output_files), cleanup_files=dedupe_paths(cleanup_files))


def resume_latest_workflow(
    root: Path,
    registry: ToolRegistry,
    context: ToolContext,
    commands: Any,
) -> Outgoing:
    if not context.task_state:
        return Outgoing(text="Task state is not available.")
    task = context.task_state.latest_resumable(context.artifact_key)
    if not task:
        return Outgoing(text="Нет остановленной workflow-задачи для продолжения.")
    text = str(task.get("user_text", ""))
    context.task_state.mark_resumed(context.artifact_key, str(task.get("id", "")))
    log_planner_event(context, "planner_resume_requested", resumed_text=text)
    outgoing = run_planned_workflow(root, text, registry, context, commands)
    return outgoing or Outgoing(text="Не получилось восстановить workflow-задачу.")


def plan_workflow(text: str, context: ToolContext | None = None) -> TaskPlan | None:
    stripped = text.strip()
    if not stripped:
        return None

    lowered = stripped.lower()
    urls = extract_urls(stripped)
    wants_docx = has_any(lowered, ("docx", ".docx", "word", "докс", "ворд", "документ"))
    wants_pdf = has_any(lowered, ("pdf", "пдф"))
    wants_file = wants_docx or wants_pdf
    wants_transform = transform_instruction(lowered) != ""
    wants_research = research_intent(lowered)
    wants_fetch = bool(urls) and fetch_intent(lowered)
    references_artifact = artifact_reference_intent(lowered)

    if not ((wants_research or wants_fetch or references_artifact) and (wants_transform or wants_file)):
        return None

    steps: list[PlanStep] = []
    title = title_from_text(stripped)
    reason_bits = []

    if wants_research:
        query = clean_research_query(stripped)
        steps.append(PlanStep("research", {"query": query, "role": "research"}, "Найти источники и собрать ответ"))
        reason_bits.append("research")
        title = query[:120] or title
    elif wants_fetch and urls:
        steps.append(PlanStep("fetch", {"url": urls[0]}, "Прочитать страницу"))
        reason_bits.append("fetch")
        title = urls[0]
    elif references_artifact:
        steps.append(PlanStep("use_artifact", {}, "Взять активный результат"))
        reason_bits.append("artifact")

    instruction = transform_instruction(lowered)
    if instruction:
        steps.append(PlanStep("transform", {"instruction": instruction, "role": role_for_transform_instruction(instruction)}, instruction))
        reason_bits.append("transform")

    if wants_docx or wants_pdf:
        steps.append(PlanStep("create_docx", {"title": title}, "Создать DOCX"))
        reason_bits.append("docx")
    if wants_pdf:
        steps.append(PlanStep("convert_docx_to_pdf", {"pdf_only": not wants_docx}, "Создать PDF"))
        reason_bits.append("pdf")

    if len(steps) < 2:
        return None

    return TaskPlan(title=title or "workflow", steps=steps, reason=" + ".join(reason_bits))


def transform_text(registry: ToolRegistry, context: ToolContext, source_text: str, instruction: str):
    if not source_text.strip():
        return registry.run(
            "llm_chat",
            context,
            prompt="No source text was provided.",
            system="Return a short error.",
            temperature=0.0,
        )
    prompt = (
        f"Instruction: {instruction}\n\n"
        "Source text:\n"
        f"{source_text}\n\n"
        "Return only the final transformed text. Keep useful links or source labels if they matter."
    )
    role = role_for_transform_instruction(instruction)
    system = role_system_prompt(
        context.root,
        role,
        (
            "You transform existing text for the user's workflow. "
            "Follow the instruction exactly. Do not add meta commentary."
        ),
    )
    system = (
        system.rstrip()
        + "\n\nWorkflow transform contract: Transform the provided source text according to the instruction. "
        "Return only the final transformed text. Keep useful links or source labels if they matter."
    )
    return run_llm_turn(
        registry,
        context,
        prompt=prompt,
        system=system,
        language_text=instruction,
        role=role,
    )


def role_for_transform_instruction(instruction: str) -> str:
    lowered = instruction.lower()
    if any(marker in lowered for marker in ("code", "python", "javascript", "fix", "implement")):
        return "coder"
    return "writer"


def transform_instruction(lowered: str) -> str:
    language = target_language(lowered)
    if has_any(lowered, ("переведи", "перевод", "translate", "թարգմանի")):
        if language:
            return f"Translate the text to {language}."
        return "Translate the text to the language requested by the user."
    if has_any(lowered, ("кратко", "коротко", "summary", "summarize", "резюме")):
        return "Summarize the text clearly and concisely."
    if has_any(lowered, ("перепиши", "rewrite", "улучши")):
        return "Rewrite the text cleanly while preserving the meaning."
    return ""


def target_language(lowered: str) -> str:
    if has_any(lowered, ("армян", "հայերեն", "հայերէն", "armenian")):
        return "Armenian"
    if has_any(lowered, ("русск", "по русски", "по-русски", "russian")):
        return "Russian"
    if has_any(lowered, ("англ", "english")):
        return "English"
    return ""


def research_intent(lowered: str) -> bool:
    return has_any(
        lowered,
        (
            "research",
            "найди",
            "поищи",
            "поиск",
            "погугли",
            "в интернете",
            "в сети",
            "источник",
            "ссылк",
            "latest",
            "current",
            "find",
            "search",
            "look up",
        ),
    )


def fetch_intent(lowered: str) -> bool:
    return has_any(lowered, ("прочитай", "открой", "fetch", "read this", "read page", "страницу"))


def artifact_reference_intent(lowered: str) -> bool:
    return has_any(
        lowered,
        (
            "это",
            "этот",
            "эту",
            "предыдущ",
            "последн",
            "тот же",
            "этот же",
            "same",
            "previous",
            "last",
            "this",
            "that",
        ),
    )


def clean_research_query(text: str) -> str:
    cut = len(text)
    for marker in (
        "переведи",
        "translate",
        "сделай docx",
        "сделай pdf",
        "создай docx",
        "создай pdf",
        "сохрани",
        "export",
        "в docx",
        "в pdf",
    ):
        index = text.lower().find(marker)
        if index > 0:
            cut = min(cut, index)
    query = text[:cut]
    query = re.sub(
        r"(?i)\b(research|find|search|look up|найди|поищи|поиск|погугли|сделай research|информацию|инфу|про|о)\b",
        " ",
        query,
    )
    query = re.sub(r"\s+", " ", query).strip(" ,.;:-")
    query = re.sub(r"\s+и$", "", query).strip()
    return query or text.strip()


def active_artifact(context: ToolContext):
    store = context.artifact_store
    if not store:
        return None
    return store.resolve(context.artifact_key)


def save_intermediate_artifact(context: ToolContext, spec: dict[str, Any], fallback_kind: str) -> None:
    store = context.artifact_store
    if not store or not spec:
        return
    store.add(
        context.artifact_key,
        kind=str(spec.get("kind") or fallback_kind),
        title=str(spec.get("title") or fallback_kind),
        text=str(spec.get("text") or ""),
        files=list(spec.get("files") or []),
        urls=list(spec.get("urls") or []),
        route=str(spec.get("kind") or fallback_kind),
        metadata=dict(spec.get("metadata") or {}),
    )


def fail_workflow(
    context: ToolContext,
    task_id: str,
    message: str,
    output_files: list[Path],
    cleanup_files: list[Path],
) -> Outgoing:
    status = "paused" if recoverable_text(message) else "failed"
    if context.task_state:
        context.task_state.finish(context.artifact_key, task_id, status, message, output_files)
    log_planner_event(context, "planner_failed", workflow_task_id=task_id, status=status, message=message)
    return Outgoing(text=message or "Workflow failed.", files=dedupe_paths(output_files), cleanup_files=dedupe_paths(cleanup_files))


def retry_outgoing(context: ToolContext, task_id: str, index: int, func) -> Outgoing:
    result = func()
    for attempt in range(2, STEP_ATTEMPTS + 1):
        if not is_failure(result) or not recoverable_text(result.text):
            return result
        mark_step(context, task_id, index, "retrying", f"retry {attempt}/{STEP_ATTEMPTS}: {short_error(result.text)}")
        log_planner_event(context, "planner_step_retry", workflow_task_id=task_id, index=index, attempt=attempt)
        result = func()
    return result


def retry_tool_result(context: ToolContext, task_id: str, index: int, func):
    result = func()
    for attempt in range(2, STEP_ATTEMPTS + 1):
        if result.ok or not recoverable_text(result.message):
            return result
        mark_step(context, task_id, index, "retrying", f"retry {attempt}/{STEP_ATTEMPTS}: {short_error(result.message)}")
        log_planner_event(context, "planner_step_retry", workflow_task_id=task_id, index=index, attempt=attempt)
        result = func()
    return result


def is_failure(outgoing: Outgoing) -> bool:
    text = outgoing.text.lower()
    return (
        text.startswith("runtime error:")
        or text.endswith("failed.")
        or " failed:" in text
        or "не прош" in text
        or "не получ" in text
    )


def recoverable_text(text: str) -> bool:
    lowered = (text or "").lower()
    markers = (
        "timeout",
        "timed out",
        "429",
        "rate",
        "quota",
        "limit",
        "exhaust",
        "temporarily",
        "overloaded",
        "unavailable",
        "try again",
        "getaddrinfo",
        "read operation timed out",
        "connection",
        "не прош",
        "не получ",
        "попробуй",
    )
    return any(marker in lowered for marker in markers)


def short_error(text: str) -> str:
    return truncate(" ".join(str(text).split()), 160)


def artifact_has_llm_error(artifact: dict[str, Any]) -> bool:
    metadata = artifact.get("metadata") if isinstance(artifact, dict) else {}
    return isinstance(metadata, dict) and bool(metadata.get("llm_error"))


def mark_step(context: ToolContext, task_id: str, index: int, status: str, message: str = "") -> None:
    if context.task_state and task_id:
        context.task_state.step(context.artifact_key, task_id, index, status, message)


def log_planner_event(context: ToolContext, kind: str, **kwargs: Any) -> None:
    task_logger = getattr(context, "logger", None)
    if task_logger and hasattr(task_logger, "event"):
        task_logger.event(kind, task_id=context.task_id, **json_safe(kwargs))


def plan_to_dict(plan: TaskPlan) -> dict[str, Any]:
    return {
        "title": plan.title,
        "reason": plan.reason,
        "steps": [{"action": step.action, "args": step.args, "label": step.label} for step in plan.steps],
    }


def extract_urls(text: str) -> list[str]:
    return [url.rstrip(".,;)") for url in URL_RE.findall(text)]


def has_any(text: str, markers: tuple[str, ...]) -> bool:
    return any(marker in text for marker in markers)


def title_from_text(text: str) -> str:
    title = re.sub(r"\s+", " ", text).strip()
    return title[:120] or "workflow"


def dedupe(values: list[str]) -> list[str]:
    result = []
    seen = set()
    for value in values:
        marker = value.lower()
        if not marker or marker in seen:
            continue
        seen.add(marker)
        result.append(value)
    return result


def dedupe_paths(values: list[Path]) -> list[Path]:
    result = []
    seen = set()
    for value in values:
        marker = str(value).lower()
        if marker in seen:
            continue
        seen.add(marker)
        result.append(value)
    return result


def json_safe(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False, default=str))


def truncate(text: str, limit: int) -> str:
    text = str(text)
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
