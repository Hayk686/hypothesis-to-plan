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

export type ServiceResult<T> = {
  data: T;
  source: DataSource;
  /** Optional human-readable note for the UI (e.g. "Semantic Scholar hit"). */
  note?: string;
};

const SIMULATED_LATENCY_MS = 250;

function delay<T>(value: T, ms = SIMULATED_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// ------------------------------------------------------------
// 1. Literature search — Semantic Scholar /paper/search
// ------------------------------------------------------------
/**
 * Search literature for a hypothesis / query string.
 *
 * Live wiring (future):
 *   GET https://api.semanticscholar.org/graph/v1/paper/search
 *     ?query=<encoded query>&limit=10
 *     &fields=title,authors,year,venue,citationCount,abstract,externalIds
 */
export async function searchLiterature(
  query: string,
): Promise<ServiceResult<Paper[]>> {
  void query; // wired to the real API in production
  return delay({
    data: DEMO_PLAN.papers,
    source: "seed",
    note: "Seeded literature QC corpus (verified URLs).",
  });
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
    "This hackathon demo uses verified seeded real-source data and mock fallback data. Real APIs can replace the service layer (src/lib/services.ts) without changing the UI.",
} as const;
