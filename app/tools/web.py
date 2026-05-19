from __future__ import annotations

import html
import json
import re
import urllib.parse
import urllib.request
from html.parser import HTMLParser

from app.tools.common import ToolResult


USER_AGENT = "Mozilla/5.0 (compatible; LocalAgentRuntime/0.1)"


def web_search(query: str, limit: int = 5) -> ToolResult:
    query = query.strip()
    if not query:
        return ToolResult(ok=False, message="Search query is empty.")

    limit = max(1, min(int(limit or 5), 10))
    url = "https://duckduckgo.com/html/?" + urllib.parse.urlencode({"q": query})
    try:
        html_text = http_get_text(url, timeout=30, max_bytes=2_000_000)
    except Exception as exc:
        return ToolResult(ok=False, message=f"Search failed: {exc}")

    results = parse_duckduckgo_results(html_text)[:limit]
    if not results:
        return ToolResult(ok=False, message="No search results found.", raw={"query": query, "results": []})

    return ToolResult(ok=True, raw={"query": query, "results": results}, message=format_search_results(results))


def web_fetch(url: str, max_chars: int = 6000) -> ToolResult:
    url = url.strip()
    if not re.fullmatch(r"https?://\S+", url):
        return ToolResult(ok=False, message="URL must be http(s)://")

    max_chars = max(500, min(int(max_chars or 6000), 20000))
    try:
        html_text = http_get_text(url, timeout=45, max_bytes=3_000_000)
    except Exception as exc:
        return ToolResult(ok=False, message=f"Fetch failed: {exc}")

    title = extract_title(html_text)
    text = html_to_text(html_text)
    if len(text) > max_chars:
        text = text[:max_chars].rstrip() + "..."

    return ToolResult(
        ok=True,
        message=f"{title}\n{url}\n\n{text}".strip(),
        raw={"url": url, "title": title, "text": text},
    )


def http_get_text(url: str, timeout: int, max_bytes: int) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        content_type = response.headers.get("Content-Type", "")
        charset = response.headers.get_content_charset() or "utf-8"
        data = response.read(max_bytes)
    if "text" not in content_type and "html" not in content_type and "json" not in content_type:
        return data.decode(charset, errors="replace")
    return data.decode(charset, errors="replace")


def format_search_results(results: list[dict]) -> str:
    lines = []
    for index, item in enumerate(results, 1):
        snippet = f"\n   {item['snippet']}" if item.get("snippet") else ""
        lines.append(f"{index}. {item['title']}\n   {item['url']}{snippet}")
    return "\n".join(lines)


def parse_duckduckgo_results(html_text: str) -> list[dict]:
    parser = DuckDuckGoParser()
    parser.feed(html_text)
    results = []
    for item in parser.results:
        title = normalize_space(item.get("title", ""))
        url = clean_duckduckgo_url(item.get("url", ""))
        snippet = normalize_space(item.get("snippet", ""))
        if title and url and not any(existing["url"] == url for existing in results):
            results.append({"title": title, "url": url, "snippet": snippet})
    return results


class DuckDuckGoParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.results: list[dict] = []
        self.current: dict | None = None
        self.in_result_link = False
        self.in_snippet = False

    def handle_starttag(self, tag: str, attrs):
        attrs_dict = dict(attrs)
        class_name = attrs_dict.get("class", "")
        if tag == "a" and "result__a" in class_name:
            self.current = {"url": attrs_dict.get("href", ""), "title": "", "snippet": ""}
            self.in_result_link = True
        elif self.current is not None and tag in {"a", "div"} and "result__snippet" in class_name:
            self.in_snippet = True

    def handle_endtag(self, tag: str):
        if tag == "a" and self.in_result_link:
            self.in_result_link = False
        elif tag in {"a", "div"} and self.in_snippet:
            self.in_snippet = False
        elif tag == "div" and self.current is not None and self.current.get("title"):
            self.results.append(self.current)
            self.current = None

    def handle_data(self, data: str):
        if self.current is None:
            return
        if self.in_result_link:
            self.current["title"] += data
        elif self.in_snippet:
            self.current["snippet"] += data


def clean_duckduckgo_url(url: str) -> str:
    url = html.unescape(url)
    parsed = urllib.parse.urlparse(url)
    if parsed.path.startswith("/l/"):
        params = urllib.parse.parse_qs(parsed.query)
        if params.get("uddg"):
            return params["uddg"][0]
    return url


def extract_title(html_text: str) -> str:
    match = re.search(r"<title[^>]*>(.*?)</title>", html_text, flags=re.IGNORECASE | re.DOTALL)
    if not match:
        return "Untitled"
    return normalize_space(strip_tags(match.group(1))) or "Untitled"


def html_to_text(html_text: str) -> str:
    html_text = re.sub(r"(?is)<script.*?</script>", " ", html_text)
    html_text = re.sub(r"(?is)<style.*?</style>", " ", html_text)
    html_text = re.sub(r"(?is)<noscript.*?</noscript>", " ", html_text)
    html_text = re.sub(r"(?i)<br\s*/?>", "\n", html_text)
    html_text = re.sub(r"(?i)</(p|div|li|h[1-6]|tr)>", "\n", html_text)
    text = strip_tags(html_text)
    return normalize_space_lines(text)


def strip_tags(text: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", " ", text))


def normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def normalize_space_lines(text: str) -> str:
    lines = [normalize_space(line) for line in text.splitlines()]
    return "\n".join(line for line in lines if line)

