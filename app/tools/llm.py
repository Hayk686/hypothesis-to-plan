from __future__ import annotations

import json
import socket
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from app.config import RuntimeConfig, load_config
from app.tools.common import ToolResult
from app.tools.models import GEMINI_PROVIDER, active_model_selection, format_active_model, model_selection


def llm_status(config: RuntimeConfig | None = None) -> str:
    config = config or load_config()
    selection = active_model_selection(config)
    return "configured" if selection.configured else "not configured"


def llm_timeout(selection) -> int:
    return 120


@dataclass(frozen=True)
class LlmAttempt:
    provider: str
    model: str
    ok: bool
    message: str = ""
    status: int | None = None


OPENROUTER_FALLBACK_MODELS = (
    "openai/gpt-oss-120b:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemma-3-27b-it:free",
)
NVIDIA_FALLBACK_MODELS = (
    "nvidia/nemotron-3-super-120b-a12b",
    "nvidia/llama-3.1-nemotron-70b-instruct",
)


def llm_chat(
    prompt: str,
    system: str = "",
    config: RuntimeConfig | None = None,
    temperature: float = 0.2,
    provider: str = "",
    model: str = "",
    fallbacks: list[dict[str, str]] | None = None,
    resilient: bool = True,
    response_format: str = "",
    json_schema: dict[str, Any] | None = None,
) -> ToolResult:
    config = config or load_config()
    prompt = prompt.strip()
    if not prompt:
        return ToolResult(ok=False, message="Prompt is empty.")

    attempts: list[LlmAttempt] = []
    selections = candidate_selections(
        config,
        provider=provider,
        model=model,
        fallbacks=fallbacks,
        resilient=resilient,
    )
    if not selections:
        return ToolResult(ok=False, message="No configured LLM provider is available.")

    last_result: ToolResult | None = None
    for selection in selections:
        result = _llm_chat_once(
            prompt,
            system,
            config,
            temperature,
            selection,
            response_format=response_format,
            json_schema=json_schema,
        )
        attempts.append(
            LlmAttempt(
                provider=selection.provider,
                model=selection.model,
                ok=result.ok,
                message=result.message,
                status=result.raw.get("status"),
            )
        )
        if result.ok:
            raw = dict(result.raw)
            raw["attempts"] = [attempt.__dict__ for attempt in attempts]
            return ToolResult(ok=True, message=result.message, raw=raw)

        last_result = result
        if not resilient or not should_try_next_model(result):
            break

    if last_result:
        raw = dict(last_result.raw)
        raw["attempts"] = [attempt.__dict__ for attempt in attempts]
        tried = ", ".join(f"{item.provider}/{item.model}" for item in attempts)
        return ToolResult(
            ok=False,
            message=f"{last_result.message}\nTried models: {tried}",
            raw=raw,
            stdout=last_result.stdout,
            stderr=last_result.stderr,
        )
    return ToolResult(ok=False, message="LLM request failed before any attempt.")


def _llm_chat_once(
    prompt: str,
    system: str,
    config: RuntimeConfig,
    temperature: float,
    selection,
    *,
    response_format: str = "",
    json_schema: dict[str, Any] | None = None,
) -> ToolResult:
    if not selection.api_key:
        return ToolResult(
            ok=False,
            message=f"LLM API key is not configured for provider: {selection.provider}.",
            raw={"provider": selection.provider, "model": selection.model},
        )

    if selection.provider == GEMINI_PROVIDER or selection.provider_type == "gemini":
        return _gemini_chat_once(
            prompt,
            system,
            config,
            temperature,
            selection,
            response_format=response_format,
            json_schema=json_schema,
        )
    return _openai_compatible_chat_once(
        prompt,
        system,
        config,
        temperature,
        selection,
        response_format=response_format,
    )


def _openai_compatible_chat_once(
    prompt: str,
    system: str,
    config: RuntimeConfig,
    temperature: float,
    selection,
    *,
    response_format: str = "",
) -> ToolResult:
    messages = []
    if system.strip():
        messages.append({"role": "system", "content": system.strip()})
    messages.append({"role": "user", "content": prompt})

    payload = {
        "model": selection.model,
        "messages": messages,
        "temperature": temperature,
    }
    if response_format in {"json", "json_object", "json_schema"}:
        payload["response_format"] = {"type": "json_object"}
    request = urllib.request.Request(
        selection.api_base.rstrip("/") + "/chat/completions",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {selection.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost/agent-runtime",
            "X-Title": "Local Agent Runtime",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=llm_timeout(selection)) as response:
            data = json.loads(response.read().decode("utf-8"))
    except socket.timeout:
        return ToolResult(
            ok=False,
            message=f"LLM request timed out after {llm_timeout(selection)}s: {selection.provider}/{selection.model}",
            raw={"provider": selection.provider, "model": selection.model, "timeout": llm_timeout(selection)},
        )
    except TimeoutError:
        return ToolResult(
            ok=False,
            message=f"LLM request timed out after {llm_timeout(selection)}s: {selection.provider}/{selection.model}",
            raw={"provider": selection.provider, "model": selection.model, "timeout": llm_timeout(selection)},
        )
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        return ToolResult(
            ok=False,
            message=f"LLM HTTP {exc.code}: {detail}",
            raw={"provider": selection.provider, "model": selection.model, "status": exc.code},
        )
    except Exception as exc:
        return ToolResult(
            ok=False,
            message=f"LLM request failed for {selection.provider}/{selection.model}: {exc}",
            raw={"provider": selection.provider, "model": selection.model},
        )

    try:
        content = data["choices"][0]["message"]["content"].strip()
    except Exception:
        return ToolResult(ok=False, message="LLM response did not contain assistant content.", raw=data)

    return ToolResult(
        ok=True,
        message=content,
        raw={"provider": selection.provider, "model": selection.model, "active": format_active_model(config)},
    )


def _gemini_chat_once(
    prompt: str,
    system: str,
    config: RuntimeConfig,
    temperature: float,
    selection,
    *,
    response_format: str = "",
    json_schema: dict[str, Any] | None = None,
) -> ToolResult:
    model_id = selection.model.removeprefix("models/")
    url = (
        selection.api_base.rstrip()
        .rstrip("/")
        + "/models/"
        + urllib.parse.quote(model_id, safe="")
        + ":generateContent?key="
        + urllib.parse.quote(selection.api_key)
    )
    generation_config: dict[str, Any] = {"temperature": temperature}
    if response_format in {"json", "json_object", "json_schema"}:
        generation_config["responseMimeType"] = "application/json"
        if json_schema:
            generation_config["responseSchema"] = json_schema

    payload: dict[str, Any] = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": generation_config,
    }
    if system.strip():
        payload["systemInstruction"] = {"parts": [{"text": system.strip()}]}

    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(request, timeout=llm_timeout(selection)) as response:
            data = json.loads(response.read().decode("utf-8"))
    except socket.timeout:
        return ToolResult(
            ok=False,
            message=f"LLM request timed out after {llm_timeout(selection)}s: {selection.provider}/{selection.model}",
            raw={"provider": selection.provider, "model": selection.model, "timeout": llm_timeout(selection)},
        )
    except TimeoutError:
        return ToolResult(
            ok=False,
            message=f"LLM request timed out after {llm_timeout(selection)}s: {selection.provider}/{selection.model}",
            raw={"provider": selection.provider, "model": selection.model, "timeout": llm_timeout(selection)},
        )
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:500]
        return ToolResult(
            ok=False,
            message=f"LLM HTTP {exc.code}: {detail}",
            raw={"provider": selection.provider, "model": selection.model, "status": exc.code},
        )
    except Exception as exc:
        return ToolResult(
            ok=False,
            message=f"LLM request failed for {selection.provider}/{selection.model}: {exc}",
            raw={"provider": selection.provider, "model": selection.model},
        )

    try:
        parts = data["candidates"][0]["content"]["parts"]
        content = "\n".join(str(part.get("text", "")) for part in parts if part.get("text")).strip()
    except Exception:
        return ToolResult(ok=False, message="LLM response did not contain assistant content.", raw=data)

    return ToolResult(
        ok=True,
        message=content,
        raw={"provider": selection.provider, "model": selection.model, "active": format_active_model(config)},
    )


def candidate_selections(
    config: RuntimeConfig,
    provider: str = "",
    model: str = "",
    fallbacks: list[dict[str, str]] | None = None,
    resilient: bool = True,
):
    candidates = []
    if provider and model:
        candidates.append(model_selection(config, provider, model))
        if not resilient:
            return candidates

    if resilient:
        for item in fallbacks or []:
            item_provider = str(item.get("provider", "")).strip()
            item_model = str(item.get("model", "")).strip()
            if item_provider and item_model:
                candidates.append(model_selection(config, item_provider, item_model))

    candidates.append(active_model_selection(config))
    if resilient:
        for item in OPENROUTER_FALLBACK_MODELS:
            candidates.append(model_selection(config, "openrouter", item))
        for item in NVIDIA_FALLBACK_MODELS:
            candidates.append(model_selection(config, "nvidia", item))

    deduped = []
    seen = set()
    for selection in candidates:
        marker = (selection.provider, selection.model)
        if marker in seen:
            continue
        seen.add(marker)
        if not selection.configured:
            continue
        deduped.append(selection)
    return deduped


def should_try_next_model(result: ToolResult) -> bool:
    message = (result.message or "").lower()
    status = result.raw.get("status")
    if status in {408, 409, 425, 429, 500, 502, 503, 504, 529}:
        return True
    markers = (
        "timed out",
        "timeout",
        "rate limit",
        "rate_limit",
        "quota",
        "limit",
        "exhaust",
        "temporarily",
        "overloaded",
        "unavailable",
        "try again",
        "resource exhausted",
        "deadline",
    )
    return any(marker in message for marker in markers)
