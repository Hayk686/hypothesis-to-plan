from __future__ import annotations

import html
import json
import re
import urllib.parse
import urllib.request
from dataclasses import dataclass
from html.parser import HTMLParser
from io import BytesIO

from app.tools.common import ToolResult


USER_AGENT = "Mozilla/5.0 (compatible; LocalAgentRuntime/0.1)"
SOCIAL_DOMAINS = (
    "instagram.com",
    "linkedin.com",
    "facebook.com",
    "vk.com",
    "x.com",
    "twitter.com",
    "tiktok.com",
    "youtube.com",
    "github.com",
    "researchgate.net",
)
SOCIAL_SEARCH_MARKERS = (
    "account",
    "accounts",
    "profile",
    "profiles",
    "social",
    "instagram",
    "linkedin",
    "facebook",
    "vk",
    "соцсет",
    "аккаунт",
    "профил",
)
NOISY_LOOKUP_DOMAINS = (
    "getscam.com",
    "peoplefinders.",
    "truepeoplesearch.",
    "whitepages.",
    "spokeo.",
)


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

    results = rank_results(query, parse_duckduckgo_results(html_text))[:limit]
    if not results:
        return ToolResult(ok=False, message="No search results found.", raw={"query": query, "results": []})

    return ToolResult(ok=True, raw={"query": query, "results": results}, message=format_search_results(results))


def web_fetch(url: str, max_chars: int = 6000) -> ToolResult:
    url = url.strip()
    if not re.fullmatch(r"https?://\S+", url):
        return ToolResult(ok=False, message="URL must be http(s)://")

    max_chars = max(500, min(int(max_chars or 6000), 20000))
    try:
        response = http_get(url, timeout=45, max_bytes=12_000_000)
    except Exception as exc:
        return ToolResult(ok=False, message=f"Fetch failed: {exc}")

    if is_pdf_response(url, response.content_type):
        if response.truncated:
            return ToolResult(
                ok=False,
                message="Fetch failed: PDF is too large to read safely.",
                raw={"url": url, "content_type": response.content_type, "is_pdf": True},
            )
        try:
            title, text = pdf_to_text(response.data)
        except Exception as exc:
            return ToolResult(
                ok=False,
                message=f"Fetch failed: PDF text extraction failed: {exc}",
                raw={"url": url, "content_type": response.content_type, "is_pdf": True},
            )
        if not text.strip():
            return ToolResult(
                ok=False,
                message="Fetch failed: PDF text extraction produced no readable text.",
                raw={"url": url, "title": title, "content_type": response.content_type, "is_pdf": True},
            )
    else:
        if not is_text_response(response.content_type):
            return ToolResult(
                ok=False,
                message=f"Fetch failed: unsupported content type {response.content_type or 'unknown'}.",
                raw={"url": url, "content_type": response.content_type},
            )
        html_text = response.text()
        title = extract_title(html_text)
        text = html_to_text(html_text)

    if len(text) > max_chars:
        text = text[:max_chars].rstrip() + "..."

    return ToolResult(
        ok=True,
        message=f"{title}\n{url}\n\n{text}".strip(),
        raw={"url": url, "title": title, "text": text, "content_type": response.content_type, "is_pdf": is_pdf_response(url, response.content_type)},
    )


@dataclass(frozen=True)
class HttpResponse:
    url: str
    content_type: str
    charset: str
    data: bytes
    truncated: bool = False

    def text(self) -> str:
        return self.data.decode(self.charset or "utf-8", errors="replace")


def http_get(url: str, timeout: int, max_bytes: int) -> HttpResponse:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        content_type = response.headers.get("Content-Type", "")
        charset = response.headers.get_content_charset() or "utf-8"
        data = response.read(max_bytes + 1)
        final_url = response.geturl()
    truncated = len(data) > max_bytes
    if truncated:
        data = data[:max_bytes]
    return HttpResponse(url=final_url, content_type=content_type, charset=charset, data=data, truncated=truncated)


def http_get_text(url: str, timeout: int, max_bytes: int) -> str:
    return http_get(url, timeout=timeout, max_bytes=max_bytes).text()


def is_pdf_response(url: str, content_type: str) -> bool:
    path = urllib.parse.urlparse(url).path.lower()
    return "application/pdf" in content_type.lower() or path.endswith(".pdf")


def is_text_response(content_type: str) -> bool:
    lowered = content_type.lower()
    return not lowered or any(marker in lowered for marker in ("text", "html", "json", "xml"))


def pdf_to_text(data: bytes) -> tuple[str, str]:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("pypdf is not installed") from exc

    reader = PdfReader(BytesIO(data))
    metadata = reader.metadata
    title = normalize_space(str(getattr(metadata, "title", "") or "")) if metadata else ""
    if not title:
        title = "PDF"

    page_texts = []
    for page in reader.pages:
        page_text = page.extract_text() or ""
        if page_text.strip():
            page_texts.append(page_text)
        if sum(len(item) for item in page_texts) >= 25000:
            break
    return title, normalize_space_lines("\n".join(page_texts))


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


def rank_results(query: str, results: list[dict]) -> list[dict]:
    if not results:
        return []

    query_terms = meaningful_query_terms(query)
    social_search = is_social_search(query)

    def score(item: dict) -> int:
        title = item.get("title", "")
        url = item.get("url", "")
        snippet = item.get("snippet", "")
        haystack = f"{title} {url} {snippet}".lower()
        item_score = 0

        for term in query_terms:
            if term in haystack:
                item_score += 6

        domain = urllib.parse.urlparse(url).netloc.lower()
        if social_search and any(social in domain for social in SOCIAL_DOMAINS):
            item_score += 45
        if any(noisy in domain for noisy in NOISY_LOOKUP_DOMAINS):
            item_score -= 45
        if social_search and any(marker in haystack for marker in ("phone number", "номер телефона", "пробить", "lookup")):
            item_score -= 20
        return item_score

    ranked = sorted(enumerate(results), key=lambda pair: (score(pair[1]), -pair[0]), reverse=True)
    # The enumerate index keeps DuckDuckGo order stable for same-score items.
    return [item for _, item in ranked]


def is_social_search(query: str) -> bool:
    lowered = query.lower()
    return any(marker in lowered for marker in SOCIAL_SEARCH_MARKERS)


def meaningful_query_terms(query: str) -> list[str]:
    terms = []
    for token in re.findall(r"[A-Za-zА-Яа-яЁё][A-Za-zА-Яа-яЁё0-9_-]{2,}", query.lower()):
        if token in {"find", "search", "найди", "поиск", "есть", "where", "аккаунты", "соцсетей"}:
            continue
        terms.append(token)
    return terms[:10]


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
