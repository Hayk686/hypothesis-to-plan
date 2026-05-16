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
import {
  runLlmOrchestrator,
  type LlmDebug,
  type LlmPlan,
  type LlmProjectInput,
} from "@/lib/llm.server";
import { buildAgentProfile, type AgentProfile } from "@/lib/agentProfile.server";
import type { LlmFeedbackCorrection, ScientistFeedbackSection } from "@/lib/scientistFeedback";

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
  experiment_type?: string;
  scientist_feedback?: unknown;
};

const FEEDBACK_SECTIONS: ScientistFeedbackSection[] = [
  "Protocol",
  "Supplies",
  "Budget",
  "Timeline",
  "Validation",
];

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

function literatureSourceLabel(source: LiteratureDebug["source"]): string {
  if (source === "merged") return "Live scholarly indexes";
  if (source === "semantic-scholar") return "Live Semantic Scholar";
  if (source === "openalex") return "Live OpenAlex";
  if (source === "crossref") return "Live Crossref";
  if (source === "pubmed") return "Live PubMed";
  return "Live literature search";
}

function normalizeScientistFeedback(v: unknown): LlmFeedbackCorrection[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((row, idx): LlmFeedbackCorrection | null => {
      if (!row || typeof row !== "object") return null;
      const r = row as Record<string, unknown>;
      const section = typeof r.section === "string" ? r.section : "";
      if (!FEEDBACK_SECTIONS.includes(section as ScientistFeedbackSection)) return null;
      const correctedValue = safeStr(r.corrected_value ?? r.correctedValue);
      const rationale = safeStr(r.rationale ?? r.reason);
      if (!correctedValue && !rationale) return null;
      return {
        id: safeStr(r.id, `feedback-${idx + 1}`),
        experiment_type: safeStr(r.experiment_type ?? r.experimentType, "similar experiment"),
        section: section as ScientistFeedbackSection,
        rating: Math.max(1, Math.min(5, safeNum(r.rating, 4))),
        original_suggestion: safeStr(r.original_suggestion ?? r.originalSuggestion),
        corrected_value: correctedValue,
        rationale,
        created_at: safeStr(r.created_at ?? r.createdAt, new Date().toISOString()),
      };
    })
    .filter((row): row is LlmFeedbackCorrection => row !== null)
    .slice(0, 6);
}

function buildTimeline(weeks: number, profile: AgentProfile) {
  const target = Math.max(4, Math.min(16, Math.round(weeks)));
  const phases = [
    {
      phase: "Planning",
      milestone: "Project locked",
      tasks: [
        "Pre-register hypothesis and primary endpoint",
        "Place reagent orders",
        "Confirm equipment availability",
      ],
      deliverable: "Pre-registration + reagent orders",
    },
    {
      phase: "Cell prep",
      milestone: "Cells expanded",
      tasks: ["Thaw working stock", "Expand to target confluence", "Mycoplasma test"],
      deliverable: "Healthy cell stock",
    },
    {
      phase: "Intervention",
      milestone: "Treatment applied",
      tasks: [
        "Prepare media / treatment arms",
        "Apply intervention",
        "Capture intermediate readouts",
      ],
      deliverable: "Treated samples ready for measurement",
    },
    {
      phase: "Storage / hold",
      milestone: "Hold complete",
      tasks: ["Maintain hold conditions", "Pre-warm media", "Blind sample labels"],
      deliverable: "Hold complete, counter blinded",
    },
    {
      phase: "Measurement",
      milestone: "Primary readout",
      tasks: ["Collect primary readout", "Collect secondary readouts", "Photograph plates"],
      deliverable: "Raw data for primary endpoint",
    },
    {
      phase: "Analysis",
      milestone: "Report drafted",
      tasks: [
        "Compute summary statistics",
        "Test pre-registered threshold",
        "Write methods + results",
      ],
      deliverable: "Locked report + figures",
    },
  ];
  return Array.from({ length: target }, (_, i) => {
    const activePhases = profile.timelinePhases.length ? profile.timelinePhases : phases;
    const src =
      activePhases[
        Math.min(activePhases.length - 1, Math.floor((i / target) * activePhases.length))
      ];
    return { week: i + 1, ...src };
  });
}

function defaultRisks(profile: AgentProfile) {
  return [
    ...profile.risks,
    {
      id: "r1",
      title: "Effect size smaller than expected",
      category: "scientific",
      likelihood: "medium",
      impact: "medium",
      mitigation:
        "Pre-register the threshold and the analysis; pre-power n with conservative assumptions.",
    },
    {
      id: "r2",
      title: "Operator / counter bias",
      category: "scientific",
      likelihood: "medium",
      impact: "medium",
      mitigation: "Blind labels; have a second operator re-count a random subset (≥25%).",
    },
    {
      id: "r3",
      title: "Critical resource is unavailable on schedule",
      category: "operational",
      likelihood: "low",
      impact: "medium",
      mitigation:
        "Confirm access in week 1 and identify an alternate vendor, dataset, instrument, or compute path.",
    },
    {
      id: "r4",
      title: "Budget overrun on required resources",
      category: "budget",
      likelihood: "medium",
      impact: "low",
      mitigation:
        "Confirm current prices and prioritize controls or benchmark runs before optional scope.",
    },
  ].slice(0, 5);
}

function fallbackValidationPlan(profile: AgentProfile) {
  const v = profile.validation;
  return {
    primary_metric: {
      name: v.primaryMetricName,
      target: v.primaryMetricTarget,
      method: v.primaryMetricMethod,
    },
    secondary_metrics: v.secondaryMetrics.map((m) => ({
      name: m.name,
      target: m.target,
      method: m.method,
    })),
    statistical_approach: v.statisticalApproach,
    reproducibility_checks: v.reproducibilityChecks,
    positive_control: v.positiveControl,
    negative_control: v.negativeControl,
  };
}

function adaptValidationPlanToProfile(
  plan: ReturnType<typeof fallbackValidationPlan>,
  profile: AgentProfile,
) {
  const fallback = fallbackValidationPlan(profile);
  const primaryName = plan.primary_metric.name.toLowerCase();
  const primaryMethod = plan.primary_metric.method.toLowerCase();
  const positive = plan.positive_control.toLowerCase();
  const negative = plan.negative_control.toLowerCase();
  const genericPrimary =
    /^(primary endpoint|primary metric|pre-registered primary endpoint)$/.test(primaryName) ||
    (profile.kind !== "life_science" && /biological|assay|endpoint/.test(primaryName));
  const wetLabMethod =
    profile.kind !== "life_science" && /assay|cell|culture|sample viability/.test(primaryMethod);
  const wetLabControls =
    profile.kind !== "life_science" &&
    /vehicle|untreated|non-perturbed|same batch/.test(`${positive} ${negative}`);

  return {
    ...plan,
    primary_metric:
      genericPrimary || wetLabMethod
        ? fallback.primary_metric
        : {
            ...plan.primary_metric,
            method: wetLabMethod ? fallback.primary_metric.method : plan.primary_metric.method,
          },
    secondary_metrics:
      plan.secondary_metrics.length > 0 ? plan.secondary_metrics : fallback.secondary_metrics,
    statistical_approach: plan.statistical_approach || fallback.statistical_approach,
    reproducibility_checks:
      plan.reproducibility_checks.length > 0
        ? plan.reproducibility_checks
        : fallback.reproducibility_checks,
    positive_control: wetLabControls ? fallback.positive_control : plan.positive_control,
    negative_control: wetLabControls ? fallback.negative_control : plan.negative_control,
  };
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
        const scientistFeedback = normalizeScientistFeedback(project.scientist_feedback);
        const experimentType = safeStr(project.experiment_type, `${organism || domain}`);
        const agentProfile = buildAgentProfile({
          hypothesis,
          domain,
          organism_or_system: organism,
          constraints,
          method_keywords: project.method_keywords,
        });

        const project_summary = {
          title: safeStr(project.title, "Untitled experiment"),
          hypothesis,
          domain,
          organism_or_system: organism,
          budget_cap: budget,
          timeline_weeks: weeks,
          constraints,
          source:
            project.id === "demo-trehalose-hela-001" ? "Seeded verified demo" : "Live generation",
        };

        const llmProject: LlmProjectInput = project_summary;

        // Run source discovery in parallel — IN-PROCESS. The LLM orchestrator
        // consumes these source-backed results in the next step.
        const [lit, proto] = await Promise.all([
          runLiteratureSearch({ hypothesis, domain, organism_or_system: organism, constraints }),
          runProtocolsSearch({
            hypothesis,
            domain,
            organism_or_system: organism,
            constraints,
            method_keywords: project.method_keywords,
          }),
        ]);

        const papers: NormalizedPaper[] = lit.data;
        const protocols: NormalizedProtocol[] = proto.data;
        const llm = await runLlmOrchestrator({
          project: llmProject,
          papers,
          protocols,
          feedback: scientistFeedback,
        });
        const llmPlan: LlmPlan | null = llm.plan;
        const llmDebug: LlmDebug = llm.debug;

        const llmRequiredMaterials = llmPlan?.experimental_strategy.required_materials ?? [];
        const explicitRequiredMaterials = Array.isArray(project.required_materials)
          ? project.required_materials.filter((m): m is string => typeof m === "string")
          : [];
        const required_materials =
          explicitRequiredMaterials.length > 0
            ? explicitRequiredMaterials
            : llmRequiredMaterials.length > 0
              ? llmRequiredMaterials
              : agentProfile.defaultMaterials;
        const mat = await runMaterialsResolver({
          organism_or_system: organism,
          assay_type: domain,
          domain,
          constraints,
          required_materials,
          protocol_steps: protocols.map((p) => ({
            description: `${p.title}. ${p.description}`,
            equipment: llmPlan?.experimental_strategy.required_materials ?? [],
          })),
        });
        const materials: NormalizedMaterial[] = mat.data;

        const litDebug: LiteratureDebug = lit.debug;
        const protoDebug: ProtocolDebug = proto.debug;
        const matDebug: ResolveDebug = mat.debug;

        const evidenceWeak = papers.length < 2;
        const usedFallback = {
          literature: litDebug.used_fallback || papers.length === 0,
          protocols: protoDebug.used_fallback,
          materials: matDebug.used_fallback,
          llm: llmDebug.used_fallback,
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
            source: m.source,
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
        const literatureScore =
          litLive && papers.length >= 3
            ? 25
            : papers.length >= 2
              ? 18
              : papers.length >= 1
                ? 10
                : 0;

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
              const hasSpecificUrl = agentProfile.supplierUrlPattern.test(url);
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
              ? "No relevant papers returned by Semantic Scholar, OpenAlex, Crossref, or PubMed after broader query variants."
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

        const fallback_validation_plan = fallbackValidationPlan(agentProfile);
        const validation_plan = adaptValidationPlanToProfile(
          llmPlan?.validation_plan ?? fallback_validation_plan,
          agentProfile,
        );

        const fallback_scientist_review_questions = agentProfile.reviewQuestions;
        let scientist_review_questions = llmPlan?.scientist_review_questions.length
          ? llmPlan.scientist_review_questions
          : fallback_scientist_review_questions;

        const timeline = llmPlan?.timeline.length
          ? llmPlan.timeline
          : buildTimeline(weeks, agentProfile);
        if (scientistFeedback.length > 0) {
          const feedbackQuestions = scientistFeedback.map(
            (f) => `Prior scientist correction (${f.section}): ${f.corrected_value}`,
          );
          scientist_review_questions = [...feedbackQuestions, ...scientist_review_questions].slice(
            0,
            10,
          );

          for (const f of scientistFeedback) {
            if (f.section === "Validation") {
              validation_plan.secondary_metrics.unshift({
                name: "Scientist-corrected validation readout",
                target: f.corrected_value,
                method: f.rationale || "Apply prior expert correction for similar experiments.",
              });
              validation_plan.reproducibility_checks.unshift(
                `Apply prior scientist validation correction: ${f.corrected_value}`,
              );
            }
            if ((f.section === "Protocol" || f.section === "Timeline") && timeline[0]) {
              timeline[0].tasks = [
                `Apply prior scientist ${f.section.toLowerCase()} correction: ${f.corrected_value}`,
                ...timeline[0].tasks,
              ].slice(0, 6);
            }
          }
        }
        const risks = llmPlan?.risks.length ? llmPlan.risks : defaultRisks(agentProfile);
        const judge_presentation_view = {
          headline: llmPlan?.judge_presentation_view.headline ?? project_summary.title,
          one_line_pitch:
            llmPlan?.judge_presentation_view.one_line_pitch ??
            (hypothesis.length > 220 ? `${hypothesis.slice(0, 217)}…` : hypothesis),
          evidence_strength:
            llmPlan?.judge_presentation_view.evidence_strength ??
            (evidenceWeak ? "weak" : "adequate"),
          protocol_strategy:
            llmPlan?.judge_presentation_view.protocol_strategy ??
            "Adapt matched protocols under scientist review.",
          key_evidence: papers.slice(0, 3).map((p) => ({
            title: p.title,
            year: p.year,
            source_url: p.source_url,
            role: p.evidence_role,
          })),
          primary_protocol: protocols[0]
            ? { title: protocols[0].title, url: protocols[0].url, source: protocols[0].source }
            : null,
          lab_readiness_score,
          materials_within_budget: materials_budget.within_budget,
        };

        // ----- Per-source status (for the UI panel) -----
        const lastProtoAttempt = protoDebug.attempts[protoDebug.attempts.length - 1];
        const protoStatusCode = lastProtoAttempt?.status_code ?? protoDebug.protocolsIoStatus ?? 0;
        const protoErrorMsg = protoDebug.errors[0] ?? lastProtoAttempt?.error_message ?? null;

        const source_status = {
          literature: {
            label: usedFallback.literature
              ? "Curated fallback"
              : literatureSourceLabel(litDebug.source),
            ok: !usedFallback.literature,
            coverage: usedFallback.literature ? "fallback" : "full",
            reason: usedFallback.literature
              ? `Fewer than 3 relevant papers after ${litDebug.attempts.length} query variant${litDebug.attempts.length === 1 ? "" : "s"}.`
              : `Returned ${papers.length} papers via ${literatureSourceLabel(litDebug.source)}.`,
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
            label:
              matDebug.unmatchedCount > 0
                ? matDebug.mouserMatchedCount > 0 || matDebug.pubchemMatchedCount > 0
                  ? "Supplier APIs (partial)"
                  : "Verified registry (partial)"
                : matDebug.mouserMatchedCount > 0
                  ? "Live Mouser supplier data"
                  : "Verified supplier registry",
            ok: matDebug.matchedCount > 0 && matDebug.unmatchedCount === 0,
            coverage:
              matDebug.matchedCount === 0
                ? "fallback"
                : matDebug.unmatchedCount > 0
                  ? "partial"
                  : "full",
            reason: `${matDebug.matchedCount} supplier-verified / ${matDebug.unmatchedCount} requiring vendor SKU; Mouser ${matDebug.mouserMatchedCount}, PubChem identity ${matDebug.pubchemMatchedCount}.`,
          },
          llm: {
            label: llmDebug.used_fallback
              ? "Deterministic fallback"
              : `${llmDebug.provider}: ${llmDebug.model}`,
            ok: !llmDebug.used_fallback,
            coverage: llmDebug.used_fallback ? "fallback" : "full",
            reason: llmDebug.used_fallback
              ? (llmDebug.error ?? "LLM provider unavailable.")
              : "Structured plan generated by the configured LLM provider.",
          },
        };

        const debug = {
          orchestrator: { evidenceWeak, usedFallback, agentProfile: agentProfile.kind },
          literature: litDebug,
          protocols: protoDebug,
          materials: matDebug,
          llm: llmDebug,
          feedback: { experimentType, appliedCount: scientistFeedback.length },
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
          timeline,
          validation_plan,
          risks,
          scientist_review_questions,
          judge_presentation_view,
          feedback_context: {
            experiment_type: experimentType,
            applied_count: scientistFeedback.length,
            corrections: scientistFeedback,
          },
          source_status,
          warnings: {
            evidence_weak: evidenceWeak,
            uses_fallback_literature: usedFallback.literature,
            uses_fallback_protocols: usedFallback.protocols,
            has_unverified_materials: usedFallback.materials,
            uses_fallback_llm: usedFallback.llm,
          },
          debug,
        });
      },
    },
  },
});
