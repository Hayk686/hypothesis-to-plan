// ============================================================
// Server-side proxy for Semantic Scholar /paper/search
// ------------------------------------------------------------
// Why this exists:
//   - Browsers block direct fetch to api.semanticscholar.org due
//     to CORS in some environments and rate-limiting headers.
//   - The Semantic Scholar API key must NEVER be shipped to the
//     browser. This route reads it from a server-only env var
//     (SEMANTIC_SCHOLAR_API_KEY) and forwards as `x-api-key`.
//   - The frontend calls POST /api/search-papers with { query }.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
} as const;

const S2_ENDPOINT = "https://api.semanticscholar.org/graph/v1/paper/search";
const S2_FIELDS = "title,year,authors,url,citationCount,abstract,venue,externalIds";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}

export const Route = createFileRoute("/api/search-papers")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        // Server-only secret — boolean only, never returned or logged.
        const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
        const hasApiKey = Boolean(apiKey);

        let query = "";
        try {
          const body = (await request.json()) as { query?: unknown };
          if (typeof body.query === "string") query = body.query.trim();
        } catch {
          return jsonResponse(
            {
              error: "Invalid JSON body. Expected { query: string }.",
              debug: { proxyUsed: true, hasApiKey, semanticScholarStatus: 0, resultCount: 0 },
            },
            400,
          );
        }
        if (!query) {
          return jsonResponse(
            {
              error: "Query must be a non-empty string.",
              debug: { proxyUsed: true, hasApiKey, semanticScholarStatus: 0, resultCount: 0 },
            },
            400,
          );
        }
        if (query.length > 500) query = query.slice(0, 500);

        const url = `${S2_ENDPOINT}?query=${encodeURIComponent(query)}&limit=5&fields=${S2_FIELDS}`;
        const headers: Record<string, string> = { Accept: "application/json" };
        if (hasApiKey) headers["x-api-key"] = apiKey as string;

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          const res = await fetch(url, { headers, signal: controller.signal });
          clearTimeout(timeoutId);

          if (!res.ok) {
            // Log status only — never the key.
            console.warn(
              `[search-papers] Semantic Scholar HTTP ${res.status} (hasApiKey=${hasApiKey})`,
            );
            return jsonResponse(
              {
                error: `Semantic Scholar HTTP ${res.status}`,
                status: res.status,
                usedApiKey: hasApiKey,
                debug: {
                  proxyUsed: true,
                  hasApiKey,
                  semanticScholarStatus: res.status,
                  resultCount: 0,
                },
              },
              res.status === 429 || res.status === 403 ? res.status : 502,
            );
          }
          const json = (await res.json()) as { data?: unknown };
          const items = Array.isArray(json.data) ? json.data : [];
          return jsonResponse({
            data: items,
            usedApiKey: hasApiKey,
            debug: {
              proxyUsed: true,
              hasApiKey,
              semanticScholarStatus: res.status,
              resultCount: items.length,
            },
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown upstream error";
          console.warn(`[search-papers] Upstream fetch failed (hasApiKey=${hasApiKey}): ${msg}`);
          return jsonResponse(
            {
              error: `Upstream fetch failed: ${msg}`,
              usedApiKey: hasApiKey,
              debug: {
                proxyUsed: true,
                hasApiKey,
                semanticScholarStatus: 0,
                resultCount: 0,
              },
            },
            502,
          );
        }
      },
    },
  },
});
