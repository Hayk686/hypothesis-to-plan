// ============================================================
// /api/generate-plan — orchestrator
// ------------------------------------------------------------
// Calls the literature / protocols / materials cores DIRECTLY
// (in-process, not via internal HTTP). This avoids the
// localhost-internal-origin problem on the worker runtime where
// `fetch("https://localhost:8080/api/...")` always failed and
// silently triggered fallbacks.
// ============================================================

import { createFileRoute } from "@tanstack/react-router";
import {
  runLiteratureSearch,
  type LiteratureDebug,
  type NormalizedPaper,
} from "@/lib/literature.server";
import {
  runProtocolsSearch,
  type NormalizedProtocol,
  type ProtocolDebug,
} from "@/lib/protocols.server";
import {
  runMaterialsResolver,
  type NormalizedMaterial,
  type ResolveDebug,
} from "@/lib/materials.server";

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

export const Route = createFileRoute("/api/generate-plan")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS_HEADERS }),

      POST: async ({ request }) => {
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

        // Run literature, protocols, materials in parallel — IN-PROCESS.
        const [lit, proto, mat] = await Promise.all([
          runLiteratureSearch({ hypothesis, domain, organism_or_system: organism, constraints }),
          runProtocolsSearch({
            hypothesis,
            organism_or_system: organism,
            method_keywords: project.method_keywords,
          }),
          Promise.resolve(
            runMaterialsResolver({
              organism_or_system: organism,
              assay_type: domain,
              required_materials: project.required_materials,
              protocol_steps: [],
            }),
          ),
        ]);

        const papers: NormalizedPaper[] = lit.data;
        const protocols: NormalizedProtocol[] = proto.data;
        const materials: NormalizedMaterial[] = mat.data;

        const litDebug: LiteratureDebug = lit.debug;
        const protoDebug: ProtocolDebug = proto.debug;
        const matDebug: ResolveDebug = mat.debug;

        const evidenceWeak = papers.length < 2;
        const usedFallback = {
          literature: litDebug.used_fallback || papers.length === 0,
          protocols: protoDebug.used_fallback,
          materials: matDebug.used_fallback,
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
        // Weights: literature 25 / protocols 25 / materials 30 / budget 20.
        // Penalties: protocols fallback, missing catalog, missing/generic source URL.
        const litLive = !usedFallback.literature;
        const literatureScore = litLive && papers.length >= 3 ? 25 : papers.length >= 2 ? 18 : papers.length >= 1 ? 10 : 0;

        const protocolsLive = protocols.length > 0 && !usedFallback.protocols;
        const protocolsScore = protocolsLive ? 25 : protocols.length > 0 ? 12 : 0; // partial when curated fallback

        let materialsScore = 0;
        if (materials.length > 0) {
          const perItem = 30 / materials.length;
          for (const m of materials) {
            let item = perItem;
            if (!m.verified) {
              item = 0; // unmatched / unverified item
            } else {
              if (!m.catalog || m.catalog === "VERIFY_REQUIRED") item -= perItem * 0.5;
              const url = m.source_url ?? "";
              const hasSpecificUrl =
                /sigmaaldrich\.com|thermofisher\.com|fishersci\.com|gibco|milliporesigma|neb\.com|bio-rad|abcam/i.test(url);
              if (!url) item -= perItem * 0.4;
              else if (!hasSpecificUrl) item -= perItem * 0.2; // generic vendor
            }
            materialsScore += Math.max(0, item);
          }
        }

        const budgetScore = materials_budget.within_budget ? 20 : 0;

        const lab_readiness_score = Math.round(
          literatureScore + protocolsScore + materialsScore + budgetScore,
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
              ? "No relevant papers returned by Semantic Scholar (after broader query variants) and PubMed enhancement returned nothing usable."
              : `Returned ${papers.length} relevant papers (top relevance ${Math.round((papers[0]?.relevance_score ?? 0) * 100)}%). Source mix: ${litDebug.source}.`,
          weak_evidence: evidenceWeak,
        };

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

        const scientist_review_questions = [
          "Is the pre-registered effect size realistic given the published baselines?",
          "Are the verified catalog numbers still in stock at the assumed prices?",
          "Does the primary protocol need adaptation for this organism / assay?",
          "Are the proposed controls sufficient to rule out the top two confounders?",
        ];

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

        // ----- Per-source status (for the UI panel) -----
        const lastProtoAttempt = protoDebug.attempts[protoDebug.attempts.length - 1];
        const protoStatusCode = lastProtoAttempt?.status_code ?? protoDebug.protocolsIoStatus ?? 0;
        const protoErrorMsg = protoDebug.errors[0] ?? lastProtoAttempt?.error_message ?? null;

        const source_status = {
          literature: {
            label: usedFallback.literature ? "Curated fallback" : "Live Semantic Scholar",
            ok: !usedFallback.literature,
            coverage: usedFallback.literature ? "fallback" : "full",
            reason: usedFallback.literature
              ? `Fewer than 3 relevant papers after ${litDebug.attempts.length} query variant${litDebug.attempts.length === 1 ? "" : "s"}.`
              : `Returned ${papers.length} papers via Semantic Scholar.`,
          },
          protocols: {
            label: usedFallback.protocols ? "Curated fallback" : "Live protocols.io",
            ok: !usedFallback.protocols,
            coverage: usedFallback.protocols ? "partial" : "full",
            reason: usedFallback.protocols
              ? `protocols.io HTTP ${protoStatusCode || "—"}${protoErrorMsg ? ` · ${protoErrorMsg}` : ""}`
              : `${protocols.length} protocols from protocols.io.`,
          },
          materials: {
            label: matDebug.unmatchedCount > 0
              ? "Verified registry (partial)"
              : "Verified supplier registry",
            ok: matDebug.matchedCount > 0 && matDebug.unmatchedCount === 0,
            coverage:
              matDebug.matchedCount === 0
                ? "fallback"
                : matDebug.unmatchedCount > 0
                  ? "partial"
                  : "full",
            reason: `${matDebug.matchedCount} matched / ${matDebug.unmatchedCount} unverified (registry size ${matDebug.registrySize}).`,
          },
        };


        const debug = {
          orchestrator: { evidenceWeak, usedFallback },
          literature: litDebug,
          protocols: protoDebug,
          materials: matDebug,
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
          source_status,
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
