// ============================================================
// /api/search-literature — server route
// ------------------------------------------------------------
// Primary source: Semantic Scholar Graph API (server-side, with
//   optional SEMANTIC_SCHOLAR_API_KEY).
// Optional silent fallback: NCBI PubMed E-utilities (uses
//   NCBI_API_KEY if present; SKIPPED gracefully when missing —
//   never blocks generation, never surfaces an error to the user).
//
// All secrets are server-only. No key value is ever returned or
// logged. The response is a normalized list of papers plus a
// debug object the dev panel can render.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
} as const;

const S2_ENDPOINT = "https://api.semanticscholar.org/graph/v1/paper/search";
const S2_FIELDS =
  "paperId,title,abstract,year,venue,url,externalIds,citationCount,influentialCitationCount,authors,tldr";

const PUBMED_ESEARCH =
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const PUBMED_ESUMMARY =
  "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";

type LiteratureInput = {
  hypothesis?: unknown;
  domain?: unknown;
  organism_or_system?: unknown;
  constraints?: unknown;
  query?: unknown; // optional override
};

export type NormalizedPaper = {
  id: string;
  title: string;
  authors: string;
  year: number;
  venue: string;
  abstract: string;
  citation_count: number;
  influential_citation_count: number;
  source_url: string;
  doi: string | null;
  pmid: string | null;
  relevance_score: number;
  evidence_role: "primary" | "supporting" | "background";
  source: "semantic-scholar" | "pubmed";
  tldr: string | null;
};

export type LiteratureDebug = {
  proxyUsed: true;
  hasSemanticScholarKey: boolean;
  hasPubMedKey: boolean;
  semanticScholarStatus: number;
  pubmedStatus: number;
  resultCount: number;
  source: "semantic-scholar" | "pubmed" | "none";
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
  "compared","versus","vs",
]);

function buildQuery(input: LiteratureInput): string {
  if (typeof input.query === "string" && input.query.trim()) {
    return input.query.trim().slice(0, 500);
  }
  const hypothesis = typeof input.hypothesis === "string" ? input.hypothesis : "";
  const domain = typeof input.domain === "string" ? input.domain : "";
  const organism =
    typeof input.organism_or_system === "string" ? input.organism_or_system : "";

  const tokens = `${hypothesis} ${domain} ${organism}`
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));

  // Keep frequency order, dedupe, cap at 12 keywords
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    keywords.push(t);
    if (keywords.length >= 12) break;
  }
  return keywords.join(" ").slice(0, 500);
}

function relevanceScore(idx: number, citations: number): number {
  // Position weight (0.5–0.95) + log-citation bonus, clamped to [0, 1]
  const pos = Math.max(0.5, 0.95 - idx * 0.07);
  const cite = Math.min(0.15, Math.log10(Math.max(1, citations)) * 0.04);
  return Math.min(1, Math.round((pos + cite) * 100) / 100);
}

function evidenceRole(idx: number): NormalizedPaper["evidence_role"] {
  if (idx === 0) return "primary";
  if (idx <= 2) return "supporting";
  return "background";
}

// ---------------- Semantic Scholar ----------------

type S2Author = { name?: string };
type S2Paper = {
  paperId?: string;
  title?: string;
  abstract?: string | null;
  year?: number | null;
  venue?: string | null;
  url?: string | null;
  externalIds?: { DOI?: string; PubMed?: string } | null;
  citationCount?: number | null;
  influentialCitationCount?: number | null;
  authors?: S2Author[];
  tldr?: { text?: string } | null;
};

async function searchSemanticScholar(
  query: string,
  apiKey: string | undefined,
): Promise<{ status: number; papers: NormalizedPaper[]; error?: string }> {
  const url = `${S2_ENDPOINT}?query=${encodeURIComponent(query)}&limit=10&fields=${S2_FIELDS}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return {
        status: res.status,
        papers: [],
        error: `Semantic Scholar HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as { data?: S2Paper[] };
    const items = (json.data ?? []).filter((p) => p && p.title);
    const papers: NormalizedPaper[] = items.slice(0, 8).map((p, idx) => {
      const authorsArr = (p.authors ?? [])
        .map((a) => a.name ?? "")
        .filter(Boolean);
      const authors =
        authorsArr.length === 0
          ? "Unknown authors"
          : authorsArr.slice(0, 4).join(", ") +
            (authorsArr.length > 4 ? ", et al." : "");
      const doi = p.externalIds?.DOI ?? null;
      const pmid = p.externalIds?.PubMed ?? null;
      const sourceUrl =
        p.url ??
        (doi ? `https://doi.org/${doi}` : pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : "");
      const citations = p.citationCount ?? 0;
      return {
        id: p.paperId ?? `s2-${idx}`,
        title: p.title ?? "Untitled",
        authors,
        year: p.year ?? 0,
        venue: p.venue ?? "Semantic Scholar",
        abstract: p.abstract ?? "Abstract unavailable from Semantic Scholar.",
        citation_count: citations,
        influential_citation_count: p.influentialCitationCount ?? 0,
        source_url: sourceUrl,
        doi,
        pmid,
        relevance_score: relevanceScore(idx, citations),
        evidence_role: evidenceRole(idx),
        source: "semantic-scholar",
        tldr: p.tldr?.text ?? null,
      };
    });
    return { status: res.status, papers };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      status: 0,
      papers: [],
      error: err instanceof Error ? err.message : "Semantic Scholar fetch failed",
    };
  }
}

// ---------------- PubMed (optional, silent) ----------------

type PubMedEsearch = { esearchresult?: { idlist?: string[] } };
type PubMedEsummaryItem = {
  uid?: string;
  title?: string;
  source?: string;
  pubdate?: string;
  authors?: { name?: string }[];
  articleids?: { idtype?: string; value?: string }[];
};
type PubMedEsummary = { result?: Record<string, PubMedEsummaryItem> };

async function searchPubMed(
  query: string,
  apiKey: string | undefined,
): Promise<{ status: number; papers: NormalizedPaper[]; error?: string }> {
  // NCBI is OPTIONAL. If the call fails for any reason, we silently return
  // an empty list and never surface an error to the user.
  try {
    const esearchUrl = `${PUBMED_ESEARCH}?db=pubmed&retmode=json&retmax=8&term=${encodeURIComponent(query)}${apiKey ? `&api_key=${apiKey}` : ""}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);
    const idsRes = await fetch(esearchUrl, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!idsRes.ok) {
      return { status: idsRes.status, papers: [], error: `PubMed esearch HTTP ${idsRes.status}` };
    }
    const idsJson = (await idsRes.json()) as PubMedEsearch;
    const ids = idsJson.esearchresult?.idlist ?? [];
    if (ids.length === 0) return { status: idsRes.status, papers: [] };

    const sumUrl = `${PUBMED_ESUMMARY}?db=pubmed&retmode=json&id=${ids.join(",")}${apiKey ? `&api_key=${apiKey}` : ""}`;
    const sumController = new AbortController();
    const sumTimeoutId = setTimeout(() => sumController.abort(), 7000);
    const sumRes = await fetch(sumUrl, { signal: sumController.signal });
    clearTimeout(sumTimeoutId);
    if (!sumRes.ok) {
      return { status: sumRes.status, papers: [], error: `PubMed esummary HTTP ${sumRes.status}` };
    }
    const sumJson = (await sumRes.json()) as PubMedEsummary;
    const result = sumJson.result ?? {};
    const papers: NormalizedPaper[] = ids
      .map((id, idx) => {
        const item = result[id];
        if (!item || !item.title) return null;
        const authors = (item.authors ?? [])
          .map((a) => a.name ?? "")
          .filter(Boolean);
        const authorStr =
          authors.length === 0
            ? "Unknown authors"
            : authors.slice(0, 4).join(", ") +
              (authors.length > 4 ? ", et al." : "");
        const yearMatch = (item.pubdate ?? "").match(/\d{4}/);
        const year = yearMatch ? Number(yearMatch[0]) : 0;
        const doi =
          item.articleids?.find((a) => a.idtype === "doi")?.value ?? null;
        return {
          id: `pm-${id}`,
          title: item.title,
          authors: authorStr,
          year,
          venue: item.source ?? "PubMed",
          abstract: "Abstract not fetched from PubMed esummary.",
          citation_count: 0,
          influential_citation_count: 0,
          source_url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
          doi,
          pmid: id,
          relevance_score: relevanceScore(idx, 0),
          evidence_role: evidenceRole(idx),
          source: "pubmed",
          tldr: null,
        } satisfies NormalizedPaper;
      })
      .filter((p): p is NormalizedPaper => p !== null);
    return { status: sumRes.status, papers };
  } catch (err) {
    return {
      status: 0,
      papers: [],
      error: err instanceof Error ? err.message : "PubMed fetch failed",
    };
  }
}

// ---------------- Route ----------------

export const Route = createFileRoute("/api/search-literature")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        const s2Key = process.env.SEMANTIC_SCHOLAR_API_KEY;
        const pubmedKey = process.env.NCBI_API_KEY; // OPTIONAL
        const hasSemanticScholarKey = Boolean(s2Key);
        const hasPubMedKey = Boolean(pubmedKey);

        let input: LiteratureInput = {};
        try {
          input = (await request.json()) as LiteratureInput;
        } catch {
          return jsonResponse(
            { error: "Invalid JSON body.", debug: emptyDebug("", hasSemanticScholarKey, hasPubMedKey) },
            400,
          );
        }
        const query = buildQuery(input);
        if (!query) {
          return jsonResponse(
            { error: "Could not derive a query from inputs.", debug: emptyDebug("", hasSemanticScholarKey, hasPubMedKey) },
            400,
          );
        }

        const errors: string[] = [];

        // 1) Semantic Scholar — primary
        const s2 = await searchSemanticScholar(query, s2Key);
        if (s2.error) errors.push(s2.error);

        let papers = s2.papers;
        let chosenSource: LiteratureDebug["source"] =
          papers.length > 0 ? "semantic-scholar" : "none";
        let pubmedStatus = 0;

        // 2) PubMed — silent enhancement / fallback when S2 returns too few
        if (papers.length < 3) {
          const pm = await searchPubMed(query, pubmedKey);
          pubmedStatus = pm.status;
          if (pm.error) errors.push(pm.error);
          if (pm.papers.length > 0) {
            // Merge: prefer S2 first, then top up with PubMed (dedupe by DOI/PMID).
            const seenKeys = new Set<string>();
            for (const p of papers) {
              if (p.doi) seenKeys.add(`doi:${p.doi.toLowerCase()}`);
              if (p.pmid) seenKeys.add(`pmid:${p.pmid}`);
            }
            for (const p of pm.papers) {
              const k = p.doi
                ? `doi:${p.doi.toLowerCase()}`
                : p.pmid
                  ? `pmid:${p.pmid}`
                  : `id:${p.id}`;
              if (seenKeys.has(k)) continue;
              seenKeys.add(k);
              papers.push(p);
              if (papers.length >= 8) break;
            }
            if (chosenSource === "none") chosenSource = "pubmed";
          }
        }

        const debug: LiteratureDebug = {
          proxyUsed: true,
          hasSemanticScholarKey,
          hasPubMedKey,
          semanticScholarStatus: s2.status,
          pubmedStatus,
          resultCount: papers.length,
          source: chosenSource,
          query,
          errors,
        };

        return jsonResponse({ data: papers, debug });
      },
    },
  },
});

function emptyDebug(
  query: string,
  hasSemanticScholarKey: boolean,
  hasPubMedKey: boolean,
): LiteratureDebug {
  return {
    proxyUsed: true,
    hasSemanticScholarKey,
    hasPubMedKey,
    semanticScholarStatus: 0,
    pubmedStatus: 0,
    resultCount: 0,
    source: "none",
    query,
    errors: [],
  };
}
