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

import { buildAgentProfile, type AgentDomainKind } from "@/lib/agentProfile.server";

const PROTOCOLS_IO_ENDPOINT = "https://www.protocols.io/api/v3/protocols";

export type ProtocolsInput = {
  hypothesis?: unknown;
  domain?: unknown;
  organism_or_system?: unknown;
  constraints?: unknown;
  method_keywords?: unknown; // string or string[]
};

export type NormalizedProtocol = {
  id: string;
  title: string;
  source: "protocols.io" | "curated-fallback";
  url: string;
  doi?: string | null;
  authors: string;
  relevance_score: number;
  matched_keywords: string[];
  description: string;
  verified: boolean;
  peer_reviewed?: boolean;
  published_on?: number | null;
  step_count?: number;
  steps_preview?: string[];
  materials?: string[];
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
    typeof input.domain === "string" ? input.domain : "",
    typeof input.organism_or_system === "string" ? input.organism_or_system : "",
    typeof input.constraints === "string" ? input.constraints : "",
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
  const profile = buildAgentProfile(input);
  const keywords = deriveKeywords(input);
  const keywordText = Array.isArray(input.method_keywords)
    ? input.method_keywords.filter((k): k is string => typeof k === "string").join(" ")
    : typeof input.method_keywords === "string"
      ? input.method_keywords
      : "";
  const text = `${keywordText} ${typeof input.hypothesis === "string" ? input.hypothesis : ""} ${
    typeof input.organism_or_system === "string" ? input.organism_or_system : ""
  }`.toLowerCase();
  const variants: string[] = [];
  const seen = new Set<string>([primary.toLowerCase()]);
  for (const q of [
    keywords.slice(0, 2).join(" "),
    keywords.slice(0, 3).join(" "),
    keywords.slice(0, 4).join(" "),
  ]) {
    const normalized = q.toLowerCase();
    if (!q || seen.has(normalized)) continue;
    seen.add(normalized);
    variants.push(q);
  }
  for (const q of profile.protocolQueries) {
    const normalized = q.toLowerCase();
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    variants.push(q);
  }

  if (profile.kind !== "life_science") {
    return variants;
  }

  const candidates: { match: RegExp; q: string }[] = [
    { match: /cryo|freez|thaw|trehalose|dmso/, q: "cell cryopreservation" },
    { match: /hela|cell|culture/, q: "HeLa cell culture" },
    { match: /thaw|cryo|freez/, q: "cell thawing" },
    { match: /viability|assay|trypan|count/, q: "cell viability assay" },
    { match: /trehalose/, q: "trehalose cell freezing" },
  ];
  for (const c of candidates) {
    if (!c.match.test(text)) continue;
    const q = c.q.toLowerCase();
    if (seen.has(q)) continue;
    seen.add(q);
    variants.push(c.q);
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

type CuratedFallbackProtocol = Omit<NormalizedProtocol, "relevance_score" | "matched_keywords"> & {
  domainKinds: AgentDomainKind[];
};

const CURATED_FALLBACK: CuratedFallbackProtocol[] = [
  {
    id: "owt-marek-freezedown",
    domainKinds: ["life_science"],
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
    domainKinds: ["life_science"],
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
    domainKinds: ["life_science"],
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
    domainKinds: ["life_science"],
    title: "Trypan blue exclusion viability assay (Thermo Fisher)",
    source: "curated-fallback",
    url: "https://www.thermofisher.com/us/en/home/references/protocols/cell-culture/transfection-protocol/cell-viability-assay-by-trypan-blue.html",
    authors: "Thermo Fisher Scientific",
    description:
      "Reference protocol for trypan blue 0.4% viability counting on a hemocytometer — standard primary readout for cryopreservation experiments.",
    verified: true,
  },
  {
    id: "nist-catalyst-char",
    domainKinds: ["materials_science"],
    title: "NIST guide to materials characterization data quality",
    source: "curated-fallback",
    url: "https://www.nist.gov/materials-measurement-science-division",
    authors: "National Institute of Standards and Technology",
    description:
      "Reference starting point for materials measurement, calibration, and characterization quality planning.",
    verified: true,
  },
  {
    id: "ml-repro-checklist",
    domainKinds: ["computational"],
    title: "Machine learning reproducibility checklist",
    source: "curated-fallback",
    url: "https://www.cs.mcgill.ca/~jpineau/ReproducibilityChecklist.pdf",
    authors: "Pineau et al.",
    description:
      "Checklist covering dataset splits, compute, hyperparameters, code, random seeds, and statistical reporting for ML experiments.",
    verified: true,
  },
  {
    id: "epa-field-qa",
    domainKinds: ["climate_environment"],
    title: "EPA quality assurance guidance for environmental data collection",
    source: "curated-fallback",
    url: "https://www.epa.gov/quality",
    authors: "U.S. Environmental Protection Agency",
    description:
      "Reference hub for environmental measurement quality assurance, field sampling plans, and data quality objectives.",
    verified: true,
  },
  {
    id: "nist-engineering-measurement",
    domainKinds: ["engineering", "general"],
    title: "NIST engineering measurement and calibration reference",
    source: "curated-fallback",
    url: "https://www.nist.gov/calibrations",
    authors: "National Institute of Standards and Technology",
    description:
      "Reference starting point for calibrated measurement, uncertainty, and test validation in engineering workflows.",
    verified: true,
  },
];

function scoreFallback(
  proto: CuratedFallbackProtocol,
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
  url?: string;
  description?: string;
  authors?: { name?: string; username?: string }[];
  creator?: { name?: string; username?: string } | null;
  doi?: string | null;
  peer_reviewed?: boolean | number | null;
  published_on?: number | null;
  materials?: { name?: string }[] | null;
  materials_text?: string | null;
  stats?: { number_of_steps?: number | null; number_of_votes?: number | null } | null;
};
type PioResponse = { items?: PioProtocol[] };

type PioDetailPayload = PioProtocol & {
  steps?: { step?: string | null; number?: string | number | null }[] | null;
};
type PioDetailResponse = { payload?: PioDetailPayload; status_code?: number };

function compactText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

async function fetchProtocolDetail(
  idOrUri: string | number,
  token: string,
): Promise<PioDetailPayload | null> {
  const url = `https://www.protocols.io/api/v4/protocols/${encodeURIComponent(
    String(idOrUri),
  )}?content_format=markdown&last_version=1`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const json = (await res.json()) as PioDetailResponse;
    return json.payload ?? null;
  } catch {
    clearTimeout(timeoutId);
    return null;
  }
}

async function fetchProtocolsIo(
  query: string,
  token: string,
): Promise<{ status: number; protocols: NormalizedProtocol[]; error: string | null }> {
  const url = `${PROTOCOLS_IO_ENDPOINT}?filter=public&key=${encodeURIComponent(
    query,
  )}&page_size=8&page_id=0`;
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
    const protocols: NormalizedProtocol[] = await Promise.all(
      items
        .filter((p) => p && p.title)
        .slice(0, 6)
        .map(async (p, idx): Promise<NormalizedProtocol> => {
          const detail = await fetchProtocolDetail(p.id ?? p.uri ?? idx, token);
          const merged = { ...p, ...(detail ?? {}) };
          const authors =
            (merged.authors ?? [])
              .map((a) => a.name ?? a.username ?? "")
              .filter(Boolean)
              .slice(0, 3)
              .join(", ") ||
            merged.creator?.name ||
            merged.creator?.username ||
            "protocols.io contributor";
          const protoUrl = merged.url
            ? merged.url
            : merged.uri
              ? merged.uri.startsWith("http")
                ? merged.uri
                : `https://www.protocols.io/view/${merged.uri}`
              : merged.doi
                ? `https://doi.org/${merged.doi}`
                : "";
          const stepsPreview = (detail?.steps ?? [])
            .map((s) => compactText(s.step ?? ""))
            .filter(Boolean)
            .slice(0, 4);
          const materials = [
            ...(Array.isArray(merged.materials)
              ? merged.materials.map((m) => m.name ?? "").filter(Boolean)
              : []),
            ...(merged.materials_text
              ? compactText(merged.materials_text)
                  .split(/[,;\n]/)
                  .map((m) => compactText(m))
                  .filter(Boolean)
              : []),
          ].slice(0, 12);
          const baseDescription =
            compactText(merged.description ?? "") ||
            "Protocol returned by protocols.io live search — review on the source page.";
          const detailText = [
            baseDescription,
            stepsPreview.length ? `Steps preview: ${stepsPreview.join(" | ")}` : "",
            materials.length ? `Materials: ${materials.join(", ")}` : "",
          ]
            .filter(Boolean)
            .join("\n");
          return {
            id: `pio-${merged.id ?? idx}`,
            title: merged.title ?? "Untitled protocol",
            source: "protocols.io",
            url: protoUrl,
            doi: merged.doi ?? null,
            authors,
            relevance_score: Math.max(0.5, 0.95 - idx * 0.08),
            matched_keywords: [],
            description: detailText.slice(0, 1200),
            verified: true,
            peer_reviewed: Boolean(merged.peer_reviewed),
            published_on: merged.published_on ?? null,
            step_count:
              detail?.steps?.length ??
              merged.stats?.number_of_steps ??
              (stepsPreview.length ? stepsPreview.length : undefined),
            steps_preview: stepsPreview,
            materials,
          };
        }),
    );
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
  const profile = buildAgentProfile(input);

  const keywords = deriveKeywords(input);
  const primary = buildPrimaryQuery(input) || profile.protocolQueries[0] || "research protocol";
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
  const domainFallbacks = CURATED_FALLBACK.filter(
    (p) => p.domainKinds.includes(profile.kind) || p.domainKinds.includes("general"),
  );
  const scored = (domainFallbacks.length ? domainFallbacks : CURATED_FALLBACK)
    .map((p) => {
      const { score, matched } = scoreFallback(p, keywords);
      const { domainKinds: _domainKinds, ...protocol } = p;
      return { ...protocol, relevance_score: score, matched_keywords: matched };
    })
    .sort((a, b) => b.relevance_score - a.relevance_score);

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
