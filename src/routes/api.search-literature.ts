// ============================================================
// /api/search-literature — thin HTTP wrapper around
// runLiteratureSearch (see src/lib/literature.server.ts).
// All logic, secrets, and diagnostics live in the shared module
// so /api/generate-plan can call it directly without an internal
// HTTP hop (which fails on the worker runtime).
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import { runLiteratureSearch, type LiteratureInput } from "@/lib/literature.server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
} as const;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

export const Route = createFileRoute("/api/search-literature")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        let input: LiteratureInput = {};
        try {
          input = (await request.json()) as LiteratureInput;
        } catch {
          return jsonResponse({ error: "Invalid JSON body." }, 400);
        }
        const result = await runLiteratureSearch(input);
        return jsonResponse(result);
      },
    },
  },
});
