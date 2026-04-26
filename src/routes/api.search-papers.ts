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
      OPTIONS: async () =>
        new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        let query = "";
        try {
          const body = (await request.json()) as { query?: unknown };
          if (typeof body.query === "string") query = body.query.trim();
        } catch {
          return jsonResponse(
            { error: "Invalid JSON body. Expected { query: string }." },
            400,
          );
        }
        if (!query) {
          return jsonResponse({ error: "Query must be a non-empty string." }, 400);
        }
        if (query.length > 500) query = query.slice(0, 500);

        const url = `${S2_ENDPOINT}?query=${encodeURIComponent(query)}&limit=5&fields=${S2_FIELDS}`;
        const headers: Record<string, string> = { Accept: "application/json" };
        // Server-only secret. Never read VITE_* here.
        const apiKey = process.env.SEMANTIC_SCHOLAR_API_KEY;
        if (apiKey) headers["x-api-key"] = apiKey;

        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000);
          const res = await fetch(url, { headers, signal: controller.signal });
          clearTimeout(timeoutId);

          if (!res.ok) {
            return jsonResponse(
              {
                error: `Semantic Scholar HTTP ${res.status}`,
                status: res.status,
                usedApiKey: Boolean(apiKey),
              },
              res.status === 429 || res.status === 403 ? res.status : 502,
            );
          }
          const json = (await res.json()) as { data?: unknown };
          return jsonResponse({
            data: Array.isArray(json.data) ? json.data : [],
            usedApiKey: Boolean(apiKey),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown upstream error";
          return jsonResponse(
            { error: `Upstream fetch failed: ${msg}`, usedApiKey: Boolean(apiKey) },
            502,
          );
        }
      },
    },
  },
});
