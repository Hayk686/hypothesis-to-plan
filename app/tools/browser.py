from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path
from typing import Any

from app.tools.common import ToolResult


INSTALL_HINT = "Install browser support: pip install playwright && python -m playwright install chromium"
URL_RE = re.compile(r"https?://\S+", re.IGNORECASE)


def browser_status() -> ToolResult:
    try:
        import playwright.sync_api  # noqa: F401
    except ImportError:
        return ToolResult(
            ok=False,
            message=f"browser: unavailable. {INSTALL_HINT}",
            raw={"available": False, "reason": "missing_playwright"},
        )
    return ToolResult(ok=True, message="browser: available (playwright)", raw={"available": True})


def browser_read(root: Path, url: str, max_chars: int = 5000, screenshot: bool = False) -> ToolResult:
    normalized_url = normalize_url(url)
    if not normalized_url:
        return ToolResult(ok=False, message="Browser needs a valid http/https URL.")

    try:
        from playwright.sync_api import Error as PlaywrightError
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except ImportError:
        return ToolResult(ok=False, message=f"browser: unavailable. {INSTALL_HINT}")

    browser = None
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True, args=["--no-sandbox"])
            page = browser.new_page(
                viewport={"width": 1365, "height": 768},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
                ),
            )
            page.goto(normalized_url, wait_until="domcontentloaded", timeout=30_000)
            try:
                page.wait_for_load_state("networkidle", timeout=5_000)
            except PlaywrightTimeoutError:
                pass

            title = (page.title() or page.url).strip()
            text = visible_text(page)
            links = visible_links(page)
            files: list[Path] = []

            if screenshot:
                screenshot_path = screenshot_file(root, title)
                screenshot_path.parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(screenshot_path), full_page=True)
                files.append(screenshot_path)

            message = format_browser_result(title, page.url, text, links, max_chars=max_chars, screenshot=bool(files))
            return ToolResult(
                ok=True,
                message=message,
                files=files,
                raw={
                    "url": page.url,
                    "title": title,
                    "text": text,
                    "links": links,
                    "screenshot": str(files[0]) if files else "",
                },
            )
    except PlaywrightError as exc:
        message = str(exc)
        if "Executable doesn't exist" in message or "playwright install" in message:
            message = f"browser: Chromium is not installed. {INSTALL_HINT}"
        return ToolResult(ok=False, message=message)
    finally:
        if browser:
            try:
                browser.close()
            except Exception:
                pass


def normalize_url(url: str) -> str:
    value = (url or "").strip().strip(".,)]}")
    if not value:
        return ""
    match = URL_RE.search(value)
    if match:
        return match.group(0).rstrip(".,)]}")
    if re.fullmatch(r"[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?:/\S*)?", value):
        return "https://" + value
    return ""


def visible_text(page: Any) -> str:
    try:
        text = page.locator("body").inner_text(timeout=5_000)
    except Exception:
        text = page.content()
    return compact_text(text)


def visible_links(page: Any) -> list[dict[str, str]]:
    try:
        links = page.eval_on_selector_all(
            "a[href]",
            """elements => elements.slice(0, 80).map((a) => ({
                text: (a.innerText || a.textContent || "").trim().slice(0, 120),
                url: a.href
            })).filter((item) => item.url)""",
        )
    except Exception:
        return []
    if not isinstance(links, list):
        return []
    clean_links = []
    seen = set()
    for item in links:
        if not isinstance(item, dict):
            continue
        link_url = str(item.get("url", "")).strip()
        if not link_url or link_url in seen:
            continue
        seen.add(link_url)
        clean_links.append({"text": str(item.get("text", "")).strip(), "url": link_url})
    return clean_links


def compact_text(text: str) -> str:
    text = re.sub(r"\r\n?", "\n", text or "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def format_browser_result(
    title: str,
    url: str,
    text: str,
    links: list[dict[str, str]],
    *,
    max_chars: int,
    screenshot: bool,
) -> str:
    excerpt = text[: max(500, max_chars)].rstrip()
    lines = [f"Browser page: {title}", url]
    if screenshot:
        lines.append("Screenshot attached.")
    if excerpt:
        lines.extend(["", excerpt])
    if links:
        lines.append("")
        lines.append("Links:")
        for index, item in enumerate(links[:10], 1):
            label = item.get("text") or item.get("url", "")
            lines.append(f"{index}. {label}\n   {item.get('url', '')}")
    return "\n".join(lines).strip()


def screenshot_file(root: Path, title: str) -> Path:
    safe_title = re.sub(r"[^A-Za-z0-9_.-]+", "_", title).strip("._")[:60] or "page"
    stamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    return root / "output" / "browser" / f"{stamp}_{safe_title}.png"
