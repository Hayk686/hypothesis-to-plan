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
from app.core.role_prompts import role_system_prompt
from app.core.tool_registry import ToolContext, ToolRegistry
from app.core.types import Outgoing
from app.tools.llm import llm_status
from app.tools.media import parse_download_request
from app.tools.models import format_active_model, normalize_provider


CommandHandler = Callable[["CommandContext"], Outgoing]

CHAT_SYSTEM_PROMPT_FALLBACK = (
    "Ты локальный Telegram-ассистент владельца. "
    "Отвечай на языке пользователя: русском, армянском или английском. "
    "Пиши кратко, естественно и честно. "
    "Не отправляй пользователю slash-команды как финальный ответ. "
    "Если вопрос можно объяснить из общих знаний, отвечай сразу. "
    "Если нужна свежая информация из интернета, скажи это обычными словами; runtime сам выберет web/research маршрут."
)

RESEARCH_SYSTEM_PROMPT_FALLBACK = (
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
    registry.register("verify", "Проверить ссылку", _verify_url, show_in_menu=False)
    registry.register(
        "browser",
        "Open a page in browser",
        _browser,
        examples=("/browser https://example.com",),
        requires_input=True,
        input_prompt="Send a URL to open in the browser. Use: screenshot <url> for a screenshot.",
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
    browser_result = context.registry.run("browser_status", context.tool_context)
    browser_line = browser_result.message or ("browser: available" if browser_result.ok else "browser: unavailable")
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
            f"{browser_line}\n"
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
        system=_system_with_context(system_prompt_for_selected_role(context, prompt), prompt, context),
        role=selected_llm_role(context, prompt),
    )
    if result.ok:
        command_outgoing = command_reply_outgoing(context, result.message)
        if command_outgoing:
            return command_outgoing
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
        system=_system_with_context(system_prompt_for_selected_role(context, prompt), prompt, context),
        role=selected_llm_role(context, prompt),
    )
    if result.ok:
        command_outgoing = command_reply_outgoing(context, result.message)
        if command_outgoing:
            return command_outgoing
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


def _verify_url(context: CommandContext) -> Outgoing:
    url = first_url(command_args(context.text))
    if not url:
        return Outgoing(text="Пришли ссылку, которую нужно проверить.")

    terms = active_verification_terms(context)
    if not terms:
        return Outgoing(text="Не понял, с какими данными сравнивать эту ссылку.")

    result = context.registry.run("web_fetch", context.tool_context, url=url, max_chars=20000)
    used_tool = "web_fetch"
    if result.ok:
        title = result.raw.get("title", "") or url
        text = result.raw.get("text", "") or result.message
    else:
        browser_result = context.registry.run(
            "browser_read",
            context.tool_context,
            url=url,
            max_chars=20000,
            screenshot=False,
        )
        if not browser_result.ok:
            return Outgoing(
                text=(
                    "Не смог проверить ссылку напрямую.\n"
                    f"web_fetch: {result.message or 'failed'}\n"
                    f"browser_read: {browser_result.message or 'failed'}"
                )
            )
        result = browser_result
        used_tool = "browser_read"
        title = result.raw.get("title", "") or url
        text = result.raw.get("text", "") or result.message

    haystack = page_match_text(title, text)
    found = [term for term in terms if term in haystack]
    missing = [term for term in terms if term not in haystack]

    if unreliable_page_check(url, title, text, found):
        answer = (
            "Не смог надёжно проверить страницу: похоже, сайт не отдал публичное содержимое профиля. "
            "Нужно открыть её через browser/авторизованный доступ или прислать текст/скрин."
        )
    elif missing:
        answer = "Не подходит. В прочитанной странице не нашёл: " + ", ".join(missing)
        if found:
            answer += "\nНашёл: " + ", ".join(found)
    else:
        answer = f"Да, эта ссылка подходит: {url}"

    context.tool_context.metadata["artifact"] = {
        "kind": "url_check",
        "title": url,
        "text": answer,
        "urls": [url],
        "metadata": {"terms": terms, "found": found, "missing": missing, "tool": used_tool},
    }
    return Outgoing(text=clamp_text(answer))


def _browser(context: CommandContext) -> Outgoing:
    args = command_args(context.text)
    if not args:
        return Outgoing(text="Write: /browser <url> or /browser screenshot <url>")

    screenshot = browser_wants_screenshot(args)
    url = browser_url_from_args(args)
    if not url:
        return Outgoing(text="Write: /browser <url> or /browser screenshot <url>")

    result = context.registry.run(
        "browser_read",
        context.tool_context,
        url=url,
        max_chars=3200,
        screenshot=screenshot,
    )
    if result.ok:
        context.tool_context.metadata["artifact"] = {
            "kind": "browser_page",
            "title": result.raw.get("title") or url,
            "text": result.raw.get("text") or result.message,
            "files": result.files,
            "urls": [url, *[item.get("url", "") for item in result.raw.get("links", []) if item.get("url")]],
            "metadata": {"url": result.raw.get("url") or url, "screenshot": screenshot},
        }
        return Outgoing(text=clamp_text(result.message or "Browser read finished."), files=result.files, cleanup_files=result.files)
    return Outgoing(text=result.message or "Browser read failed.")


def _research(context: CommandContext) -> Outgoing:
    query = resolve_research_query(command_args(context.text), context)
    if not query:
        return Outgoing(text="Напиши так: /research <запрос>")

    if ambiguous_link_format_request(query):
        return Outgoing(text="Какой формат нужен: одна проверенная ссылка, несколько ссылок, или краткий вывод с источниками?")

    single_link = single_link_request(query)
    search_query = " ".join(single_link_terms(query)) if single_link else query
    search_result = context.registry.run("web_search", context.tool_context, query=search_query or query, limit=8 if single_link else 5)
    if not search_result.ok:
        return Outgoing(text=search_result.message or "Search failed.")

    results = search_result.raw.get("results", [])
    source_blocks = []
    source_lines = []
    source_records = []
    source_limit = 8 if single_link else 3
    for index, item in enumerate(results[:source_limit], 1):
        title = item.get("title", "Untitled")
        url = item.get("url", "")
        source_lines.append(f"[{index}] {title}\n{url}")
        fetch_result = context.registry.run("web_fetch", context.tool_context, url=url, max_chars=20000 if single_link else 3500)
        if fetch_result.ok:
            text = fetch_result.raw.get("text", "")
        else:
            text = item.get("snippet", "")
        source_records.append({"item": item, "fetch_ok": fetch_result.ok, "fetch_message": fetch_result.message, "text": text})
        source_blocks.append(f"[{index}] {title}\nURL: {url}\nTEXT:\n{text}")

    if single_link:
        return single_link_research_outgoing(context, query, results, source_records)

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
        system=_system_with_context(role_system_prompt(context.root, "research", RESEARCH_SYSTEM_PROMPT_FALLBACK), query, context),
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


def single_link_request(query: str) -> bool:
    lowered = query.lower()
    markers = (
        "только одну",
        "одну конкретную",
        "одну ссылку",
        "только ссылку",
        "только url",
        "только один url",
        "один url",
        "one link",
        "single link",
        "only one link",
        "just one link",
        "only the url",
        "only url",
    )
    return any(marker in lowered for marker in markers)


def multiple_links_request(query: str) -> bool:
    lowered = query.lower()
    markers = (
        "несколько ссыл",
        "список ссыл",
        "ссылки",
        "источники",
        "с источниками",
        "links",
        "sources",
        "multiple links",
        "several links",
        "list of links",
    )
    if any(marker in lowered for marker in markers):
        return True
    return bool(re.search(r"\b\d+\s+(?:ссыл|links?|sources?)", lowered))


def ambiguous_link_format_request(query: str) -> bool:
    lowered = query.lower()
    if single_link_request(query) or multiple_links_request(query):
        return False
    markers = (
        "ссылку",
        "ссылка",
        "линк",
        "url",
        "link",
    )
    return any(marker in lowered for marker in markers)


def single_link_research_outgoing(
    context: CommandContext,
    query: str,
    results: list[dict],
    source_records: list[dict],
) -> Outgoing:
    terms = single_link_terms(query)
    url = verified_single_link(source_records, terms)
    if url:
        text = url
    else:
        if terms:
            text = "Не нашёл проверенную ссылку, где в прочитанном источнике есть все данные: " + ", ".join(terms)
        else:
            text = "Не понял, какие данные нужно проверить для одной конкретной ссылки."

    context.tool_context.metadata["artifact"] = {
        "kind": "research",
        "title": query,
        "text": text,
        "urls": [item.get("url", "") for item in results[:5] if item.get("url")],
        "metadata": {"query": query, "single_link": True, "terms": terms},
    }
    return Outgoing(text=clamp_text(text))


def verified_single_link(source_records: list[dict], terms: list[str]) -> str:
    if not terms:
        return ""

    for record in source_records:
        if not record.get("fetch_ok"):
            continue
        item = record.get("item", {})
        url = item.get("url", "")
        haystack = source_match_text(record)
        if url and all(term in haystack for term in terms):
            return url
    return ""


def source_match_text(record: dict) -> str:
    item = record.get("item", {})
    text = " ".join(
        (
            item.get("title", ""),
            item.get("url", ""),
            item.get("snippet", ""),
            record.get("text", ""),
        )
    )
    return re.sub(r"\s+", " ", text.lower())


def single_link_terms(query: str) -> list[str]:
    stopwords = {
        "a",
        "an",
        "and",
        "for",
        "from",
        "find",
        "give",
        "has",
        "have",
        "internet",
        "link",
        "one",
        "only",
        "search",
        "send",
        "single",
        "that",
        "the",
        "these",
        "this",
        "url",
        "web",
        "with",
        "в",
        "все",
        "всё",
        "где",
        "дай",
        "данные",
        "есть",
        "имеет",
        "интернете",
        "которая",
        "конкретная",
        "конкретную",
        "найди",
        "один",
        "одна",
        "одну",
        "отправь",
        "поищи",
        "поиск",
        "ссылка",
        "ссылку",
        "только",
        "эти",
        "эта",
        "это",
    }
    terms = []
    for token in re.findall(r"[A-Za-zА-Яа-яЁё]+|\d{2,}", query.lower()):
        if token in stopwords:
            continue
        if len(token) < 3 and not token.isdigit():
            continue
        if token not in terms:
            terms.append(token)
    return terms[:12]


def active_verification_terms(context: CommandContext) -> list[str]:
    store = context.tool_context.artifact_store
    if not store:
        return []
    artifact = store.resolve(context.tool_context.artifact_key)
    if not artifact:
        return []

    metadata = artifact.metadata or {}
    raw_terms = metadata.get("terms")
    if isinstance(raw_terms, list):
        terms = [str(term).strip().lower() for term in raw_terms if str(term).strip()]
        if terms:
            return terms[:12]

    query = str(metadata.get("query") or artifact.title or "")
    if single_link_request(query):
        return single_link_terms(query)
    return []


def page_match_text(title: str, text: str) -> str:
    value = f"{title}\n{text}".lower().replace("\x00", " ")
    return re.sub(r"\s+", " ", value)


def unreliable_page_check(url: str, title: str, text: str, found_terms: list[str]) -> bool:
    lowered_url = url.lower()
    haystack = page_match_text(title, text)
    gated_site = any(domain in lowered_url for domain in ("linkedin.com", "researchgate.net", "facebook.com", "instagram.com"))
    if not gated_site:
        return False
    gated_markers = (
        "sign in",
        "join linkedin",
        "login",
        "log in",
        "authwall",
        "captcha",
        "forbidden",
        "403",
        "page not found",
        "can’t seem to find the page",
        "can't seem to find the page",
        "404",
        "enable javascript",
    )
    return len(found_terms) < 2 and any(marker in haystack for marker in gated_markers)


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


def command_reply_outgoing(context: CommandContext, message: str) -> Outgoing | None:
    command = command_reply_text(message)
    if not command:
        return None
    task_logger = getattr(context.tool_context, "logger", None)
    if task_logger and hasattr(task_logger, "event"):
        task_logger.event("command_reply_redirected", task_id=context.tool_context.task_id, command=command)
    return context.commands.run(command, context.root, context.registry, context.tool_context)


def system_prompt_for_selected_role(context: CommandContext, prompt: str) -> str:
    role = selected_llm_role(context, prompt)
    fallback = CHAT_SYSTEM_PROMPT_FALLBACK
    return role_system_prompt(context.root, role, fallback)


def command_reply_text(message: str) -> str:
    text = message.strip()
    if text.startswith("```") and text.endswith("```"):
        text = re.sub(r"^```(?:text|plain)?\s*", "", text, flags=re.IGNORECASE).strip()
        text = re.sub(r"\s*```$", "", text).strip()
    if "\n" in text:
        return ""
    match = re.fullmatch(r"/(research|search|fetch|browser)\s+(.+)", text, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return ""
    args = match.group(2).strip()
    if not args:
        return ""
    return f"/{match.group(1).lower()} {args}"


def resolve_research_query(query: str, context: CommandContext) -> str:
    query = query.strip()
    if not query:
        return ""

    lowered = query.lower()
    if not weak_reference_query(lowered):
        return query

    target = latest_search_target(context)
    if not target:
        return query

    if any(marker in lowered for marker in ("найди", "поищи", "поиск", "research", "find", "search")):
        return target
    return f"{query} {target}"


def weak_reference_query(lowered: str) -> bool:
    stripped = re.sub(r"\s+", " ", lowered).strip(" .,!?:;")
    references = ("его", "ее", "её", "это", "этого", "тот", "та", "он", "она", "him", "her", "it", "that")
    if stripped in references:
        return True
    if len(stripped.split()) <= 4 and any(ref in stripped.split() for ref in references):
        return True
    return any(phrase in stripped for phrase in ("найди его", "найди её", "найди ее", "find him", "find her"))


def latest_search_target(context: CommandContext) -> str:
    candidates = []
    candidates.extend(extract_recent_user_lines(context.tool_context.memory_context))
    store = context.tool_context.artifact_store
    if store:
        artifact = store.resolve(context.tool_context.artifact_key)
        if artifact:
            candidates.append(artifact.title)
            candidates.append(artifact.text[:500])

    for candidate in reversed(candidates):
        target = extract_named_query(candidate)
        if target:
            return target
    return ""


def extract_recent_user_lines(memory_context: str) -> list[str]:
    lines = []
    for line in memory_context.splitlines():
        marker = "- user:"
        if marker not in line:
            continue
        lines.append(line.split(marker, 1)[1].strip())
    return lines


def extract_named_query(text: str) -> str:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return ""

    hayk = re.search(r"Hayk\s+Hovhannisyan(?:\s+NPUA)?(?:\s+nuclear\s+engineering)?", text, re.IGNORECASE)
    if hayk:
        return hayk.group(0).strip()

    quoted = re.search(r"[\"'«“]([^\"'»”]{4,120})[\"'»”]", text)
    if quoted:
        return quoted.group(1).strip()

    if any(marker in text.lower() for marker in ("кто такой", "найди", "поищи", "research", "find", "search")):
        cleaned = re.sub(
            r"(?i)\b(кто такой|найди|поищи|поиск|research|find|search|look up|так|его|ее|её|это|про|about)\b",
            " ",
            text,
        )
        cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.!?:;")
        if 4 <= len(cleaned) <= 120:
            return cleaned
    return ""


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
        return "chat"
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


def browser_wants_screenshot(args: str) -> bool:
    lowered = args.lower()
    first = args.strip().split(maxsplit=1)[0].lower() if args.strip() else ""
    return first in {"screenshot", "shot", "screen"} or "screenshot" in lowered or "скриншот" in lowered


def browser_url_from_args(args: str) -> str:
    url = first_url(args)
    if url:
        return url
    cleaned = re.sub(r"^(open|read|screenshot|shot|screen)\s+", "", args.strip(), flags=re.IGNORECASE).strip()
    first = cleaned.split(maxsplit=1)[0].strip(".,)]}") if cleaned else ""
    if re.fullmatch(r"[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:/\S*)?", first):
        return "https://" + first
    return ""


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
