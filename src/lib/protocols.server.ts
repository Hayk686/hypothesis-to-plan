// ============================================================
// Protocols search core (server-only)
// ------------------------------------------------------------
// Used by /api/search-protocols AND /api/generate-plan.
//   1. Build a primary query from the hypothesis + method keywords.
//   2. Hit protocols.io v3 with Authorization: Bearer <token>.
//   3. If empty / failed, try broader query variants:
//      "cell cryopreservation", "HeLa cell culture",
//      "cell thawing", "cell viability assay".
//   4. Only fall back to the curated list if every attempt
//      returned zero useful protocols.
// PROTOCOLS_IO_CLIENT_TOKEN is read from process.env and never returned.
// ============================================================

const PROTOCOLS_IO_ENDPOINT = "https://www.protocols.io/api/v3/protocols";

export type ProtocolsInput = {
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

export type ProtocolAttempt = {
  source_name: "protocols.io";
  endpoint_used: string;
  query: string;
  status_code: number;
  result_count: number;
  error_message: string | null;
};

export type ProtocolDebug = {
  proxyUsed: true;
  hasProtocolsIoToken: boolean;
  endpoint_used: string;
  primaryQuery: string;
  attempts: ProtocolAttempt[];
  protocolsIoStatus: number; // last status (back-compat)
  resultCount: number;
  source: "protocols.io" | "curated-fallback";
  used_fallback: boolean;
  errors: string[];
};

export type ProtocolResult = { data: NormalizedProtocol[]; debug: ProtocolDebug };

const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "and",
  "or",
  "but",
  "is",
  "are",
  "be",
  "by",
  "at",
  "as",
  "that",
  "this",
  "it",
  "from",
  "into",
  "than",
  "then",
  "will",
  "can",
  "may",
  "using",
  "use",
  "used",
  "via",
  "over",
  "between",
  "across",
  "more",
  "less",
  "such",
  "these",
  "those",
  "we",
  "our",
  "their",
  "its",
  "if",
  "not",
  "no",
  "compared",
  "versus",
  "vs",
  "least",
  "percentage",
  "points",
  "standard",
  "protocol",
]);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

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
  ].join(" ");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens(text)) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 6) break;
  }
  return out;
}

function buildPrimaryQuery(input: ProtocolsInput): string {
  return deriveKeywords(input).join(" ").slice(0, 200);
}

function buildQueryVariants(input: ProtocolsInput, primary: string): string[] {
  const keywordText = Array.isArray(input.method_keywords)
    ? input.method_keywords.filter((k): k is string => typeof k === "string").join(" ")
    : typeof input.method_keywords === "string"
      ? input.method_keywords
      : "";
  const text = `${keywordText} ${typeof input.hypothesis === "string" ? input.hypothesis : ""} ${
    typeof input.organism_or_system === "string" ? input.organism_or_system : ""
  }`.toLowerCase();
  const candidates: { match: RegExp; q: string }[] = [
    { match: /cryo|freez|thaw|trehalose|dmso/, q: "cell cryopreservation" },
    { match: /hela|cell|culture/, q: "HeLa cell culture" },
    { match: /thaw|cryo|freez/, q: "cell thawing" },
    { match: /viability|assay|trypan|count/, q: "cell viability assay" },
    { match: /trehalose/, q: "trehalose cell freezing" },
  ];
  const variants: string[] = [];
  const seen = new Set<string>([primary.toLowerCase()]);
  for (const c of candidates) {
    if (!c.match.test(text)) continue;
    const q = c.q.toLowerCase();
    if (seen.has(q)) continue;
    seen.add(q);
    variants.push(c.q);
  }
  if (variants.length === 0) {
    variants.push("cell culture", "cell viability assay");
  }
  for (const q of ["cell viability assay", "cell culture"]) {
    const normalized = q.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      variants.push(q);
    }
  }
  return variants;
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

async function fetchProtocolsIo(
  query: string,
  token: string,
): Promise<{ status: number; protocols: NormalizedProtocol[]; error: string | null }> {
  const url = `${PROTOCOLS_IO_ENDPOINT}?filter=public&key=${encodeURIComponent(
    query,
  )}&page_size=8&page_id=1`;
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
      return { status: res.status, protocols: [], error: `protocols.io HTTP ${res.status}` };
    }
    const json = (await res.json()) as PioResponse;
    const items = json.items ?? [];
    const protocols: NormalizedProtocol[] = items
      .filter((p) => p && p.title)
      .slice(0, 6)
      .map((p, idx): NormalizedProtocol => {
        const authors =
          (p.authors ?? [])
            .map((a) => a.name ?? a.username ?? "")
            .filter(Boolean)
            .slice(0, 3)
            .join(", ") || "protocols.io contributor";
        const protoUrl = p.uri
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
          url: protoUrl,
          authors,
          relevance_score: Math.max(0.5, 0.95 - idx * 0.08),
          matched_keywords: [],
          description:
            (p.description ?? "").slice(0, 400) ||
            "Protocol returned by protocols.io live search — review on the source page.",
          verified: true,
        };
      });
    return { status: res.status, protocols, error: null };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      status: 0,
      protocols: [],
      error: err instanceof Error ? err.message : "protocols.io fetch failed",
    };
  }
}

function dedupe(protocols: NormalizedProtocol[]): NormalizedProtocol[] {
  const out: NormalizedProtocol[] = [];
  const keys = new Set<string>();
  for (const p of protocols) {
    const k = `id:${p.id}|t:${p.title.trim().toLowerCase()}`;
    if (keys.has(k)) continue;
    keys.add(k);
    out.push(p);
  }
  return out;
}

// ---------- public entrypoint ----------

export async function runProtocolsSearch(input: ProtocolsInput): Promise<ProtocolResult> {
  const token = process.env.PROTOCOLS_IO_CLIENT_TOKEN;
  const hasProtocolsIoToken = Boolean(token);

  const keywords = deriveKeywords(input);
  const primary = buildPrimaryQuery(input) || "cell culture protocol";
  const variants = buildQueryVariants(input, primary);
  const allQueries = [primary, ...variants];

  const attempts: ProtocolAttempt[] = [];
  const errors: string[] = [];
  let merged: NormalizedProtocol[] = [];
  let lastStatus = 0;

  if (token) {
    for (const q of allQueries) {
      const r = await fetchProtocolsIo(q, token);
      lastStatus = r.status;
      attempts.push({
        source_name: "protocols.io",
        endpoint_used: PROTOCOLS_IO_ENDPOINT,
        query: q,
        status_code: r.status,
        result_count: r.protocols.length,
        error_message: r.error,
      });
      if (r.error) errors.push(r.error);
      if (r.protocols.length > 0) {
        merged = dedupe([...merged, ...r.protocols]);
      }
      if (merged.length >= 3) break;
    }
  } else {
    errors.push("PROTOCOLS_IO_CLIENT_TOKEN missing — using curated fallback.");
  }

  if (merged.length > 0) {
    const enriched = merged.slice(0, 6).map((p) => {
      const hay = `${p.title} ${p.description}`.toLowerCase();
      return { ...p, matched_keywords: keywords.filter((k) => hay.includes(k)) };
    });
    return {
      data: enriched,
      debug: {
        proxyUsed: true,
        hasProtocolsIoToken,
        endpoint_used: PROTOCOLS_IO_ENDPOINT,
        primaryQuery: primary,
        attempts,
        protocolsIoStatus: lastStatus,
        resultCount: enriched.length,
        source: "protocols.io",
        used_fallback: false,
        errors,
      },
    };
  }

  // Curated fallback
  const scored = CURATED_FALLBACK.map((p) => {
    const { score, matched } = scoreFallback(p, keywords);
    return { ...p, relevance_score: score, matched_keywords: matched };
  }).sort((a, b) => b.relevance_score - a.relevance_score);

  return {
    data: scored,
    debug: {
      proxyUsed: true,
      hasProtocolsIoToken,
      endpoint_used: PROTOCOLS_IO_ENDPOINT,
      primaryQuery: primary,
      attempts,
      protocolsIoStatus: lastStatus,
      resultCount: scored.length,
      source: "curated-fallback",
      used_fallback: true,
      errors,
    },
  };
}
