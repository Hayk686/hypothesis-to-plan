// ============================================================
// /api/search-protocols — server route
// ------------------------------------------------------------
// Calls protocols.io public search API server-side with
// PROTOCOLS_IO_CLIENT_TOKEN (Bearer). On any failure, returns a
// CLEARLY LABELED curated fallback (real public protocol URLs,
// not invented data). No keys are ever returned or logged.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
} as const;

const PROTOCOLS_IO_ENDPOINT = "https://www.protocols.io/api/v3/protocols";

type ProtocolsInput = {
  hypothesis?: unknown;
  organism_or_system?: unknown;
  method_keywords?: unknown; // string or string[]
};

export type NormalizedProtocol = {
  id: string;
  title: string;
  source: "protocols.io" | "curated-fallback";
  url: string;
  authors: string;
  relevance_score: number;
  matched_keywords: string[];
  description: string;
  verified: boolean;
};

export type ProtocolDebug = {
  proxyUsed: true;
  hasProtocolsIoToken: boolean;
  protocolsIoStatus: number;
  resultCount: number;
  source: "protocols.io" | "curated-fallback";
  query: string;
  errors: string[];
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

const STOPWORDS = new Set([
  "the","a","an","of","to","in","on","for","with","and","or","but","is","are",
  "be","by","at","as","that","this","it","from","into","than","then","will",
  "can","may","using","use","used","via","over","between","across","more",
  "less","such","these","those","we","our","their","its","if","not","no",
]);

function deriveKeywords(input: ProtocolsInput): string[] {
  const fromKeywords = (() => {
    if (Array.isArray(input.method_keywords)) {
      return input.method_keywords.filter((k): k is string => typeof k === "string");
    }
    if (typeof input.method_keywords === "string") {
      return input.method_keywords.split(/[,;\n]/);
    }
    return [];
  })();
  const text = [
    ...fromKeywords,
    typeof input.hypothesis === "string" ? input.hypothesis : "",
    typeof input.organism_or_system === "string" ? input.organism_or_system : "",
  ]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, " ");
  const tokens = text.split(/\s+/).filter((t) => t.length > 2 && !STOPWORDS.has(t));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 8) break;
  }
  return out;
}

// --------------- Curated fallback (real public URLs) ---------------

const CURATED_FALLBACK: Omit<NormalizedProtocol, "relevance_score" | "matched_keywords">[] = [
  {
    id: "owt-marek-freezedown",
    title: "Mammalian cell freeze-down / thaw protocol (OpenWetWare)",
    source: "curated-fallback",
    url: "https://openwetware.org/wiki/Marek:Freeze-down/Thaw",
    authors: "OpenWetWare community",
    description:
      "Standard mammalian-cell cryopreservation workflow: harvest, count, aliquot in DMSO-containing freezing medium, controlled-rate freeze, LN₂ storage, thaw and recount.",
    verified: true,
  },
  {
    id: "pio-trehalose-cryo",
    title: "Cryopreservation in trehalose (protocols.io)",
    source: "curated-fallback",
    url: "https://www.protocols.io/view/cryopreservation-of-labyrinthulomycetes-in-treh-vctw6pw",
    authors: "Protocols.io contributor",
    description:
      "Trehalose-containing cryopreservation workflow — supporting reference for trehalose-based freezing media composition and handling.",
    verified: true,
  },
  {
    id: "lsi-hela-freeze",
    title: "HeLa cell freezing protocol (LSI Network)",
    source: "curated-fallback",
    url: "https://lsinetwork.com/hela-cells-freezing-protocol",
    authors: "LSI Network",
    description:
      "HeLa-specific freezing walkthrough covering harvest, aliquot, controlled-rate cooling, and storage.",
    verified: true,
  },
  {
    id: "thermo-trypan-blue",
    title: "Trypan blue exclusion viability assay (Thermo Fisher)",
    source: "curated-fallback",
    url: "https://www.thermofisher.com/us/en/home/references/protocols/cell-culture/transfection-protocol/cell-viability-assay-by-trypan-blue.html",
    authors: "Thermo Fisher Scientific",
    description:
      "Reference protocol for trypan blue 0.4% viability counting on a hemocytometer — standard primary readout for cryopreservation experiments.",
    verified: true,
  },
];

function scoreFallback(
  proto: Omit<NormalizedProtocol, "relevance_score" | "matched_keywords">,
  keywords: string[],
): { score: number; matched: string[] } {
  const haystack = `${proto.title} ${proto.description}`.toLowerCase();
  const matched = keywords.filter((k) => haystack.includes(k));
  const score = Math.min(1, 0.4 + matched.length * 0.12);
  return { score: Math.round(score * 100) / 100, matched };
}

// --------------- protocols.io ---------------

type PioProtocol = {
  id?: number | string;
  title?: string;
  uri?: string;
  description?: string;
  authors?: { name?: string; username?: string }[];
  doi?: string | null;
};
type PioResponse = { items?: PioProtocol[] };

async function searchProtocolsIo(
  query: string,
  token: string,
): Promise<{ status: number; protocols: NormalizedProtocol[]; error?: string }> {
  const url = `${PROTOCOLS_IO_ENDPOINT}?filter=public&key=${encodeURIComponent(query)}&order_field=relevance&order_dir=desc&page_size=8`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return {
        status: res.status,
        protocols: [],
        error: `protocols.io HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as PioResponse;
    const items = json.items ?? [];
    const protocols: NormalizedProtocol[] = items
      .filter((p) => p && p.title)
      .slice(0, 6)
      .map((p, idx) => {
        const authors =
          (p.authors ?? [])
            .map((a) => a.name ?? a.username ?? "")
            .filter(Boolean)
            .slice(0, 3)
            .join(", ") || "protocols.io contributor";
        const url = p.uri
          ? p.uri.startsWith("http")
            ? p.uri
            : `https://www.protocols.io/view/${p.uri}`
          : p.doi
            ? `https://doi.org/${p.doi}`
            : "";
        return {
          id: `pio-${p.id ?? idx}`,
          title: p.title ?? "Untitled protocol",
          source: "protocols.io",
          url,
          authors,
          relevance_score: Math.max(0.5, 0.95 - idx * 0.08),
          matched_keywords: [],
          description:
            (p.description ?? "").slice(0, 400) ||
            "Protocol returned by protocols.io live search — review on the source page.",
          verified: true,
        } satisfies NormalizedProtocol;
      });
    return { status: res.status, protocols };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      status: 0,
      protocols: [],
      error: err instanceof Error ? err.message : "protocols.io fetch failed",
    };
  }
}

// --------------- Route ---------------

export const Route = createFileRoute("/api/search-protocols")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        const token = process.env.PROTOCOLS_IO_CLIENT_TOKEN;
        const hasProtocolsIoToken = Boolean(token);

        let input: ProtocolsInput = {};
        try {
          input = (await request.json()) as ProtocolsInput;
        } catch {
          return jsonResponse(
            {
              error: "Invalid JSON body.",
              debug: {
                proxyUsed: true,
                hasProtocolsIoToken,
                protocolsIoStatus: 0,
                resultCount: 0,
                source: "curated-fallback" as const,
                query: "",
                errors: [],
              },
            },
            400,
          );
        }

        const keywords = deriveKeywords(input);
        const query = keywords.join(" ").slice(0, 200) || "cell culture protocol";
        const errors: string[] = [];

        // 1) Try live protocols.io if we have a token
        if (token) {
          const live = await searchProtocolsIo(query, token);
          if (live.error) errors.push(live.error);
          if (live.protocols.length > 0) {
            // attach matched keywords for UI
            const enriched = live.protocols.map((p) => {
              const hay = `${p.title} ${p.description}`.toLowerCase();
              return { ...p, matched_keywords: keywords.filter((k) => hay.includes(k)) };
            });
            const debug: ProtocolDebug = {
              proxyUsed: true,
              hasProtocolsIoToken,
              protocolsIoStatus: live.status,
              resultCount: enriched.length,
              source: "protocols.io",
              query,
              errors,
            };
            return jsonResponse({ data: enriched, debug });
          }
          // fall through to curated fallback
        } else {
          errors.push("PROTOCOLS_IO_CLIENT_TOKEN missing — using curated fallback.");
        }

        // 2) Curated fallback
        const scored = CURATED_FALLBACK.map((p) => {
          const { score, matched } = scoreFallback(p, keywords);
          return { ...p, relevance_score: score, matched_keywords: matched };
        }).sort((a, b) => b.relevance_score - a.relevance_score);

        const debug: ProtocolDebug = {
          proxyUsed: true,
          hasProtocolsIoToken,
          protocolsIoStatus: 0,
          resultCount: scored.length,
          source: "curated-fallback",
          query,
          errors,
        };
        return jsonResponse({ data: scored, debug });
      },
    },
  },
});
