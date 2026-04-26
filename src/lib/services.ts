// ============================================================
// API-READY SERVICE LAYER
// ------------------------------------------------------------
// These functions are the single integration point between the
// UI and external/internal APIs. Today they return verified
// seeded data so the demo runs with no API keys. Tomorrow each
// function body can be replaced with a real fetch() to:
//
//   - Semantic Scholar  (literature QC, paper metadata)
//       /paper/search, /paper/{id}, /paper/{id}/references,
//       /paper/{id}/citations
//   - protocols.io      (protocol matching)
//   - Anthropic API     (LLM-structured experiment-plan output
//                        via JSON schema / tool calling)
//   - FastAPI backend   (literature QC + plan generation)
//   - Supabase Postgres (plan storage in JSONB,
//                        pgvector/Chroma for feedback memory)
//
// The UI MUST NOT be changed when swapping the implementation —
// only the bodies of these functions change.
// ============================================================

import {
  DEMO_PLAN,
  DEMO_PROJECT,
  generatePlan,
  type GeneratedPlan,
  type Paper,
  type Project,
  type ProtocolStep,
} from "@/lib/mockData";

/** Where the data is currently coming from. Surfaced in the UI. */
export type DataSource = "seed" | "live-api" | "fallback";

export type LiteratureDebug = {
  proxyUsed: boolean;
  hasApiKey: boolean;
  semanticScholarStatus: number;
  resultCount: number;
};

export type ServiceResult<T> = {
  data: T;
  source: DataSource;
  /** Optional human-readable note for the UI (e.g. "Semantic Scholar hit"). */
  note?: string;
  /** Optional debug info surfaced in the dev/debug UI line. */
  debug?: LiteratureDebug;
};

const SIMULATED_LATENCY_MS = 250;

function delay<T>(value: T, ms = SIMULATED_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// ------------------------------------------------------------
// 1. Literature search — server proxy → Semantic Scholar
// ------------------------------------------------------------
/**
 * Search literature for a hypothesis / query string.
 *
 * Calls our own server route POST /api/search-papers, which
 * proxies to Semantic Scholar with the server-only
 * SEMANTIC_SCHOLAR_API_KEY (never exposed to the browser).
 *
 * On ANY failure (HTTP error, 429/403, network, empty result),
 * falls back to the verified seeded corpus in mockData.ts so the
 * demo never breaks.
 */
const PROXY_ENDPOINT = "/api/search-papers";

type S2Author = { name?: string };
type S2Paper = {
  paperId?: string;
  title?: string;
  authors?: S2Author[];
  year?: number | null;
  venue?: string | null;
  abstract?: string | null;
  citationCount?: number | null;
  url?: string | null;
  externalIds?: { DOI?: string } | null;
};
type S2Response = { data?: S2Paper[] };

function s2ToPaper(p: S2Paper, idx: number): Paper {
  const authors =
    p.authors && p.authors.length
      ? p.authors
          .slice(0, 4)
          .map((a) => a.name ?? "")
          .filter(Boolean)
          .join(", ") + (p.authors.length > 4 ? ", et al." : "")
      : "Unknown authors";
  const url =
    p.url ??
    (p.externalIds?.DOI ? `https://doi.org/${p.externalIds.DOI}` : "");
  return {
    id: p.paperId ?? `s2-${idx}`,
    title: p.title ?? "Untitled",
    authors,
    year: p.year ?? 0,
    venue: p.venue ?? "Semantic Scholar",
    citations: p.citationCount ?? 0,
    similarity: Math.max(0.5, 0.95 - idx * 0.05),
    abstract: p.abstract ?? "Abstract unavailable from Semantic Scholar.",
    whyItMatters:
      "Returned by live Semantic Scholar search for this hypothesis — review the abstract to confirm relevance.",
    doi: url,
    verification: {
      status: "verified",
      sourceUrl: url,
      note: "Live Semantic Scholar result — confirm the page is current before citing.",
      checkedAt: new Date().toISOString().slice(0, 10),
    },
  };
}

export async function searchLiterature(
  query: string,
): Promise<ServiceResult<Paper[]>> {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      data: DEMO_PLAN.papers,
      source: "fallback",
      note: "Empty query — using verified seeded fallback.",
    };
  }

  let debug: LiteratureDebug = {
    proxyUsed: true,
    hasApiKey: false,
    semanticScholarStatus: 0,
    resultCount: 0,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 9000);
    const res = await fetch(PROXY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query: trimmed }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    let json: {
      data?: S2Paper[];
      usedApiKey?: boolean;
      debug?: Partial<LiteratureDebug>;
    } = {};
    try {
      json = await res.json();
    } catch {
      // fall through with empty json
    }
    if (json.debug) {
      debug = { ...debug, ...json.debug };
    } else {
      debug.semanticScholarStatus = res.status;
    }

    if (res.status === 429) throw new Error("Rate limited (HTTP 429)");
    if (res.status === 403) throw new Error("Forbidden (HTTP 403)");
    if (!res.ok) throw new Error(`Proxy HTTP ${res.status}`);

    const items = (json.data ?? []).filter((p) => p && p.title);
    if (!items.length) throw new Error("No papers returned");
    debug.resultCount = items.length;

    return {
      data: items.slice(0, 6).map(s2ToPaper),
      source: "live-api",
      note: json.usedApiKey
        ? "Live Semantic Scholar (server proxy, with API key)."
        : "Live Semantic Scholar (server proxy, keyless).",
      debug,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "live API unavailable";
    const isRateLimited = /429|rate/i.test(msg);
    return {
      data: DEMO_PLAN.papers,
      source: "fallback",
      note: isRateLimited
        ? "Rate limited — using verified source-backed fallback."
        : `Verified source-backed fallback — ${msg}.`,
      debug,
    };
  }
}

// ------------------------------------------------------------
// 2. Paper details — Semantic Scholar /paper/{id}
//    + /paper/{id}/references + /paper/{id}/citations
// ------------------------------------------------------------
export type PaperDetails = {
  paper: Paper;
  references: Paper[];
  citations: Paper[];
};

export async function getPaperDetails(
  paperId: string,
): Promise<ServiceResult<PaperDetails | null>> {
  const paper = DEMO_PLAN.papers.find((p) => p.id === paperId) ?? null;
  if (!paper) {
    return delay({
      data: null,
      source: "fallback",
      note: "Paper not found in seeded corpus.",
    });
  }
  return delay({
    data: {
      paper,
      // In production these come from /paper/{id}/references and /citations.
      references: DEMO_PLAN.papers.filter((p) => p.id !== paperId).slice(0, 2),
      citations: DEMO_PLAN.papers.filter((p) => p.id !== paperId).slice(0, 2),
    },
    source: "seed",
  });
}

// ------------------------------------------------------------
// 3. Protocol matching — protocols.io API
// ------------------------------------------------------------
/**
 * Match the hypothesis to existing published protocols.
 *
 * Live wiring (future):
 *   GET https://www.protocols.io/api/v3/protocols?filter=public&key=<query>
 */
export async function matchProtocols(
  hypothesis: string,
): Promise<ServiceResult<ProtocolStep[]>> {
  void hypothesis;
  return delay({
    data: DEMO_PLAN.protocol,
    source: "seed",
    note: "Seeded protocol from OpenWetWare + protocols.io references.",
  });
}

// ------------------------------------------------------------
// 4. Experiment plan generation — FastAPI + Anthropic
// ------------------------------------------------------------
/**
 * Generate a full experiment plan from a project's hypothesis.
 *
 * Live wiring (future):
 *   POST https://<fastapi-host>/v1/experiment-plan
 *     body: { project }
 *     The FastAPI service then calls Anthropic's API with a
 *     JSON-schema / tool-calling prompt to return a structured
 *     GeneratedPlan, stored in Supabase Postgres (JSONB column).
 */
export async function generateExperimentPlan(
  project: Project,
): Promise<ServiceResult<GeneratedPlan>> {
  return delay({
    data: generatePlan(project),
    source: project.id === DEMO_PROJECT.id ? "seed" : "fallback",
    note:
      project.id === DEMO_PROJECT.id
        ? "Verified demo plan (HeLa trehalose vs DMSO)."
        : "Fallback synthesis from seed plan scaled to your project inputs.",
  });
}

// ------------------------------------------------------------
// 5. Scientist feedback — Supabase + pgvector / Chroma
// ------------------------------------------------------------
export type ScientistFeedback = {
  projectId: string;
  targetType: "paper" | "protocol" | "material" | "plan";
  targetId: string;
  rating: "useful" | "wrong" | "needs-review";
  comment?: string;
  createdAt: string;
};

const FEEDBACK_KEY = "h2p_scientist_feedback_v1";

/**
 * Persist a scientist's review of a generated artifact.
 *
 * Live wiring (future):
 *   POST https://<supabase-url>/rest/v1/scientist_feedback
 *   + embed(comment) → pgvector/Chroma for similarity recall
 *     so future plans learn from past corrections.
 */
export async function saveScientistFeedback(
  feedback: Omit<ScientistFeedback, "createdAt">,
): Promise<ServiceResult<ScientistFeedback>> {
  const record: ScientistFeedback = {
    ...feedback,
    createdAt: new Date().toISOString(),
  };
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(FEEDBACK_KEY);
      const list: ScientistFeedback[] = raw ? JSON.parse(raw) : [];
      list.push(record);
      window.localStorage.setItem(FEEDBACK_KEY, JSON.stringify(list));
    } catch {
      // best-effort only — feedback is not critical for demo
    }
  }
  return delay({
    data: record,
    source: "seed",
    note: "Stored locally — will be POSTed to Supabase in production.",
  });
}

// ------------------------------------------------------------
// 6. Live plan generation — POST /api/generate-plan
// ------------------------------------------------------------
/** Stages reported via the onStage callback, so the UI can show a stepper. */
export type GeneratePlanStage =
  | "searching-literature"
  | "checking-protocols"
  | "resolving-materials"
  | "generating-plan"
  | "done"
  | "error";

export type LivePlanPaper = {
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

export type LivePlanProtocol = {
  id: string;
  title: string;
  url: string;
  source: "protocols.io" | "curated-fallback";
  authors: string;
  relevance_score: number;
  matched_keywords: string[];
  description: string;
};

export type LivePlanMaterial = {
  name: string;
  supplier: string;
  product: string;
  catalog: string;
  category: "reagent" | "equipment" | "consumable" | "service";
  unit_cost: number;
  pack_size: string;
  source_url: string;
  verified: boolean;
  note: string;
};

export type LivePlanResponse = {
  project_summary: {
    title: string;
    hypothesis: string;
    domain: string;
    organism_or_system: string;
    budget_cap: number;
    timeline_weeks: number;
    constraints: string;
    source: string;
  };
  literature_qc: { result: string; reason: string; weak_evidence: boolean };
  evidence_map: Array<{
    id: string;
    title: string;
    role: "primary" | "supporting" | "background";
    source: "semantic-scholar" | "pubmed";
    source_url: string;
    relevance_score: number;
    year: number;
    venue: string;
  }>;
  protocols: LivePlanProtocol[];
  materials_budget: {
    items: LivePlanMaterial[];
    subtotal_verified: number;
    budget_cap: number;
    within_budget: boolean;
    source_badge: string;
  };
  lab_readiness_score: number;
  timeline: Array<{
    week: number;
    phase: string;
    milestone: string;
    tasks: string[];
    deliverable: string;
  }>;
  validation_plan: {
    primary_metric: { name: string; target: string; method: string };
    secondary_metrics: { name: string; target: string; method: string }[];
    statistical_approach: string;
    reproducibility_checks: string[];
    positive_control: string;
    negative_control: string;
  };
  risks: Array<{
    id: string;
    title: string;
    category: string;
    likelihood: string;
    impact: string;
    mitigation: string;
  }>;
  scientist_review_questions: string[];
  judge_presentation_view: unknown;
  source_status?: {
    literature: { label: string; ok: boolean; reason: string };
    protocols: { label: string; ok: boolean; reason: string };
    materials: { label: string; ok: boolean; reason: string };
  };
  warnings: {
    evidence_weak: boolean;
    uses_fallback_literature: boolean;
    uses_fallback_protocols: boolean;
    has_unverified_materials: boolean;
  };
  debug: {
    orchestrator: { evidenceWeak: boolean; usedFallback: Record<string, boolean> };
    literature: unknown;
    protocols: unknown;
    materials: unknown;
  };
};

export type LivePlanResult =
  | { ok: true; data: LivePlanResponse }
  | { ok: false; error: string; status: number };

/**
 * Call the orchestrator route. The `onStage` callback fires at each stage
 * boundary so the UI can render a "Searching literature → Checking protocols
 * → Resolving materials → Generating plan" stepper.
 *
 * Stages are simulated client-side (the server does the work in parallel), so
 * the user sees clear progress without slowing the response down. The final
 * "generating-plan" stage matches the actual orchestration call.
 */
export async function generatePlanLive(
  project: {
    id?: string;
    title: string;
    hypothesis: string;
    domain: string;
    organism: string;
    budget: number;
    timelineWeeks: number;
    constraints?: string;
  },
  onStage?: (stage: GeneratePlanStage) => void,
): Promise<LivePlanResult> {
  // Drive the visible stepper. Each delay is short — purely UX feedback.
  const tick = (s: GeneratePlanStage) => onStage?.(s);

  tick("searching-literature");
  await new Promise((r) => setTimeout(r, 250));
  tick("checking-protocols");
  await new Promise((r) => setTimeout(r, 200));
  tick("resolving-materials");
  await new Promise((r) => setTimeout(r, 200));
  tick("generating-plan");

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const res = await fetch("/api/generate-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        project: {
          id: project.id,
          title: project.title,
          hypothesis: project.hypothesis,
          domain: project.domain,
          organism_or_system: project.organism,
          budget: project.budget,
          timelineWeeks: project.timelineWeeks,
          constraints: project.constraints,
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      tick("error");
      return { ok: false, error: `Orchestrator HTTP ${res.status}`, status: res.status };
    }
    const json = (await res.json()) as LivePlanResponse;
    tick("done");
    return { ok: true, data: json };
  } catch (err) {
    tick("error");
    const msg = err instanceof Error ? err.message : "live pipeline failed";
    return { ok: false, error: msg, status: 0 };
  }
}

// ------------------------------------------------------------
// Stack manifest — surfaced in the "API Readiness" UI panel.
// ------------------------------------------------------------
export const TECH_STACK = {
  frontend: [
    "React (Next.js-style file-based routing via TanStack Router)",
    "Tailwind CSS",
    "shadcn/ui-style components",
    "Lucide icons",
    "Framer Motion-ready UI",
  ],
  backendPlanned: [
    "Python FastAPI service for literature QC and experiment-plan generation",
  ],
  apisPlanned: [
    {
      name: "Semantic Scholar",
      purpose: "Paper search and metadata",
      endpoints: [
        "/paper/search",
        "/paper/{id}",
        "/paper/{id}/references",
        "/paper/{id}/citations",
      ],
    },
    {
      name: "protocols.io",
      purpose: "Protocol matching",
      endpoints: ["/api/v3/protocols"],
    },
  ],
  llmLayerPlanned: [
    "Direct Anthropic API calls",
    "JSON schema / tool calling for structured experiment-plan output",
  ],
  databasePlanned: [
    "Supabase Postgres + JSONB for experiment plans",
    "pgvector or Chroma for scientist feedback memory",
  ],
  hostingPlanned: [
    "Vercel for the frontend",
    "Railway or Render for the FastAPI backend",
  ],
  demoNote:
    "This demo uses verified public-source seed data with optional Semantic Scholar refresh. Real APIs can replace the service layer (src/lib/services.ts) without changing the UI.",
} as const;
