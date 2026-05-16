// ============================================================
// /api/resolve-materials — thin HTTP wrapper around
// runMaterialsResolver (see src/lib/materials.server.ts).
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import { runMaterialsResolver, type ResolveInput } from "@/lib/materials.server";

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

export const Route = createFileRoute("/api/resolve-materials")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        let input: ResolveInput = {};
        try {
          input = (await request.json()) as ResolveInput;
        } catch {
          return jsonResponse({ error: "Invalid JSON body." }, 400);
        }
        const result = await runMaterialsResolver(input);
        return jsonResponse(result);
      },
    },
  },
});
