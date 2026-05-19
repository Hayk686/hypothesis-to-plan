from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from app.core.artifacts import with_artifact_context
from app.core.language import with_language_instruction
from app.core.llm_turn import run_llm_turn
from app.core.memory import with_recent_context
from app.core.model_orchestrator import format_model_roles, reset_role_models, save_role_model
from app.core.planner import resume_latest_workflow
from app.core.tool_registry import ToolContext, ToolRegistry
from app.core.types import Outgoing
from app.tools.llm import llm_status
from app.tools.media import parse_download_request
from app.tools.models import format_active_model, normalize_provider


CommandHandler = Callable[["CommandContext"], Outgoing]

CHAT_SYSTEM_PROMPT = (
    "Ты локальный Telegram-ассистент владельца. "
    "Отвечай на языке пользователя: русском, армянском или английском. "
    "Пиши кратко, естественно и честно. "
    "Если для ответа нужна свежая информация из интернета, скажи использовать /research <запрос>."
)

RESEARCH_SYSTEM_PROMPT = (
    "Ты research-ассистент. Отвечай на языке пользователя. "
    "Используй только предоставленные источники, не выдумывай факты. "
    "Дай короткий вывод и укажи ссылки на источники по номерам вида [1], [2]."
)


@dataclass
class CommandContext:
    root: Path
    text: str
    registry: ToolRegistry
    tool_context: ToolContext
    commands: "CommandRegistry"


@dataclass(frozen=True)
class CommandSpec:
    name: str
    description: str
    handler: CommandHandler
    aliases: tuple[str, ...] = ()
    examples: tuple[str, ...] = ()
    show_in_menu: bool = True
    requires_input: bool = False
    input_prompt: str = ""

    @property
    def triggers(self) -> tuple[str, ...]:
        return (self.name, *self.aliases)


@dataclass
class CommandRegistry:
    _commands: dict[str, CommandSpec] = field(default_factory=dict)

    def register(
        self,
        name: str,
        description: str,
        handler: CommandHandler,
        aliases: tuple[str, ...] = (),
        examples: tuple[str, ...] = (),
        show_in_menu: bool = True,
        requires_input: bool = False,
        input_prompt: str = "",
    ) -> None:
        normalized = normalize_command_name(name)
        spec = CommandSpec(
            name=normalized,
            description=description,
            handler=handler,
            aliases=tuple(normalize_command_name(alias) for alias in aliases),
            examples=examples,
            show_in_menu=show_in_menu,
            requires_input=requires_input,
            input_prompt=input_prompt,
        )

        for trigger in spec.triggers:
            if trigger in self._commands:
                raise ValueError(f"command already registered: {trigger}")
            self._commands[trigger] = spec

    def match(self, text: str) -> CommandSpec | None:
        command = first_command_token(text)
        if not command:
            return None
        return self._commands.get(command)

    def followup_spec(self, text: str) -> CommandSpec | None:
        spec = self.match(text)
        if not spec or not spec.requires_input:
            return None
        return spec if not command_args(text) else None

    def run(self, text: str, root: Path, registry: ToolRegistry, tool_context: ToolContext) -> Outgoing:
        context = CommandContext(
            root=root,
            text=text,
            registry=registry,
            tool_context=tool_context,
            commands=self,
        )
        spec = self.match(text)
        if spec:
            return spec.handler(context)
        if first_command_token(text):
            return Outgoing(text="Не знаю такую команду. Напиши /help.")
        return _chat(context)

    def menu_commands(self) -> list[dict[str, str]]:
        seen = set()
        commands = []
        for spec in self.unique_specs():
            if not spec.show_in_menu:
                continue
            if spec.name in seen:
                continue
            seen.add(spec.name)
            commands.append({"command": spec.name, "description": spec.description})
        return commands

    def help_text(self) -> str:
        lines = ["Runtime shell is alive.", "Commands:"]
        for spec in self.unique_specs():
            if not spec.show_in_menu:
                continue
            trigger = f"/{spec.name}"
            example = f" - {spec.examples[0]}" if spec.examples else ""
            lines.append(f"{trigger}: {spec.description}{example}")
        lines.append("Attach DOC/DOCX with a PDF caption, or PDF with a DOCX/Word caption.")
        return "\n".join(lines)

    def unique_specs(self) -> list[CommandSpec]:
        specs = []
        seen = set()
        for spec in self._commands.values():
            if spec.name in seen:
                continue
            specs.append(spec)
            seen.add(spec.name)
        return specs


def build_command_registry() -> CommandRegistry:
    registry = CommandRegistry()
    registry.register("help", "Показать команды", _help, aliases=("start",))
    registry.register("status", "Проверить runtime", _status)
    registry.register("tools", "Показать tools", _tools)
    registry.register("ping", "Проверить связь", _ping, show_in_menu=False)
    registry.register("cancel", "Отменить ожидание", _cancel, show_in_menu=False)
    registry.register("clear", "Очистить состояние чата", _clear)
    registry.register("artifacts", "Показать сохраненные результаты", _artifacts)
    registry.register("last", "Показать последний результат", _last)
    registry.register("use", "Выбрать результат", _use, examples=("/use 2",))
    registry.register("tasks", "Показать последние задачи", _tasks)
    registry.register("resume", "Продолжить остановленную задачу", _resume)
    registry.register(
        "model",
        "Выбрать AI-модель",
        _model,
        examples=("/model list openrouter",),
    )
    registry.register(
        "roles",
        "Роли AI-моделей",
        _roles,
        examples=("/roles",),
    )
    registry.register(
        "dl",
        "Скачать аудио",
        _download_audio,
        examples=("/dl <ссылки> [диапазон] [формат]",),
        requires_input=True,
        input_prompt="Пришли ссылку или ссылки на аудио/видео. Можно добавить формат: mp3, m4a, wav, flac.",
    )
    registry.register(
        "search",
        "Поиск в интернете",
        _search,
        examples=("/search latest OpenAI models",),
        requires_input=True,
        input_prompt="Что искать в интернете?",
    )
    registry.register(
        "fetch",
        "Прочитать страницу",
        _fetch,
        examples=("/fetch https://example.com",),
        requires_input=True,
        input_prompt="Пришли ссылку на страницу.",
    )
    registry.register(
        "ask",
        "Спросить ИИ",
        _ask,
        examples=("/ask объясни это коротко",),
        requires_input=True,
        input_prompt="Что спросить у ИИ?",
    )
    registry.register(
        "research",
        "Поиск + ИИ-вывод",
        _research,
        examples=("/research что нового в Telegram Bot API",),
        requires_input=True,
        input_prompt="Какой research сделать?",
    )
    return registry


def _help(context: CommandContext) -> Outgoing:
    return Outgoing(text=context.commands.help_text())


def _status(context: CommandContext) -> Outgoing:
    config = context.tool_context.config
    return Outgoing(
        text=(
            "runtime: ok\n"
            f"llm: {llm_status(config)} ({format_active_model(config)})\n"
            "router: enabled\n"
            "planner: enabled\n"
            "executor: resumable\n"
            "orchestrator: enabled (rules + cheap model on uncertain routes)\n"
            "memory: enabled\n"
            "artifacts: enabled\n"
            "web: available (search/fetch)\n"
            "browser: not connected yet\n"
            f"tools: {', '.join(context.registry.names())}"
        )
    )


def _tools(context: CommandContext) -> Outgoing:
    return Outgoing(text=context.registry.describe())


def _ping(context: CommandContext) -> Outgoing:
    return Outgoing(text="pong")


def _cancel(context: CommandContext) -> Outgoing:
    return Outgoing(text="Нечего отменять.")


def _clear(context: CommandContext) -> Outgoing:
    return Outgoing(text="Состояние чата очищено.")


def _artifacts(context: CommandContext) -> Outgoing:
    store = context.tool_context.artifact_store
    if not store:
        return Outgoing(text="Artifact store is not available.")
    return Outgoing(text=store.list_text(context.tool_context.artifact_key))


def _last(context: CommandContext) -> Outgoing:
    store = context.tool_context.artifact_store
    if not store:
        return Outgoing(text="Artifact store is not available.")
    text = store.show_text(context.tool_context.artifact_key, command_args(context.text))
    return Outgoing(text=clamp_text(text))


def _use(context: CommandContext) -> Outgoing:
    store = context.tool_context.artifact_store
    if not store:
        return Outgoing(text="Artifact store is not available.")
    ref = command_args(context.text)
    if not ref:
        return Outgoing(text="Напиши так: /use <id>")
    artifact = store.set_active(context.tool_context.artifact_key, ref)
    if not artifact:
        return Outgoing(text="Не нашел такой результат.")
    return Outgoing(text=f"Выбран результат #{artifact.id}: {artifact.title}")


def _tasks(context: CommandContext) -> Outgoing:
    store = context.tool_context.task_state
    if not store:
        return Outgoing(text="Task state is not available.")
    return Outgoing(text=store.list_text(context.tool_context.artifact_key))


def _resume(context: CommandContext) -> Outgoing:
    return resume_latest_workflow(context.root, context.registry, context.tool_context, context.commands)


def _system_with_context(base_prompt: str, user_prompt: str, context: CommandContext) -> str:
    return with_artifact_context(
        with_recent_context(
            with_language_instruction(base_prompt, user_prompt),
            context.tool_context.memory_context,
        ),
        context.tool_context.artifact_context,
    )


def _model(context: CommandContext) -> Outgoing:
    args = command_args(context.text)
    parts = args.split()
    config = context.tool_context.config

    if not parts:
        return Outgoing(
            text=(
                f"Active model: {format_active_model(config)}\n\n"
                "Commands:\n"
                "/model list all [filter]\n"
                "/model list gemini [filter]\n"
                "/model list openrouter [filter]\n"
                "/model list nvidia_nim [filter]\n"
                "/model set gemini <model-id>\n"
                "/model set openrouter <model-id>\n"
                "/model set nvidia_nim <model-id>\n"
                "/model reset\n"
                "/roles"
            )
        )

    action = parts[0].lower()
    if action == "reset":
        result = context.registry.run("reset_model", context.tool_context)
        return Outgoing(text=f"{result.message}\nActive model: {format_active_model(config)}")

    if action == "list":
        provider = normalize_provider(parts[1]) if len(parts) > 1 else "openrouter"
        query = " ".join(parts[2:]) if len(parts) > 2 else ""
        if provider == "all":
            openrouter = context.registry.run(
                "list_models",
                context.tool_context,
                provider="openrouter",
                query=query,
                limit=20,
            )
            nvidia = context.registry.run(
                "list_models",
                context.tool_context,
                provider="nvidia",
                query=query,
                limit=20,
            )
            gemini = context.registry.run(
                "list_models",
                context.tool_context,
                provider="gemini",
                query=query,
                limit=20,
            )
            return Outgoing(
                text=clamp_text((gemini.message or "") + "\n\n" + (openrouter.message or "") + "\n\n" + (nvidia.message or ""))
            )
        result = context.registry.run("list_models", context.tool_context, provider=provider, query=query, limit=35)
        return Outgoing(text=clamp_text(result.message or "Model list failed."))

    if action == "set":
        if len(parts) < 3:
            return Outgoing(text="Напиши так: /model set <gemini|openrouter|nvidia_nim> <model-id>")
        provider = normalize_provider(parts[1])
        model = " ".join(parts[2:]).strip()
        result = context.registry.run("set_model", context.tool_context, provider=provider, model=model)
        if not result.ok:
            return Outgoing(text=result.message or "Model set failed.")
        return Outgoing(text=f"{result.message}\nActive model: {format_active_model(config)}")

    provider = normalize_provider(action)
    if provider in {"gemini", "openrouter", "nvidia"} and len(parts) > 1:
        model = " ".join(parts[1:]).strip()
        result = context.registry.run("set_model", context.tool_context, provider=provider, model=model)
        if not result.ok:
            return Outgoing(text=result.message or "Model set failed.")
        return Outgoing(text=f"{result.message}\nActive model: {format_active_model(config)}")

    return Outgoing(text="Не понял. Напиши /model, /model list all или /model set <provider> <model-id>.")


def _roles(context: CommandContext) -> Outgoing:
    args = command_args(context.text)
    parts = args.split()
    config = context.tool_context.config

    if not parts:
        return Outgoing(text=format_model_roles(config))

    action = parts[0].lower()
    if action == "reset":
        try:
            reset_role_models(config, parts[1] if len(parts) > 1 else "")
        except ValueError as exc:
            return Outgoing(text=str(exc))
        return Outgoing(text=format_model_roles(config))

    if action == "set":
        if len(parts) < 4:
            return Outgoing(text="Напиши так: /roles set <role> <gemini|openrouter|nvidia_nim> <model-id>")
        role = parts[1]
        provider = parts[2]
        model = " ".join(parts[3:]).strip()
        try:
            selection = save_role_model(config, role, provider, model)
        except ValueError as exc:
            return Outgoing(text=str(exc))
        return Outgoing(text=f"Role {selection.role} set to {selection.label}.\n\n{format_model_roles(config)}")

    return Outgoing(text="Напиши /roles, /roles set <role> <provider> <model-id> или /roles reset [role].")


def _chat(context: CommandContext) -> Outgoing:
    prompt = context.text.strip()
    if not prompt:
        return Outgoing(text=context.commands.help_text())

    result = run_llm_turn(
        context.registry,
        context.tool_context,
        prompt=prompt,
        system=_system_with_context(CHAT_SYSTEM_PROMPT, prompt, context),
        role=selected_llm_role(context, prompt),
    )
    if result.ok:
        if len(result.message.strip()) >= 300:
            context.tool_context.metadata["artifact"] = {
                "kind": "answer",
                "title": prompt,
                "text": result.message,
            }
        return Outgoing(text=clamp_text(result.message))
    return Outgoing(text=result.message or "AI request failed.")


def _ask(context: CommandContext) -> Outgoing:
    prompt = command_args(context.text)
    if not prompt:
        return Outgoing(text="Напиши так: /ask <вопрос>")

    result = run_llm_turn(
        context.registry,
        context.tool_context,
        prompt=prompt,
        system=_system_with_context(CHAT_SYSTEM_PROMPT, prompt, context),
        role=selected_llm_role(context, prompt),
    )
    if result.ok:
        context.tool_context.metadata["artifact"] = {
            "kind": "answer",
            "title": prompt,
            "text": result.message,
        }
        return Outgoing(text=clamp_text(result.message))
    return Outgoing(text=result.message or "AI request failed.")


def _search(context: CommandContext) -> Outgoing:
    query = command_args(context.text)
    if not query:
        return Outgoing(text="Напиши так: /search <запрос>")

    result = context.registry.run("web_search", context.tool_context, query=query, limit=7)
    if result.ok:
        context.tool_context.metadata["artifact"] = {
            "kind": "search",
            "title": query,
            "text": result.message,
            "urls": [item.get("url", "") for item in result.raw.get("results", []) if item.get("url")],
            "metadata": {"query": query},
        }
    return Outgoing(text=clamp_text(result.message or "Search failed."))


def _fetch(context: CommandContext) -> Outgoing:
    url = first_url(command_args(context.text))
    if not url:
        return Outgoing(text="Напиши так: /fetch <url>")

    result = context.registry.run("web_fetch", context.tool_context, url=url, max_chars=3200)
    if result.ok:
        context.tool_context.metadata["artifact"] = {
            "kind": "web_page",
            "title": result.raw.get("title") or url,
            "text": result.message,
            "urls": [url],
        }
    return Outgoing(text=clamp_text(result.message or "Fetch failed."))


def _research(context: CommandContext) -> Outgoing:
    query = command_args(context.text)
    if not query:
        return Outgoing(text="Напиши так: /research <запрос>")

    search_result = context.registry.run("web_search", context.tool_context, query=query, limit=5)
    if not search_result.ok:
        return Outgoing(text=search_result.message or "Search failed.")

    results = search_result.raw.get("results", [])
    source_blocks = []
    source_lines = []
    for index, item in enumerate(results[:3], 1):
        title = item.get("title", "Untitled")
        url = item.get("url", "")
        source_lines.append(f"[{index}] {title}\n{url}")
        fetch_result = context.registry.run("web_fetch", context.tool_context, url=url, max_chars=3500)
        if fetch_result.ok:
            text = fetch_result.raw.get("text", "")
        else:
            text = item.get("snippet", "")
        source_blocks.append(f"[{index}] {title}\nURL: {url}\nTEXT:\n{text}")

    prompt = (
        f"Запрос пользователя: {query}\n\n"
        "Источники:\n\n"
        + "\n\n".join(source_blocks)
        + "\n\nСделай короткий, полезный ответ с ссылками на источники."
    )
    llm_result = run_llm_turn(
        context.registry,
        context.tool_context,
        prompt=prompt,
        system=_system_with_context(RESEARCH_SYSTEM_PROMPT, query, context),
        temperature=0.2,
        language_text=query,
        role="research",
    )

    if llm_result.ok:
        sources = "\n\nИсточники:\n" + "\n".join(source_lines)
        full_text = llm_result.message + sources
        context.tool_context.metadata["artifact"] = {
            "kind": "research",
            "title": query,
            "text": full_text,
            "urls": [item.get("url", "") for item in results[:5] if item.get("url")],
            "metadata": {"query": query},
        }
        return Outgoing(text=clamp_text(full_text))

    fallback = (
        f"Поиск сработал, но AI-вывод не получился: {llm_result.message}\n\n"
        + format_search_items(results)
    )
    context.tool_context.metadata["artifact"] = {
        "kind": "search",
        "title": query,
        "text": fallback,
        "urls": [item.get("url", "") for item in results[:5] if item.get("url")],
        "metadata": {"query": query, "llm_error": llm_result.message},
    }
    return Outgoing(text=clamp_text(fallback))


def _download_audio(context: CommandContext) -> Outgoing:
    urls, items, fmt = parse_download_request(context.text)
    result = context.registry.run("download_audio", context.tool_context, urls=urls, items=items, fmt=fmt)
    if result.ok:
        context.tool_context.metadata["artifact"] = {
            "kind": "media",
            "title": f"download {fmt}",
            "text": result.message,
            "files": result.files,
            "urls": urls,
            "metadata": {"items": items, "format": fmt},
        }
        return Outgoing(
            text=result.message,
            files=result.files,
            cleanup_files=cleanup_from_result(context.root, result.files, result.raw),
        )
    return Outgoing(text=result.message or "Download failed.")


def cleanup_from_result(root: Path, result_files: list[Path], raw: dict) -> list[Path]:
    cleanup = list(result_files)
    for key in ("downloaded_files", "converted", "files"):
        value = raw.get(key)
        if not isinstance(value, list):
            continue
        for item in value:
            path = Path(item)
            if not path.is_absolute():
                path = root / path
            cleanup.append(path)

    deduped = []
    seen = set()
    for path in cleanup:
        marker = str(path.resolve()) if path.exists() else str(path)
        if marker not in seen:
            deduped.append(path)
            seen.add(marker)
    return deduped


def format_search_items(results: list[dict]) -> str:
    lines = []
    for index, item in enumerate(results, 1):
        snippet = f"\n   {item.get('snippet', '')}" if item.get("snippet") else ""
        lines.append(f"{index}. {item.get('title', 'Untitled')}\n   {item.get('url', '')}{snippet}")
    return "\n".join(lines)


def selected_llm_role(context: CommandContext, prompt: str) -> str:
    role = str(context.tool_context.metadata.get("selected_role", "")).strip()
    return role or infer_llm_role(prompt)


def infer_llm_role(text: str) -> str:
    lowered = text.lower()
    if any(
        marker in lowered
        for marker in (
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
    ) and not any(marker in lowered for marker in ("fix", "implement", "почини", "исправь", "реализуй")):
        return "critic"
    if any(
        marker in lowered
        for marker in (
            "code",
            "coding",
            "script",
            "function",
            "bug",
            "fix",
            "refactor",
            "implement",
            "python",
            "javascript",
            "typescript",
            "код",
            "скрипт",
            "функц",
            "ошибк",
            "почини",
            "исправь",
            "реализуй",
        )
    ):
        return "coder"
    if any(
        marker in lowered
        for marker in (
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
            "кратко",
            "коротко",
            "докс",
            "документ",
            "թարգմանի",
        )
    ):
        return "writer"
    return "chat"


def command_args(text: str) -> str:
    parts = text.strip().split(maxsplit=1)
    return parts[1].strip() if len(parts) > 1 else ""


def first_url(text: str) -> str:
    match = re.search(r"https?://\S+", text)
    return match.group(0).rstrip(").,]") if match else ""


def clamp_text(text: str, limit: int = 3600) -> str:
    text = text.strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def normalize_command_name(name: str) -> str:
    return name.strip().lower().lstrip("/")


def first_command_token(text: str) -> str:
    token = text.strip().split(maxsplit=1)[0] if text.strip() else ""
    if not token.startswith("/"):
        return ""
    return normalize_command_name(token.split("@", 1)[0])
