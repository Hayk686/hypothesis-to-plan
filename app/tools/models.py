from __future__ import annotations

import json
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any

from app.config import RuntimeConfig, load_config
from app.tools.common import ToolResult


OPENROUTER_PROVIDER = "openrouter"
NVIDIA_PROVIDER = "nvidia"
GEMINI_PROVIDER = "gemini"
PROVIDERS = {OPENROUTER_PROVIDER, NVIDIA_PROVIDER, GEMINI_PROVIDER}


@dataclass(frozen=True)
class ModelSelection:
    provider: str
    model: str
    api_base: str
    api_key: str
    provider_type: str = "openai_compatible"

    @property
    def configured(self) -> bool:
        return bool(self.provider and self.model and self.api_base and self.api_key)


def active_model_selection(config: RuntimeConfig | None = None) -> ModelSelection:
    config = config or load_config()
    state = load_model_state(config)
    provider = state.get("provider") or OPENROUTER_PROVIDER
    model = state.get("model") or config.llm_model
    return model_selection(config, provider, model)


def model_selection(config: RuntimeConfig, provider: str, model: str) -> ModelSelection:
    provider = normalize_provider(provider)
    if provider == GEMINI_PROVIDER:
        return ModelSelection(
            provider=GEMINI_PROVIDER,
            model=model,
            api_base=config.gemini_api_base,
            api_key=config.gemini_api_key,
            provider_type="gemini",
        )
    if provider == NVIDIA_PROVIDER:
        return ModelSelection(
            provider=NVIDIA_PROVIDER,
            model=model,
            api_base=config.nvidia_api_base,
            api_key=config.nvidia_api_key,
            provider_type="openai_compatible",
        )
    return ModelSelection(
        provider=OPENROUTER_PROVIDER,
        model=model,
        api_base=config.llm_api_base,
        api_key=config.llm_api_key,
        provider_type="openai_compatible",
    )


def load_model_state(config: RuntimeConfig) -> dict[str, str]:
    path = config.state_dir / "model_selection.json"
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}
    provider = normalize_provider(str(data.get("provider", "")))
    model = str(data.get("model", "")).strip()
    if provider not in PROVIDERS or not model:
        return {}
    return {"provider": provider, "model": model}


def save_model_state(config: RuntimeConfig, provider: str, model: str) -> None:
    provider = normalize_provider(provider)
    if provider not in PROVIDERS:
        raise ValueError(f"Unknown provider: {provider}")
    model = model.strip()
    if not model:
        raise ValueError("Model id is empty.")
    config.state_dir.mkdir(parents=True, exist_ok=True)
    path = config.state_dir / "model_selection.json"
    path.write_text(
        json.dumps({"provider": provider, "model": model}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def reset_model_state(config: RuntimeConfig) -> None:
    path = config.state_dir / "model_selection.json"
    if path.exists():
        path.unlink()


def format_active_model(config: RuntimeConfig | None = None) -> str:
    config = config or load_config()
    selection = active_model_selection(config)
    status = "configured" if selection.configured else "not configured"
    return f"{selection.provider}/{selection.model} ({status})"


def list_models(
    provider: str,
    config: RuntimeConfig | None = None,
    query: str = "",
    limit: int = 30,
) -> ToolResult:
    config = config or load_config()
    provider = normalize_provider(provider)
    if provider == OPENROUTER_PROVIDER:
        return list_openrouter_free_models(config, query=query, limit=limit)
    if provider == NVIDIA_PROVIDER:
        return list_nvidia_models(config, query=query, limit=limit)
    if provider == GEMINI_PROVIDER:
        return list_gemini_models(config, query=query, limit=limit)
    return ToolResult(ok=False, message=f"Unknown provider: {provider}")


def list_openrouter_free_models(
    config: RuntimeConfig | None = None,
    query: str = "",
    limit: int = 30,
) -> ToolResult:
    config = config or load_config()
    try:
        data = http_json(config.llm_api_base.rstrip("/") + "/models")
    except Exception as exc:
        return ToolResult(ok=False, message=f"OpenRouter model list failed: {exc}")

    models = []
    for item in data.get("data", []):
        if not isinstance(item, dict):
            continue
        model_id = str(item.get("id", "")).strip()
        if not model_id:
            continue
        pricing = item.get("pricing") or {}
        prompt_price = str(pricing.get("prompt", "")).strip()
        completion_price = str(pricing.get("completion", "")).strip()
        is_free = model_id.endswith(":free") or (
            prompt_price in {"0", "0.0", "0.000000"} and completion_price in {"0", "0.0", "0.000000"}
        )
        if not is_free:
            continue
        models.append(normalize_model_item(OPENROUTER_PROVIDER, item))

    models = filter_models(models, query)
    return ToolResult(
        ok=True,
        message=format_model_list("OpenRouter free models", models, limit),
        raw={"provider": OPENROUTER_PROVIDER, "models": models, "total": len(models)},
    )


def list_nvidia_models(
    config: RuntimeConfig | None = None,
    query: str = "",
    limit: int = 30,
) -> ToolResult:
    config = config or load_config()
    if not config.nvidia_api_key:
        return ToolResult(
            ok=False,
            message=(
                "NVIDIA API key is not configured. Set NVIDIA_API_KEY or create "
                "picoclaw/nvidia_api_key.txt."
            ),
        )

    try:
        data = http_json(
            config.nvidia_api_base.rstrip("/") + "/models",
            api_key=config.nvidia_api_key,
        )
    except Exception as exc:
        return ToolResult(ok=False, message=f"NVIDIA NIM model list failed: {exc}")

    models = []
    for item in data.get("data", []):
        if isinstance(item, dict) and item.get("id"):
            models.append(normalize_model_item(NVIDIA_PROVIDER, item))

    models = filter_models(models, query)
    return ToolResult(
        ok=True,
        message=format_model_list("NVIDIA NIM models", models, limit),
        raw={"provider": NVIDIA_PROVIDER, "models": models, "total": len(models)},
    )


def list_gemini_models(
    config: RuntimeConfig | None = None,
    query: str = "",
    limit: int = 30,
) -> ToolResult:
    config = config or load_config()
    if not config.gemini_api_key:
        return ToolResult(
            ok=False,
            message="Gemini API key is not configured. Set GEMINI_API_KEY or create picoclaw/gemini_api_key.txt.",
        )

    try:
        data = http_json(
            config.gemini_api_base.rstrip("/") + "/models?key=" + urllib.parse.quote(config.gemini_api_key),
        )
    except Exception as exc:
        return ToolResult(ok=False, message=f"Gemini model list failed: {exc}")

    models = []
    for item in data.get("models", []):
        if not isinstance(item, dict):
            continue
        name = str(item.get("name", "")).removeprefix("models/").strip()
        if not name:
            continue
        models.append(
            {
                "provider": GEMINI_PROVIDER,
                "id": name,
                "name": str(item.get("displayName") or name).strip(),
                "context_length": item.get("inputTokenLimit") or "",
            }
        )

    models = filter_models(models, query)
    return ToolResult(
        ok=True,
        message=format_model_list("Gemini models", models, limit),
        raw={"provider": GEMINI_PROVIDER, "models": models, "total": len(models)},
    )


def http_json(url: str, api_key: str = "") -> dict[str, Any]:
    headers = {
        "User-Agent": "LocalAgentRuntime/0.1",
        "Accept": "application/json",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))


def normalize_model_item(provider: str, item: dict[str, Any]) -> dict[str, Any]:
    model_id = str(item.get("id", "")).strip()
    return {
        "provider": provider,
        "id": model_id,
        "name": str(item.get("name") or item.get("owned_by") or model_id).strip(),
        "context_length": item.get("context_length") or item.get("max_context_length") or "",
    }


def filter_models(models: list[dict[str, Any]], query: str) -> list[dict[str, Any]]:
    query = query.strip().lower()
    if not query:
        return models
    terms = query.split()
    return [
        item
        for item in models
        if all(term in f"{item.get('id', '')} {item.get('name', '')}".lower() for term in terms)
    ]


def format_model_list(title: str, models: list[dict[str, Any]], limit: int) -> str:
    limit = max(1, min(int(limit or 30), 80))
    if not models:
        return f"{title}: nothing found."

    lines = [f"{title} ({len(models)} found):"]
    for index, item in enumerate(models[:limit], 1):
        context = f", ctx {item['context_length']}" if item.get("context_length") else ""
        lines.append(f"{index}. {item['provider']} {item['id']}{context}")
    if len(models) > limit:
        lines.append(f"...and {len(models) - limit} more. Use /model list <provider> <filter>.")
    lines.append("Set: /model set <provider> <model-id>")
    return "\n".join(lines)


def normalize_provider(provider: str) -> str:
    provider = provider.strip().lower()
    aliases = {
        "or": OPENROUTER_PROVIDER,
        "open-router": OPENROUTER_PROVIDER,
        "open_router": OPENROUTER_PROVIDER,
        "google": GEMINI_PROVIDER,
        "google-ai": GEMINI_PROVIDER,
        "google_ai": GEMINI_PROVIDER,
        "nim": NVIDIA_PROVIDER,
        "nvidia-nim": NVIDIA_PROVIDER,
        "nvidia_nim": NVIDIA_PROVIDER,
    }
    return aliases.get(provider, provider)
