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
//   5. Fall back through OpenAlex, Crossref, then PubMed.
//      Missing optional keys never block generation.
// All secrets are read here from process.env and never returned.
// ============================================================

import { buildAgentProfile } from "@/lib/agentProfile.server";

const S2_ENDPOINT = "https://api.semanticscholar.org/graph/v1/paper/search";
const S2_FIELDS =
  "paperId,title,abstract,year,venue,url,externalIds,citationCount,influentialCitationCount,authors,tldr";
const OPENALEX_WORKS = "https://api.openalex.org/works";
const CROSSREF_WORKS = "https://api.crossref.org/v1/works";
const PUBMED_ESEARCH = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi";
const PUBMED_ESUMMARY = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi";

const SUCCESS_THRESHOLD = 3;
const FALLBACK_QUERY_LIMIT = 3;
const DOMAIN_REQUIRED_TERMS = {
  soil_moisture_sensor: ["soil", "moisture", "sensor"],
} as const;

export type LiteratureSource = "semantic-scholar" | "openalex" | "crossref" | "pubmed";

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
  source: LiteratureSource;
  tldr: string | null;
};

export type LiteratureAttempt = {
  source_name: LiteratureSource;
  query: string;
  status_code: number;
  result_count: number;
  error_message: string | null;
};

export type LiteratureDebug = {
  proxyUsed: true;
  hasSemanticScholarKey: boolean;
  hasOpenAlexKey: boolean;
  hasOpenAlexEmail: boolean;
  hasCrossrefMailto: boolean;
  hasPubMedKey: boolean;
  primaryQuery: string;
  attempts: LiteratureAttempt[];
  semanticScholarStatus: number; // last s2 status (back-compat)
  openAlexStatus: number;
  crossrefStatus: number;
  pubmedStatus: number; // last pm status (back-compat)
  resultCount: number;
  source: LiteratureSource | "merged" | "none";
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

function buildQueryVariants(input: LiteratureInput, primary: string): string[] {
  const profile = buildAgentProfile(input);
  const text = `${typeof input.hypothesis === "string" ? input.hypothesis : ""} ${
    typeof input.domain === "string" ? input.domain : ""
  } ${typeof input.organism_or_system === "string" ? input.organism_or_system : ""}`.toLowerCase();

  const variants: string[] = [];
  const seen = new Set<string>([primary.toLowerCase()]);
  const addVariant = (q: string) => {
    const normalized = q.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    variants.push(q.trim());
  };
  const keywordTokens = tokens(text);
  for (const q of [
    keywordTokens.slice(0, 3).join(" "),
    keywordTokens.slice(0, 4).join(" "),
    keywordTokens.slice(0, 5).join(" "),
  ]) {
    addVariant(q);
  }
  if (/pm2|pm2\.5|air.?quality|particulate|low.?cost.*sensor|sensor.*drift/.test(text)) {
    addVariant("low cost air quality sensor calibration temperature humidity correction");
    addVariant("PM2.5 low cost sensor drift compensation");
    addVariant("air quality sensor calibration reference monitor");
  }
  if (/soil.?moisture|soil.?water|volumetric water|vwc|field crop|irrigation/.test(text)) {
    addVariant("soil moisture sensor site specific calibration");
    addVariant("soil moisture sensor field calibration crop plots");
    addVariant("soil water sensor calibration field capacity error");
    addVariant("soil moisture sensor calibration manufacturer equation field");
    addVariant("site specific calibration soil moisture sensors accuracy");
    addVariant("soil water sensor factory calibration field correction");
    addVariant("volumetric water content sensor site specific calibration");
  }
  for (const q of profile.literatureQueries) {
    addVariant(q);
  }

  if (profile.kind !== "life_science") {
    return variants;
  }

  const candidates: { match: RegExp; q: string }[] = [
    { match: /trehalose|cryo|freez|thaw|dmso/, q: "trehalose cryopreservation cell viability" },
    { match: /trehalose|dmso|cryo/, q: "trehalose DMSO cryopreservation" },
    { match: /hela|cell|cryo|freez/, q: "HeLa cell cryopreservation DMSO viability" },
    { match: /trehalose|thaw|viability/, q: "trehalose cells post-thaw viability" },
    { match: /viability|assay|trypan/, q: "cell viability assay trypan blue" },
    { match: /cell|culture|hela/, q: "mammalian cell culture cryopreservation" },
  ];

  for (const c of candidates) {
    if (!c.match.test(text)) continue;
    const q = c.q.toLowerCase();
    if (seen.has(q)) continue;
    seen.add(q);
    variants.push(c.q);
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

function formatAuthors(names: string[]): string {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return "Unknown authors";
  return clean.slice(0, 4).join(", ") + (clean.length > 4 ? ", et al." : "");
}

function stripTags(text: string | undefined | null): string {
  return (text ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function userAgent(email?: string): string {
  return email
    ? `HypothesisToPlan/1.0 (mailto:${email})`
    : "HypothesisToPlan/1.0 (https://github.com/Hayk686/hypothesis-to-plan)";
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
      const authors = formatAuthors((p.authors ?? []).map((a) => a.name ?? ""));
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

// ---------- OpenAlex (free tier / optional API key) ----------

type OpenAlexWork = {
  id?: string;
  doi?: string | null;
  display_name?: string | null;
  publication_year?: number | null;
  cited_by_count?: number | null;
  abstract_inverted_index?: Record<string, number[]> | null;
  authorships?: { author?: { display_name?: string | null } | null }[];
  primary_location?: {
    landing_page_url?: string | null;
    source?: { display_name?: string | null } | null;
  } | null;
};

function openAlexAbstract(index: OpenAlexWork["abstract_inverted_index"]): string {
  if (!index) return "Abstract unavailable from OpenAlex.";
  const words: Array<{ word: string; pos: number }> = [];
  for (const [word, positions] of Object.entries(index)) {
    for (const pos of positions) words.push({ word, pos });
  }
  return words
    .sort((a, b) => a.pos - b.pos)
    .map((w) => w.word)
    .join(" ");
}

async function fetchOpenAlex(
  query: string,
  apiKey: string | undefined,
  email: string | undefined,
): Promise<{ status: number; papers: NormalizedPaper[]; error: string | null }> {
  const params = new URLSearchParams({
    search: query,
    "per-page": "8",
    select:
      "id,doi,display_name,publication_year,primary_location,cited_by_count,authorships,abstract_inverted_index",
  });
  if (apiKey) params.set("api_key", apiKey);
  else if (email) params.set("mailto", email);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${OPENALEX_WORKS}?${params.toString()}`, {
      headers: { Accept: "application/json", "User-Agent": userAgent(email) },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return { status: res.status, papers: [], error: `OpenAlex HTTP ${res.status}` };
    }
    const json = (await res.json()) as { results?: OpenAlexWork[] };
    const papers: NormalizedPaper[] = (json.results ?? [])
      .filter((w) => w.display_name)
      .slice(0, 8)
      .map((w, idx) => {
        const doi = w.doi?.replace(/^https?:\/\/doi\.org\//i, "") ?? null;
        const citations = w.cited_by_count ?? 0;
        return {
          id: w.id ?? `oa-${idx}`,
          title: w.display_name ?? "Untitled",
          authors: formatAuthors(
            (w.authorships ?? []).map((a) => a.author?.display_name ?? "").filter(Boolean),
          ),
          year: w.publication_year ?? 0,
          venue: w.primary_location?.source?.display_name ?? "OpenAlex",
          abstract: openAlexAbstract(w.abstract_inverted_index),
          citation_count: citations,
          influential_citation_count: 0,
          source_url:
            w.primary_location?.landing_page_url ?? (doi ? `https://doi.org/${doi}` : (w.id ?? "")),
          doi,
          pmid: null,
          relevance_score: relevanceScore(idx, citations),
          evidence_role: evidenceRole(idx),
          source: "openalex",
          tldr: null,
        };
      });
    return { status: res.status, papers, error: null };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      status: 0,
      papers: [],
      error: err instanceof Error ? err.message : "OpenAlex fetch failed",
    };
  }
}

// ---------- Crossref (public REST API / polite mailto optional) ----------

type CrossrefAuthor = { given?: string; family?: string; name?: string };
type CrossrefWork = {
  DOI?: string;
  title?: string[];
  author?: CrossrefAuthor[];
  issued?: { "date-parts"?: number[][] };
  published?: { "date-parts"?: number[][] };
  "published-print"?: { "date-parts"?: number[][] };
  "published-online"?: { "date-parts"?: number[][] };
  "container-title"?: string[];
  URL?: string;
  abstract?: string;
  "is-referenced-by-count"?: number;
};

function crossrefYear(item: CrossrefWork): number {
  const date =
    item["published-print"]?.["date-parts"]?.[0] ??
    item["published-online"]?.["date-parts"]?.[0] ??
    item.published?.["date-parts"]?.[0] ??
    item.issued?.["date-parts"]?.[0] ??
    [];
  return typeof date[0] === "number" ? date[0] : 0;
}

async function fetchCrossref(
  query: string,
  mailto: string | undefined,
): Promise<{ status: number; papers: NormalizedPaper[]; error: string | null }> {
  const params = new URLSearchParams({
    query,
    rows: "8",
    sort: "relevance",
    filter: "type:journal-article",
  });
  if (mailto) params.set("mailto", mailto);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${CROSSREF_WORKS}?${params.toString()}`, {
      headers: { Accept: "application/json", "User-Agent": userAgent(mailto) },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      return { status: res.status, papers: [], error: `Crossref HTTP ${res.status}` };
    }
    const json = (await res.json()) as { message?: { items?: CrossrefWork[] } };
    const papers: NormalizedPaper[] = (json.message?.items ?? [])
      .filter((w) => w.title?.[0])
      .slice(0, 8)
      .map((w, idx) => {
        const doi = w.DOI ?? null;
        const citations = w["is-referenced-by-count"] ?? 0;
        const authors = formatAuthors(
          (w.author ?? []).map((a) =>
            a.name ? a.name : `${a.given ?? ""} ${a.family ?? ""}`.trim(),
          ),
        );
        return {
          id: doi ? `cr-${doi}` : `cr-${idx}-${w.title?.[0]?.slice(0, 24)}`,
          title: w.title?.[0] ?? "Untitled",
          authors,
          year: crossrefYear(w),
          venue: w["container-title"]?.[0] ?? "Crossref",
          abstract: stripTags(w.abstract) || "Abstract unavailable from Crossref.",
          citation_count: citations,
          influential_citation_count: 0,
          source_url: w.URL ?? (doi ? `https://doi.org/${doi}` : ""),
          doi,
          pmid: null,
          relevance_score: relevanceScore(idx, citations),
          evidence_role: evidenceRole(idx),
          source: "crossref",
          tldr: null,
        };
      });
    return { status: res.status, papers, error: null };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      status: 0,
      papers: [],
      error: err instanceof Error ? err.message : "Crossref fetch failed",
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
        const authorStr = formatAuthors((item.authors ?? []).map((a) => a.name ?? ""));
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

function requiredDomainTerms(queries: string[]): readonly string[] {
  const q = queries.join(" ").toLowerCase();
  if (/soil.?moisture|soil.?water|volumetric water|vwc/.test(q) && /sensor|probe/.test(q)) {
    return DOMAIN_REQUIRED_TERMS.soil_moisture_sensor;
  }
  return [];
}

function hasRequiredDomainTerms(paper: NormalizedPaper, requiredTerms: readonly string[]): boolean {
  if (requiredTerms.length === 0) return true;
  const text = `${paper.title} ${paper.abstract}`.toLowerCase();
  const matches = requiredTerms.filter((t) => text.includes(t));
  return matches.length >= Math.min(requiredTerms.length, 2);
}

function lexicalScore(
  paper: NormalizedPaper,
  queryTokens: string[],
  requiredTerms: readonly string[],
): number {
  const title = paper.title.toLowerCase();
  const abstract = paper.abstract.toLowerCase();
  let score = 0;
  for (const t of queryTokens) {
    if (title.includes(t)) score += 2;
    else if (abstract.includes(t)) score += 1;
  }
  if (!hasRequiredDomainTerms(paper, requiredTerms)) {
    score -= queryTokens.length;
  }
  return queryTokens.length ? score / (queryTokens.length * 2) : 0;
}

function rerank(papers: NormalizedPaper[], queries: string[]): NormalizedPaper[] {
  const requiredTerms = requiredDomainTerms(queries);
  const queryTokens = Array.from(
    new Set(
      tokens(queries.join(" ")).filter(
        (t) => !["study", "field", "effect", "specific", "calibration", "curve"].includes(t),
      ),
    ),
  ).slice(0, 18);
  const scored = papers.map((p) => ({
    paper: p,
    lexical: lexicalScore(p, queryTokens, requiredTerms),
  }));
  const relevant = scored.filter(
    (row) => row.lexical >= 0.08 && hasRequiredDomainTerms(row.paper, requiredTerms),
  );
  const pool = relevant.length > 0 ? relevant : scored;
  const sorted = [...pool].sort((a, b) => {
    if (b.lexical !== a.lexical) return b.lexical - a.lexical;
    if (b.paper.citation_count !== a.paper.citation_count) {
      return b.paper.citation_count - a.paper.citation_count;
    }
    return b.paper.relevance_score - a.paper.relevance_score;
  });
  return sorted.slice(0, 10).map(({ paper, lexical }, idx) => ({
    ...paper,
    relevance_score: Math.max(
      0.1,
      Math.min(
        1,
        Math.round((lexical * 0.75 + relevanceScore(idx, paper.citation_count) * 0.25) * 100) / 100,
      ),
    ),
    evidence_role: evidenceRole(idx),
  }));
}

export const __literatureTestHooks = {
  buildQueryVariants,
  rerank,
};

// ---------- public entrypoint ----------

export async function runLiteratureSearch(input: LiteratureInput): Promise<LiteratureResult> {
  const s2Key = process.env.SEMANTIC_SCHOLAR_API_KEY;
  const openAlexKey = process.env.OPENALEX_API_KEY;
  const openAlexEmail = process.env.OPENALEX_EMAIL ?? process.env.CROSSREF_MAILTO;
  const crossrefMailto = process.env.CROSSREF_MAILTO ?? process.env.OPENALEX_EMAIL;
  const pubmedKey = process.env.NCBI_API_KEY;
  const hasSemanticScholarKey = Boolean(s2Key);
  const hasOpenAlexKey = Boolean(openAlexKey);
  const hasOpenAlexEmail = Boolean(openAlexEmail);
  const hasCrossrefMailto = Boolean(crossrefMailto);
  const hasPubMedKey = Boolean(pubmedKey);

  const primary = buildPrimaryQuery(input);
  const variants = buildQueryVariants(input, primary);
  const allQueries = [primary, ...variants].filter((q) => q && q.trim().length > 0);

  const attempts: LiteratureAttempt[] = [];
  const errors: string[] = [];
  let papers: NormalizedPaper[] = [];
  let lastS2Status = 0;
  let lastOpenAlexStatus = 0;
  let lastCrossrefStatus = 0;
  let lastPubmedStatus = 0;

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

  const fallbackQueries = allQueries.slice(0, FALLBACK_QUERY_LIMIT);

  if (papers.length < SUCCESS_THRESHOLD) {
    for (const q of fallbackQueries) {
      const oa = await fetchOpenAlex(q, openAlexKey, openAlexEmail);
      lastOpenAlexStatus = oa.status;
      attempts.push({
        source_name: "openalex",
        query: q,
        status_code: oa.status,
        result_count: oa.papers.length,
        error_message: oa.error,
      });
      if (oa.error) errors.push(oa.error);
      if (oa.papers.length > 0) papers = dedupeMerge(papers, oa.papers);
      if (papers.length >= SUCCESS_THRESHOLD) break;
    }
  }

  if (papers.length < SUCCESS_THRESHOLD) {
    for (const q of fallbackQueries) {
      const cr = await fetchCrossref(q, crossrefMailto);
      lastCrossrefStatus = cr.status;
      attempts.push({
        source_name: "crossref",
        query: q,
        status_code: cr.status,
        result_count: cr.papers.length,
        error_message: cr.error,
      });
      if (cr.error) errors.push(cr.error);
      if (cr.papers.length > 0) papers = dedupeMerge(papers, cr.papers);
      if (papers.length >= SUCCESS_THRESHOLD) break;
    }
  }

  // PubMed is most useful for biomedical domains; keep it as a final enhancement
  // after broader scholarly indexes so materials/engineering projects do not get
  // mislabeled as PubMed-sourced just because Semantic Scholar rate-limited.
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

  papers = rerank(papers, allQueries);

  const usedFallback = papers.length < SUCCESS_THRESHOLD;
  const sourcesPresent = new Set(papers.map((p) => p.source));
  const source: LiteratureDebug["source"] =
    papers.length === 0
      ? "none"
      : sourcesPresent.size > 1
        ? "merged"
        : sourcesPresent.has("semantic-scholar")
          ? "semantic-scholar"
          : sourcesPresent.has("openalex")
            ? "openalex"
            : sourcesPresent.has("crossref")
              ? "crossref"
              : "pubmed";

  return {
    data: papers,
    debug: {
      proxyUsed: true,
      hasSemanticScholarKey,
      hasOpenAlexKey,
      hasOpenAlexEmail,
      hasCrossrefMailto,
      hasPubMedKey,
      primaryQuery: primary,
      attempts,
      semanticScholarStatus: lastS2Status,
      openAlexStatus: lastOpenAlexStatus,
      crossrefStatus: lastCrossrefStatus,
      pubmedStatus: lastPubmedStatus,
      resultCount: papers.length,
      source,
      used_fallback: usedFallback,
      errors,
    },
  };
}
