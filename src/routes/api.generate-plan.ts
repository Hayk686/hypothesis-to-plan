// ============================================================
// /api/generate-plan — server route
// ------------------------------------------------------------
// Orchestrates:
//   1. /api/search-literature  (Semantic Scholar + optional PubMed)
//   2. /api/search-protocols   (protocols.io + curated fallback)
//   3. /api/resolve-materials  (verified supplier registry)
//
// Returns a strict JSON object that mirrors the dashboard's
// existing GeneratedPlan structure plus the new top-level fields:
//   project_summary, literature_qc, evidence_map, protocols,
//   materials_budget, lab_readiness_score, timeline,
//   validation_plan, risks, scientist_review_questions,
//   judge_presentation_view, debug.
//
// Internally it calls the sibling routes by absolute origin so the
// secrets & headers remain server-side. If a sub-route fails, the
// orchestrator clearly labels the section as fallback (never
// silently invents data).
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import { getRequestUrl } from "@tanstack/react-start/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
} as const;

type ProjectInput = {
  id?: string;
  title?: string;
  hypothesis?: string;
  domain?: string;
  organism?: string;
  organism_or_system?: string;
  constraints?: string;
  budget?: number;
  timelineWeeks?: number;
  resources?: string;
  method_keywords?: string | string[];
  required_materials?: string[];
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function callSibling<T>(origin: string, path: string, body: unknown): Promise<{
  ok: boolean;
  status: number;
  json: T | null;
  error?: string;
}> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(`${origin}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    let json: T | null = null;
    try {
      json = (await res.json()) as T;
    } catch {
      json = null;
    }
    return { ok: res.ok, status: res.status, json };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      json: null,
      error: err instanceof Error ? err.message : "sibling call failed",
    };
  }
}

// Sub-route response shapes (loose — only what we consume here).
type LitResp = {
  data?: Array<{
    id: string;
    title: string;
    authors: string;
    year: number;
    venue: string;
    abstract: string;
    citation_count: number;
    source_url: string;
    doi: string | null;
    pmid: string | null;
    relevance_score: number;
    evidence_role: "primary" | "supporting" | "background";
    source: "semantic-scholar" | "pubmed";
    tldr: string | null;
  }>;
  debug?: unknown;
};
type ProtoResp = {
  data?: Array<{
    id: string;
    title: string;
    source: "protocols.io" | "curated-fallback";
    url: string;
    authors: string;
    relevance_score: number;
    matched_keywords: string[];
    description: string;
  }>;
  debug?: unknown;
};
type MatResp = {
  data?: Array<{
    name: string;
    supplier: string;
    product: string;
    catalog: string;
    category: "reagent" | "equipment" | "consumable" | "service";
    source_url: string;
    unit_cost: number;
    pack_size: string;
    verified: boolean;
    note: string;
  }>;
  debug?: unknown;
};

// ---------- helpers ----------

function safeStr(v: unknown, fallback = ""): string {
  return typeof v === "string" && v.trim() ? v.trim() : fallback;
}
function safeNum(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function buildTimeline(weeks: number) {
  const target = Math.max(4, Math.min(16, Math.round(weeks)));
  const phases = [
    { phase: "Planning", milestone: "Project locked",
      tasks: ["Pre-register hypothesis and primary endpoint", "Place reagent orders", "Confirm equipment availability"],
      deliverable: "Pre-registration + reagent orders" },
    { phase: "Cell prep", milestone: "Cells expanded",
      tasks: ["Thaw working stock", "Expand to target confluence", "Mycoplasma test"],
      deliverable: "Healthy cell stock" },
    { phase: "Intervention", milestone: "Treatment applied",
      tasks: ["Prepare media / treatment arms", "Apply intervention", "Capture intermediate readouts"],
      deliverable: "Treated samples ready for measurement" },
    { phase: "Storage / hold", milestone: "Hold complete",
      tasks: ["Maintain hold conditions", "Pre-warm media", "Blind sample labels"],
      deliverable: "Hold complete, counter blinded" },
    { phase: "Measurement", milestone: "Primary readout",
      tasks: ["Collect primary readout", "Collect secondary readouts", "Photograph plates"],
      deliverable: "Raw data for primary endpoint" },
    { phase: "Analysis", milestone: "Report drafted",
      tasks: ["Compute summary statistics", "Test pre-registered threshold", "Write methods + results"],
      deliverable: "Locked report + figures" },
  ];
  return Array.from({ length: target }, (_, i) => {
    const src = phases[Math.min(phases.length - 1, Math.floor((i / target) * phases.length))];
    return { week: i + 1, ...src };
  });
}

function defaultRisks() {
  return [
    { id: "r1", title: "Effect size smaller than expected", category: "scientific",
      likelihood: "medium", impact: "medium",
      mitigation: "Pre-register the threshold and the analysis; pre-power n with conservative assumptions." },
    { id: "r2", title: "Operator / counter bias", category: "scientific",
      likelihood: "medium", impact: "medium",
      mitigation: "Blind labels; have a second operator re-count a random subset (≥25%)." },
    { id: "r3", title: "Reagent backorder delays the experiment", category: "operational",
      likelihood: "low", impact: "medium",
      mitigation: "Order reagents in week 1 and identify a second supplier per critical SKU." },
    { id: "r4", title: "Budget overrun on consumables", category: "budget",
      likelihood: "medium", impact: "low",
      mitigation: "Confirm current vendor prices in week 1; drop one biological replicate before skipping controls." },
  ];
}

// ---------- route ----------

export const Route = createFileRoute("/api/generate-plan")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
        const url = getRequestUrl();
        const origin = `${url.protocol}//${url.host}`;

        let project: ProjectInput = {};
        try {
          const body = (await request.json()) as { project?: ProjectInput };
          project = body.project ?? (body as ProjectInput);
        } catch {
          return jsonResponse({ error: "Invalid JSON body. Expected { project: {...} }." }, 400);
        }

        const hypothesis = safeStr(project.hypothesis);
        if (!hypothesis) {
          return jsonResponse({ error: "project.hypothesis is required." }, 400);
        }
        const domain = safeStr(project.domain, "biology");
        const organism = safeStr(project.organism_or_system ?? project.organism, "");
        const constraints = safeStr(project.constraints, "");
        const budget = safeNum(project.budget, 5000);
        const weeks = safeNum(project.timelineWeeks, 6);

        // Run literature, protocols, materials in parallel.
        const [lit, proto, mat] = await Promise.all([
          callSibling<LitResp>(origin, "/api/search-literature", {
            hypothesis, domain, organism_or_system: organism, constraints,
          }),
          callSibling<ProtoResp>(origin, "/api/search-protocols", {
            hypothesis, organism_or_system: organism,
            method_keywords: project.method_keywords,
          }),
          callSibling<MatResp>(origin, "/api/resolve-materials", {
            organism_or_system: organism,
            assay_type: domain,
            required_materials: project.required_materials,
            protocol_steps: [],
          }),
        ]);

        const papers = lit.json?.data ?? [];
        const protocols = proto.json?.data ?? [];
        const materials = mat.json?.data ?? [];

        const evidenceWeak = papers.length < 2;
        const usedFallback = {
          literature: papers.length === 0,
          protocols:
            protocols.length === 0 ||
            protocols.every((p) => p.source === "curated-fallback"),
          materials: materials.some((m) => !m.verified),
        };

        // ----- Materials budget -----
        const totalMaterials = materials.reduce(
          (sum, m) => sum + (m.verified ? m.unit_cost : 0),
          0,
        );
        const materials_budget = {
          items: materials.map((m) => ({
            name: m.name,
            supplier: m.supplier,
            product: m.product,
            catalog: m.catalog,
            category: m.category,
            unit_cost: m.unit_cost,
            pack_size: m.pack_size,
            source_url: m.source_url,
            verified: m.verified,
            note: m.note,
          })),
          subtotal_verified: totalMaterials,
          budget_cap: budget,
          within_budget: totalMaterials <= budget,
          source_badge: usedFallback.materials
            ? "Curated fallback (some items unverified)"
            : "Verified supplier source",
        };

        // ----- Lab readiness score -----
        const readinessFactors = {
          verified_materials_ratio:
            materials.length === 0
              ? 0
              : materials.filter((m) => m.verified).length / materials.length,
          has_primary_protocol: protocols.length > 0 ? 1 : 0,
          within_budget: materials_budget.within_budget ? 1 : 0,
          has_evidence: papers.length >= 2 ? 1 : papers.length === 1 ? 0.5 : 0,
        };
        const lab_readiness_score = Math.round(
          (readinessFactors.verified_materials_ratio * 35 +
            readinessFactors.has_primary_protocol * 25 +
            readinessFactors.within_budget * 20 +
            readinessFactors.has_evidence * 20),
        );

        // ----- Literature QC -----
        const literature_qc = {
          result:
            papers.length === 0
              ? "No prior work found"
              : papers.length <= 2
                ? "Limited prior work — confirm before proceeding"
                : "Similar work exists",
          reason:
            papers.length === 0
              ? "No relevant papers returned by the live literature search. Refine the hypothesis or check the keywords."
              : `Live literature search returned ${papers.length} relevant papers (top relevance ${Math.round((papers[0]?.relevance_score ?? 0) * 100)}%). Review the primary citation before assuming novelty.`,
          weak_evidence: evidenceWeak,
        };

        // ----- Evidence map -----
        const evidence_map = papers.map((p) => ({
          id: p.id,
          title: p.title,
          role: p.evidence_role,
          source: p.source,
          source_url: p.source_url,
          relevance_score: p.relevance_score,
          year: p.year,
          venue: p.venue,
        }));

        // ----- Validation plan -----
        const validation_plan = {
          primary_metric: {
            name: "Pre-registered primary endpoint derived from the hypothesis",
            target: "Defined effect size with one-sided test at α = 0.05",
            method: "Direct measurement of the dependent variable in the hypothesis",
          },
          secondary_metrics: [
            { name: "Time-course readouts", target: "Trend consistent with primary", method: "Same assay at later time points" },
          ],
          statistical_approach:
            "Pre-registered Welch's t-test with α = 0.05, n powered to detect the stated effect size; report point estimate and 95% CI.",
          reproducibility_checks: [
            "Pre-register the endpoint and analysis script",
            "Independent re-count / re-measurement of a random ≥25% subset",
            "Publish raw data and analysis script",
          ],
          positive_control: "Untreated / non-perturbed sample from the same batch",
          negative_control: "Vehicle-only or assay-floor condition",
        };

        // ----- Scientist review questions -----
        const scientist_review_questions = [
          "Is the pre-registered effect size realistic given the published baselines?",
          "Are the verified catalog numbers still in stock at the assumed prices?",
          "Does the primary protocol need adaptation for this organism / assay?",
          "Are the proposed controls sufficient to rule out the top two confounders?",
        ];

        // ----- Project summary + judge view -----
        const project_summary = {
          title: safeStr(project.title, "Untitled experiment"),
          hypothesis,
          domain,
          organism_or_system: organism,
          budget_cap: budget,
          timeline_weeks: weeks,
          constraints,
          source: project.id === "demo-trehalose-hela-001" ? "Seeded verified demo" : "Live generation",
        };
        const judge_presentation_view = {
          headline: project_summary.title,
          one_line_pitch: hypothesis.length > 220 ? `${hypothesis.slice(0, 217)}…` : hypothesis,
          key_evidence: papers.slice(0, 3).map((p) => ({
            title: p.title, year: p.year, source_url: p.source_url, role: p.evidence_role,
          })),
          primary_protocol: protocols[0]
            ? { title: protocols[0].title, url: protocols[0].url, source: protocols[0].source }
            : null,
          lab_readiness_score,
          materials_within_budget: materials_budget.within_budget,
          evidence_strength: evidenceWeak ? "weak" : "adequate",
        };

        // ----- Debug -----
        const debug = {
          orchestrator: { origin, evidenceWeak, usedFallback },
          literature: lit.json?.debug ?? { error: lit.error, status: lit.status },
          protocols: proto.json?.debug ?? { error: proto.error, status: proto.status },
          materials: mat.json?.debug ?? { error: mat.error, status: mat.status },
        };

        return jsonResponse({
          project_summary,
          literature_qc,
          evidence_map,
          protocols: protocols.map((p) => ({
            id: p.id,
            title: p.title,
            url: p.url,
            source: p.source,
            authors: p.authors,
            relevance_score: p.relevance_score,
            matched_keywords: p.matched_keywords,
            description: p.description,
          })),
          materials_budget,
          lab_readiness_score,
          timeline: buildTimeline(weeks),
          validation_plan,
          risks: defaultRisks(),
          scientist_review_questions,
          judge_presentation_view,
          warnings: {
            evidence_weak: evidenceWeak,
            uses_fallback_literature: usedFallback.literature,
            uses_fallback_protocols: usedFallback.protocols,
            has_unverified_materials: usedFallback.materials,
          },
          debug,
        });
      },
    },
  },
});
