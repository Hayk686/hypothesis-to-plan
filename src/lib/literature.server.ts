// ============================================================
// Literature search core (server-only)
// ------------------------------------------------------------
// Used by /api/search-literature AND /api/generate-plan.
// Strategy:
//   1. Build a primary query from hypothesis + domain + organism.
//   2. Hit Semantic Scholar.
//   3. If we have <3 relevant papers, try broader query variants
//      (cryopreservation / DMSO / HeLa / post-thaw etc.).
//   4. Merge & dedupe by paperId / DOI / lowercased-title.
//   5. Optionally enhance with PubMed if NCBI_API_KEY is present.
//      PubMed is silent: missing key never blocks generation.
// All secrets are read here from process.env and never returned.
// ============================================================

const S2_ENDPOINT = "https://api.semanticscholar.org/graph/v1/paper/search";
const S2_FIELDS =
  "paperId,title,abstract,year,venue,url,externalIds,citationCount,influentialCitationCount,authors,tldr";
const PUBMED_ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const PUBMED_ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";

const SUCCESS_THRESHOLD = 3;

export type LiteratureInput = {
  hypothesis?: unknown;
  domain?: unknown;
  organism_or_system?: unknown;
  constraints?: unknown;
  query?: unknown;
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

export type LiteratureAttempt = {
  source_name: "semantic-scholar" | "pubmed";
  query: string;
  status_code: number;
  result_count: number;
  error_message: string | null;
};

export type LiteratureDebug = {
  proxyUsed: true;
  hasSemanticScholarKey: boolean;
  hasPubMedKey: boolean;
  primaryQuery: string;
  attempts: LiteratureAttempt[];
  semanticScholarStatus: number; // last s2 status (back-compat)
  pubmedStatus: number; // last pm status (back-compat)
  resultCount: number;
  source: "semantic-scholar" | "pubmed" | "merged" | "none";
  used_fallback: boolean;
  errors: string[];
};

export type LiteratureResult = {
  data: NormalizedPaper[];
  debug: LiteratureDebug;
};

// ---------- query building ----------

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

function buildPrimaryQuery(input: LiteratureInput): string {
  if (typeof input.query === "string" && input.query.trim()) {
    return input.query.trim().slice(0, 300);
  }
  const hypothesis = typeof input.hypothesis === "string" ? input.hypothesis : "";
  const domain = typeof input.domain === "string" ? input.domain : "";
  const organism = typeof input.organism_or_system === "string" ? input.organism_or_system : "";

  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tokens(`${hypothesis} ${domain} ${organism}`)) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 8) break;
  }
  return out.join(" ").slice(0, 300);
}

/**
 * Heuristic query variants. We pick the ones whose theme appears in the
 * hypothesis text (so we don't fire totally unrelated queries). Every
 * project gets the generic "cell viability assay" / "cell culture" backups.
 */
function buildQueryVariants(input: LiteratureInput, primary: string): string[] {
  const text = `${typeof input.hypothesis === "string" ? input.hypothesis : ""} ${
    typeof input.domain === "string" ? input.domain : ""
  } ${typeof input.organism_or_system === "string" ? input.organism_or_system : ""}`.toLowerCase();

  const candidates: { match: RegExp; q: string }[] = [
    { match: /trehalose|cryo|freez|thaw|dmso/, q: "trehalose cryopreservation cell viability" },
    { match: /trehalose|dmso|cryo/, q: "trehalose DMSO cryopreservation" },
    { match: /hela|cell|cryo|freez/, q: "HeLa cell cryopreservation DMSO viability" },
    { match: /trehalose|thaw|viability/, q: "trehalose cells post-thaw viability" },
    { match: /viability|assay|trypan/, q: "cell viability assay trypan blue" },
    { match: /cell|culture|hela/, q: "mammalian cell culture cryopreservation" },
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
  // Always end with a generic safety net so we never come up empty for bio projects.
  if (variants.length === 0) {
    variants.push("cell culture protocol", "cell viability assay");
  }
  return variants;
}

// ---------- scoring ----------

function relevanceScore(idx: number, citations: number): number {
  const pos = Math.max(0.5, 0.95 - idx * 0.07);
  const cite = Math.min(0.15, Math.log10(Math.max(1, citations)) * 0.04);
  return Math.min(1, Math.round((pos + cite) * 100) / 100);
}
function evidenceRole(idx: number): NormalizedPaper["evidence_role"] {
  if (idx === 0) return "primary";
  if (idx <= 2) return "supporting";
  return "background";
}

// ---------- Semantic Scholar ----------

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

async function fetchSemanticScholar(
  query: string,
  apiKey: string | undefined,
): Promise<{ status: number; papers: NormalizedPaper[]; error: string | null }> {
  const url = `${S2_ENDPOINT}?query=${encodeURIComponent(query)}&limit=10&fields=${S2_FIELDS}`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (apiKey) headers["x-api-key"] = apiKey;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return { status: res.status, papers: [], error: `Semantic Scholar HTTP ${res.status}` };
    }
    const json = (await res.json()) as { data?: S2Paper[] };
    const items = (json.data ?? []).filter((p) => p && p.title);
    const papers: NormalizedPaper[] = items.slice(0, 10).map((p, idx) => {
      const authorsArr = (p.authors ?? []).map((a) => a.name ?? "").filter(Boolean);
      const authors =
        authorsArr.length === 0
          ? "Unknown authors"
          : authorsArr.slice(0, 4).join(", ") + (authorsArr.length > 4 ? ", et al." : "");
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
    return { status: res.status, papers, error: null };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      status: 0,
      papers: [],
      error: err instanceof Error ? err.message : "Semantic Scholar fetch failed",
    };
  }
}

// ---------- PubMed (optional, silent) ----------

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

async function fetchPubMed(
  query: string,
  apiKey: string | undefined,
): Promise<{ status: number; papers: NormalizedPaper[]; error: string | null }> {
  try {
    const esearchUrl = `${PUBMED_ESEARCH}?db=pubmed&retmode=json&retmax=8&term=${encodeURIComponent(
      query,
    )}${apiKey ? `&api_key=${apiKey}` : ""}`;
    const c1 = new AbortController();
    const t1 = setTimeout(() => c1.abort(), 7000);
    const idsRes = await fetch(esearchUrl, { signal: c1.signal });
    clearTimeout(t1);
    if (!idsRes.ok) {
      return { status: idsRes.status, papers: [], error: `PubMed esearch HTTP ${idsRes.status}` };
    }
    const idsJson = (await idsRes.json()) as PubMedEsearch;
    const ids = idsJson.esearchresult?.idlist ?? [];
    if (ids.length === 0) return { status: idsRes.status, papers: [], error: null };

    const sumUrl = `${PUBMED_ESUMMARY}?db=pubmed&retmode=json&id=${ids.join(",")}${
      apiKey ? `&api_key=${apiKey}` : ""
    }`;
    const c2 = new AbortController();
    const t2 = setTimeout(() => c2.abort(), 7000);
    const sumRes = await fetch(sumUrl, { signal: c2.signal });
    clearTimeout(t2);
    if (!sumRes.ok) {
      return { status: sumRes.status, papers: [], error: `PubMed esummary HTTP ${sumRes.status}` };
    }
    const sumJson = (await sumRes.json()) as PubMedEsummary;
    const result = sumJson.result ?? {};
    const papers: NormalizedPaper[] = ids
      .map((id, idx): NormalizedPaper | null => {
        const item = result[id];
        if (!item || !item.title) return null;
        const authors = (item.authors ?? []).map((a) => a.name ?? "").filter(Boolean);
        const authorStr =
          authors.length === 0
            ? "Unknown authors"
            : authors.slice(0, 4).join(", ") + (authors.length > 4 ? ", et al." : "");
        const yearMatch = (item.pubdate ?? "").match(/\d{4}/);
        const year = yearMatch ? Number(yearMatch[0]) : 0;
        const doi = item.articleids?.find((a) => a.idtype === "doi")?.value ?? null;
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
        };
      })
      .filter((p): p is NormalizedPaper => p !== null);
    return { status: sumRes.status, papers, error: null };
  } catch (err) {
    return {
      status: 0,
      papers: [],
      error: err instanceof Error ? err.message : "PubMed fetch failed",
    };
  }
}

// ---------- merge / dedupe ----------

function dedupeMerge(existing: NormalizedPaper[], incoming: NormalizedPaper[]): NormalizedPaper[] {
  const out = [...existing];
  const keys = new Set<string>();
  for (const p of out) {
    keys.add(`id:${p.id}`);
    if (p.doi) keys.add(`doi:${p.doi.toLowerCase()}`);
    if (p.pmid) keys.add(`pmid:${p.pmid}`);
    keys.add(`t:${p.title.trim().toLowerCase()}`);
  }
  for (const p of incoming) {
    const candidates = [
      `id:${p.id}`,
      p.doi ? `doi:${p.doi.toLowerCase()}` : null,
      p.pmid ? `pmid:${p.pmid}` : null,
      `t:${p.title.trim().toLowerCase()}`,
    ].filter((k): k is string => k !== null);
    if (candidates.some((k) => keys.has(k))) continue;
    candidates.forEach((k) => keys.add(k));
    out.push(p);
  }
  return out;
}

function rerank(papers: NormalizedPaper[]): NormalizedPaper[] {
  // Re-sort merged set by citation count then existing relevance, then re-tag roles.
  const sorted = [...papers].sort((a, b) => {
    if (b.citation_count !== a.citation_count) return b.citation_count - a.citation_count;
    return b.relevance_score - a.relevance_score;
  });
  return sorted.slice(0, 10).map((p, idx) => ({
    ...p,
    relevance_score: relevanceScore(idx, p.citation_count),
    evidence_role: evidenceRole(idx),
  }));
}

// ---------- public entrypoint ----------

export async function runLiteratureSearch(input: LiteratureInput): Promise<LiteratureResult> {
  const s2Key = process.env.SEMANTIC_SCHOLAR_API_KEY;
  const pubmedKey = process.env.NCBI_API_KEY;
  const hasSemanticScholarKey = Boolean(s2Key);
  const hasPubMedKey = Boolean(pubmedKey);

  const primary = buildPrimaryQuery(input);
  const variants = buildQueryVariants(input, primary);
  const allQueries = [primary, ...variants].filter((q) => q && q.trim().length > 0);

  const attempts: LiteratureAttempt[] = [];
  const errors: string[] = [];
  let papers: NormalizedPaper[] = [];
  let lastS2Status = 0;

  for (const q of allQueries) {
    const r = await fetchSemanticScholar(q, s2Key);
    lastS2Status = r.status;
    attempts.push({
      source_name: "semantic-scholar",
      query: q,
      status_code: r.status,
      result_count: r.papers.length,
      error_message: r.error,
    });
    if (r.error) errors.push(r.error);
    if (r.papers.length > 0) {
      papers = dedupeMerge(papers, r.papers);
    }
    if (papers.length >= SUCCESS_THRESHOLD) break;
  }

  // Optional PubMed enhancement (silent if it fails or no key).
  let lastPubmedStatus = 0;
  if (papers.length < SUCCESS_THRESHOLD) {
    const pmQuery = primary || allQueries[0] || "cell viability";
    const pm = await fetchPubMed(pmQuery, pubmedKey);
    lastPubmedStatus = pm.status;
    attempts.push({
      source_name: "pubmed",
      query: pmQuery,
      status_code: pm.status,
      result_count: pm.papers.length,
      error_message: pm.error,
    });
    if (pm.error) errors.push(pm.error);
    if (pm.papers.length > 0) papers = dedupeMerge(papers, pm.papers);
  }

  papers = rerank(papers);

  const usedFallback = papers.length < SUCCESS_THRESHOLD;
  const sourcesPresent = new Set(papers.map((p) => p.source));
  const source: LiteratureDebug["source"] =
    papers.length === 0
      ? "none"
      : sourcesPresent.size > 1
        ? "merged"
        : sourcesPresent.has("semantic-scholar")
          ? "semantic-scholar"
          : "pubmed";

  return {
    data: papers,
    debug: {
      proxyUsed: true,
      hasSemanticScholarKey,
      hasPubMedKey,
      primaryQuery: primary,
      attempts,
      semanticScholarStatus: lastS2Status,
      pubmedStatus: lastPubmedStatus,
      resultCount: papers.length,
      source,
      used_fallback: usedFallback,
      errors,
    },
  };
}
