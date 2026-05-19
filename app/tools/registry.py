from __future__ import annotations

from pathlib import Path

from app.core.tool_registry import ToolContext, ToolRegistry
from app.tools.common import ToolResult
from app.tools.documents import convert_docx_to_pdf, convert_pdf_to_docx, create_docx
from app.tools.llm import llm_chat
from app.tools.media import download_audio
from app.tools.models import list_models, reset_model_state, save_model_state
from app.tools.web import web_fetch, web_search


def build_tool_registry() -> ToolRegistry:
    registry = ToolRegistry()

    registry.register(
        "download_audio",
        "Download audio from one or more URLs and return files ready to send.",
        _download_audio,
    )
    registry.register(
        "convert_docx_to_pdf",
        "Convert a DOC/DOCX file to PDF.",
        _convert_docx_to_pdf,
    )
    registry.register(
        "convert_pdf_to_docx",
        "Convert a PDF file to DOCX.",
        _convert_pdf_to_docx,
    )
    registry.register(
        "create_docx",
        "Create a DOCX file from plain text.",
        _create_docx,
    )
    registry.register(
        "web_search",
        "Search the web and return normalized results.",
        _web_search,
    )
    registry.register(
        "web_fetch",
        "Fetch a web page and return readable text.",
        _web_fetch,
    )
    registry.register(
        "llm_chat",
        "Ask the configured LLM to answer or summarize.",
        _llm_chat,
    )
    registry.register(
        "list_models",
        "List available models from OpenRouter or NVIDIA NIM.",
        _list_models,
    )
    registry.register(
        "set_model",
        "Set active LLM provider and model.",
        _set_model,
    )
    registry.register(
        "reset_model",
        "Reset active LLM model to config defaults.",
        _reset_model,
    )

    return registry


def _download_audio(context: ToolContext, args: dict):
    return download_audio(
        context.root,
        args.get("urls", []),
        args.get("items", "1"),
        args.get("fmt", "mp3"),
    )


def _convert_docx_to_pdf(context: ToolContext, args: dict):
    return convert_docx_to_pdf(context.root, Path(args["path"]))


def _convert_pdf_to_docx(context: ToolContext, args: dict):
    return convert_pdf_to_docx(context.root, Path(args["path"]))


def _create_docx(context: ToolContext, args: dict):
    return create_docx(context.root, args.get("text", ""), args.get("title", "document"))


def _web_search(context: ToolContext, args: dict):
    return web_search(args.get("query", ""), args.get("limit", 5))


def _web_fetch(context: ToolContext, args: dict):
    return web_fetch(args.get("url", ""), args.get("max_chars", 6000))


def _llm_chat(context: ToolContext, args: dict):
    return llm_chat(
        args.get("prompt", ""),
        args.get("system", ""),
        config=context.config,
        temperature=float(args.get("temperature", 0.2)),
        provider=args.get("provider", ""),
        model=args.get("model", ""),
        fallbacks=args.get("fallbacks") or None,
        resilient=bool(args.get("resilient", True)),
        response_format=args.get("response_format", ""),
        json_schema=args.get("json_schema") or None,
    )


def _list_models(context: ToolContext, args: dict):
    return list_models(
        args.get("provider", "openrouter"),
        config=context.config,
        query=args.get("query", ""),
        limit=int(args.get("limit", 30)),
    )


def _set_model(context: ToolContext, args: dict):
    save_model_state(context.config, args.get("provider", ""), args.get("model", ""))
    return ToolResult(
        ok=True,
        message=f"Active model set to {args.get('provider', '')}/{args.get('model', '')}.",
        raw={"provider": args.get("provider", ""), "model": args.get("model", "")},
    )


def _reset_model(context: ToolContext, args: dict):
    reset_model_state(context.config)
    return ToolResult(ok=True, message="Active model reset to config default.")
