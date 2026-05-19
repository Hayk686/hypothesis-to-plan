from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from app.config import RuntimeConfig
from app.tools.models import PROVIDERS, active_model_selection, model_selection, normalize_provider


ROLE_ORDER = ("orchestrator", "controller", "chat", "research", "coder", "writer", "critic")

ROLE_DESCRIPTIONS = {
    "orchestrator": "cheap JSON router used only when rules are unsure",
    "controller": "plans and coordinates multi-step work",
    "chat": "normal daily conversation",
    "research": "summarizes web/search results with sources",
    "coder": "coding and technical implementation",
    "writer": "translation, rewriting, documents",
    "critic": "quality checks and repair decisions",
}

ROLE_ALIASES = {
    "router": "orchestrator",
    "planner": "controller",
    "code": "coder",
    "coding": "coder",
    "dev": "coder",
    "search": "research",
    "web": "research",
    "translate": "writer",
    "translator": "writer",
    "writing": "writer",
    "review": "critic",
    "checker": "critic",
    "default": "chat",
}

DEFAULT_ROLE_CONFIGS: dict[str, dict[str, Any]] = {
    "orchestrator": {
        "provider": "gemini",
        "model": "gemini-2.5-flash-lite",
        "temperature": 0.0,
        "response_format": "json_schema",
    },
    "controller": {
        "provider": "openrouter",
        "model": "nvidia/nemotron-3-super-120b-a12b:free",
        "fallback_models": ("openai/gpt-oss-120b:free", "deepseek/deepseek-v4-flash:free"),
        "temperature": 0.1,
    },
    "chat": {
        "provider": "gemini",
        "model": "gemini-2.5-flash-lite",
        "fallback_provider": "openrouter",
        "fallback_models": ("google/gemma-4-31b-it:free", "openrouter/free"),
        "temperature": 0.6,
    },
    "research": {
        "provider": "openrouter",
        "model": "deepseek/deepseek-v4-flash:free",
        "fallback_models": ("nvidia/nemotron-3-super-120b-a12b:free", "openai/gpt-oss-120b:free"),
        "temperature": 0.2,
        "require_sources": True,
    },
    "coder": {
        "provider": "openrouter",
        "model": "deepseek/deepseek-v4-flash:free",
        "fallback_models": (
            "poolside/laguna-m-1:free",
            "baidu/cobuddy:free",
            "openai/gpt-oss-120b:free",
        ),
        "temperature": 0.1,
    },
    "writer": {
        "provider": "gemini",
        "model": "gemini-2.5-flash-lite",
        "fallback_provider": "openrouter",
        "fallback_models": ("google/gemma-4-31b-it:free",),
        "temperature": 0.5,
    },
    "critic": {
        "provider": "openrouter",
        "model": "openai/gpt-oss-120b:free",
        "fallback_models": ("nvidia/nemotron-3-super-120b-a12b:free", "google/gemma-4-31b-it:free"),
        "temperature": 0.0,
    },
}


@dataclass(frozen=True)
class RoleModel:
    role: str
    provider: str
    model: str
    source: str
    description: str
    configured: bool
    temperature: float = 0.2
    response_format: str = ""
    fallback_provider: str = ""
    fallback_models: tuple[str, ...] = field(default_factory=tuple)
    require_sources: bool = False

    @property
    def label(self) -> str:
        return f"{self.provider}/{self.model}" if self.provider and self.model else "active model"

    @property
    def fallback_specs(self) -> list[dict[str, str]]:
        provider = self.fallback_provider or self.provider
        return [{"provider": provider, "model": model} for model in self.fallback_models if model]


def normalize_role(role: str) -> str:
    value = role.strip().lower().lstrip("/")
    value = ROLE_ALIASES.get(value, value)
    if value not in ROLE_ORDER:
        raise ValueError(f"Unknown model role: {role}")
    return value


def role_model(config: RuntimeConfig | None, role: str) -> RoleModel:
    role = normalize_role(role or "chat")
    description = ROLE_DESCRIPTIONS.get(role, "")
    defaults = role_defaults(role)
    if config is None:
        return RoleModel(role, "", "", "missing-config", description, False)

    state = load_role_state(config)
    if role in state:
        provider = state[role].get("provider", defaults["provider"])
        model = state[role].get("model", defaults["model"])
        source = "override"
    else:
        provider = defaults["provider"]
        model = defaults["model"]
        source = "default"

    if provider and model:
        selection = model_selection(config, provider, model)
        return RoleModel(
            role=role,
            provider=selection.provider,
            model=selection.model,
            source=source,
            description=description,
            configured=selection.configured,
            temperature=float(defaults.get("temperature", 0.2)),
            response_format=str(defaults.get("response_format", "")),
            fallback_provider=normalize_provider(str(defaults.get("fallback_provider") or selection.provider)),
            fallback_models=tuple(str(item) for item in defaults.get("fallback_models", ()) if item),
            require_sources=bool(defaults.get("require_sources", False)),
        )

    active = active_model_selection(config)
    return RoleModel(
        role=role,
        provider=active.provider,
        model=active.model,
        source="active",
        description=description,
        configured=active.configured,
        temperature=float(defaults.get("temperature", 0.2)),
        response_format=str(defaults.get("response_format", "")),
        fallback_provider=normalize_provider(str(defaults.get("fallback_provider") or active.provider)),
        fallback_models=tuple(str(item) for item in defaults.get("fallback_models", ()) if item),
        require_sources=bool(defaults.get("require_sources", False)),
    )


def llm_kwargs_for_role(config: RuntimeConfig | None, role: str) -> dict[str, Any]:
    selection = role_model(config, role)
    kwargs: dict[str, Any] = {}
    if selection.provider and selection.model and selection.source != "missing-config":
        kwargs["provider"] = selection.provider
        kwargs["model"] = selection.model
    if selection.fallback_specs:
        kwargs["fallbacks"] = selection.fallback_specs
    if selection.response_format:
        kwargs["response_format"] = selection.response_format
    return kwargs


def role_temperature(config: RuntimeConfig | None, role: str, fallback: float = 0.2) -> float:
    try:
        return role_model(config, role).temperature
    except Exception:
        return fallback


def format_model_roles(config: RuntimeConfig | None) -> str:
    lines = ["Model roles:"]
    for role in ROLE_ORDER:
        selection = role_model(config, role)
        status = "configured" if selection.configured else "not configured"
        fallbacks = ""
        if selection.fallback_models:
            fallbacks = f", fallback: {selection.fallback_provider}/" + ", ".join(selection.fallback_models)
        response = f", response: {selection.response_format}" if selection.response_format else ""
        lines.append(
            f"- {role}: {selection.label} ({selection.source}, {status}, temp {selection.temperature:g}{response}{fallbacks})"
        )
    lines.append("")
    lines.append("Set: /roles set <role> <gemini|openrouter|nvidia_nim> <model-id>")
    lines.append("Reset: /roles reset [role]")
    return "\n".join(lines)


def save_role_model(config: RuntimeConfig, role: str, provider: str, model: str) -> RoleModel:
    role = normalize_role(role)
    provider = normalize_provider(provider)
    if provider not in PROVIDERS:
        raise ValueError(f"Unknown provider: {provider}")
    model = model.strip()
    if not model:
        raise ValueError("Model id is empty.")

    state = load_role_state(config)
    state[role] = {"provider": provider, "model": model}
    save_role_state(config, state)
    return role_model(config, role)


def reset_role_models(config: RuntimeConfig, role: str = "") -> None:
    path = role_state_path(config)
    if not path.exists():
        return
    if not role.strip():
        path.unlink()
        return
    normalized = normalize_role(role)
    state = load_role_state(config)
    if normalized in state:
        del state[normalized]
        save_role_state(config, state)


def load_role_state(config: RuntimeConfig) -> dict[str, dict[str, str]]:
    path = role_state_path(config)
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {}
    if not isinstance(data, dict):
        return {}

    cleaned: dict[str, dict[str, str]] = {}
    for raw_role, raw_value in data.items():
        if not isinstance(raw_value, dict):
            continue
        try:
            role = normalize_role(str(raw_role))
        except ValueError:
            continue
        provider = normalize_provider(str(raw_value.get("provider", "")))
        model = str(raw_value.get("model", "")).strip()
        if provider in PROVIDERS and model:
            cleaned[role] = {"provider": provider, "model": model}
    return cleaned


def save_role_state(config: RuntimeConfig, state: dict[str, dict[str, str]]) -> None:
    config.state_dir.mkdir(parents=True, exist_ok=True)
    role_state_path(config).write_text(
        json.dumps(json_safe(state), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def role_defaults(role: str) -> dict[str, Any]:
    return dict(DEFAULT_ROLE_CONFIGS.get(role, {}))


def role_state_path(config: RuntimeConfig):
    return config.state_dir / "model_roles.json"


def json_safe(value: Any) -> Any:
    return json.loads(json.dumps(value, ensure_ascii=False, default=str))
