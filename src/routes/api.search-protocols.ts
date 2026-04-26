// ============================================================
// /api/search-protocols — thin HTTP wrapper around
// runProtocolsSearch (see src/lib/protocols.server.ts).
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import { runProtocolsSearch, type ProtocolsInput } from "@/lib/protocols.server";

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

export const Route = createFileRoute("/api/search-protocols")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        let input: ProtocolsInput = {};
        try {
          input = (await request.json()) as ProtocolsInput;
        } catch {
          return jsonResponse({ error: "Invalid JSON body." }, 400);
        }
        const result = await runProtocolsSearch(input);
        return jsonResponse(result);
      },
    },
  },
});
