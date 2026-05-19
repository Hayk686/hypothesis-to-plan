from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class RuntimeConfig:
    root: Path
    telegram_token: str
    gemini_api_key: str
    gemini_api_base: str
    llm_api_key: str
    llm_api_base: str
    llm_model: str
    nvidia_api_key: str
    nvidia_api_base: str
    state_dir: Path
    input_dir: Path
    output_dir: Path
    logs_dir: Path


def load_config() -> RuntimeConfig:
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    gemini_api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    gemini_api_base = os.environ.get("GEMINI_API_BASE", "").strip()
    llm_api_key = os.environ.get("OPENROUTER_API_KEY", "").strip()
    llm_api_base = os.environ.get("OPENROUTER_API_BASE", "").strip()
    llm_model = os.environ.get("OPENROUTER_MODEL", "").strip()
    nvidia_api_key = os.environ.get("NVIDIA_API_KEY", "").strip()
    nvidia_api_base = os.environ.get("NVIDIA_API_BASE", "").strip()
    picoclaw_config = ROOT / "picoclaw" / "config.local.json"

    if not token and picoclaw_config.exists():
        data = json.loads(picoclaw_config.read_text(encoding="utf-8"))
        token = (
            data.get("channel_list", {})
            .get("telegram", {})
            .get("settings", {})
            .get("token", "")
            .strip()
        )
        model_config = (data.get("model_list") or [{}])[0]
        llm_api_base = llm_api_base or model_config.get("api_base", "").strip()
        llm_model = llm_model or model_config.get("model", "").strip()

    key_file = ROOT / "picoclaw" / "openrouter_api_key.txt"
    if not llm_api_key and key_file.exists():
        llm_api_key = key_file.read_text(encoding="utf-8").strip()

    gemini_key_file = ROOT / "picoclaw" / "gemini_api_key.txt"
    if not gemini_api_key and gemini_key_file.exists():
        gemini_api_key = gemini_key_file.read_text(encoding="utf-8").strip()

    nvidia_key_file = ROOT / "picoclaw" / "nvidia_api_key.txt"
    if not nvidia_api_key and nvidia_key_file.exists():
        nvidia_api_key = nvidia_key_file.read_text(encoding="utf-8").strip()

    if not token:
        raise RuntimeError("Telegram token not found. Set TELEGRAM_BOT_TOKEN or picoclaw/config.local.json.")

    return RuntimeConfig(
        root=ROOT,
        telegram_token=token,
        gemini_api_key=gemini_api_key,
        gemini_api_base=gemini_api_base or "https://generativelanguage.googleapis.com/v1beta",
        llm_api_key=llm_api_key,
        llm_api_base=llm_api_base or "https://openrouter.ai/api/v1",
        llm_model=llm_model or "openai/gpt-oss-120b:free",
        nvidia_api_key=nvidia_api_key,
        nvidia_api_base=nvidia_api_base or "https://integrate.api.nvidia.com/v1",
        state_dir=ROOT / "state" / "runtime",
        input_dir=ROOT / "input" / "telegram",
        output_dir=ROOT / "output",
        logs_dir=ROOT / "logs" / "runtime",
    )
