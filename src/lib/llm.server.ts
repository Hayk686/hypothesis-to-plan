import type { NormalizedPaper } from "@/lib/literature.server";
import type { NormalizedProtocol } from "@/lib/protocols.server";
import type { LlmFeedbackCorrection } from "@/lib/scientistFeedback";
import { buildAgentProfile, type AgentProfile } from "@/lib/agentProfile.server";
import { buildLlmChain, getEnvConfig, type LlmConfig } from "@/lib/env.server";

export type LlmProvider = "openrouter" | "nvidia" | "none";

export type LlmProjectInput = {
  title: string;
  hypothesis: string;
  domain: string;
  organism_or_system: string;
  budget_cap: number;
  timeline_weeks: number;
  constraints: string;
};

export type LlmTimelineWeek = {
  week: number;
  phase: string;
  milestone: string;
  tasks: string[];
  deliverable: string;
};

export type LlmValidationPlan = {
  primary_metric: { name: string; target: string; method: string };
  secondary_metrics: { name: string; target: string; method: string }[];
  statistical_approach: string;
  reproducibility_checks: string[];
  positive_control: string;
  negative_control: string;
};

export type LlmRisk = {
  id: string;
  title: string;
  category: string;
  likelihood: string;
  impact: string;
  mitigation: string;
};

export type LlmPlan = {
  project_title: string;
  problem_statement: string;
  novelty_assessment: {
    verdict: string;
    rationale: string;
    gaps: string[];
  };
  experimental_strategy: {
    overview: string;
    protocol_adaptations: string[];
    method_keywords: string[];
    required_materials: string[];
  };
  timeline: LlmTimelineWeek[];
  validation_plan: LlmValidationPlan;
  risks: LlmRisk[];
  scientist_review_questions: string[];
  judge_presentation_view: {
    headline: string;
    one_line_pitch: string;
    evidence_strength: string;
    protocol_strategy: string;
  };
};

export type LlmDebug = {
  provider: LlmProvider;
  model: string | null;
  endpoint: string | null;
  status: number;
  ok: boolean;
  used_fallback: boolean;
  error: string | null;
  raw_chars: number;
};

export type LlmResult = {
  plan: LlmPlan | null;
  debug: LlmDebug;
};

type ChatMessage = { role: "system" | "user"; content: string };
type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

// Removed env logic to env.server.ts
function buildPrompt(
  project: LlmProjectInput,
  papers: NormalizedPaper[],
  protocols: NormalizedProtocol[],
  feedback: LlmFeedbackCorrection[] = [],
  agentProfile: AgentProfile = buildAgentProfile(project),
) {
  const paperContext = papers.slice(0, 8).map((p) => ({
    title: p.title,
    year: p.year,
    venue: p.venue,
    source: p.source,
    role: p.evidence_role,
    relevance_score: p.relevance_score,
    abstract: p.abstract.slice(0, 700),
    url: p.source_url,
  }));
  const protocolContext = protocols.slice(0, 6).map((p) => ({
    title: p.title,
    source: p.source,
    relevance_score: p.relevance_score,
    description: p.description.slice(0, 700),
    url: p.url,
    matched_keywords: p.matched_keywords,
  }));

  return JSON.stringify(
    {
      task: "Create a source-grounded experimental plan. Use the literature and protocols below. Do not invent citations or claims not supported by the sources. For required_materials, you MUST use exact, specific chemical or component names (e.g. 'Graphene', 'Lithium iron phosphate', 'DHT22 sensor', 'FBS'). DO NOT use generic descriptive phrases (e.g. 'Graphene precursor', 'electrode material', 'control system'). Return only valid JSON matching the requested shape.",
      project,
      agent_profile: {
        domain_kind: agentProfile.kind,
        label: agentProfile.label,
        planning_rule:
          "Adapt the plan to this domain. For non-wet-lab work, use compute, datasets, instruments, field sampling, prototypes, or domain resources instead of biological reagents.",
        default_material_or_resource_hints: agentProfile.defaultMaterials,
        validation_defaults: agentProfile.validation,
        risk_templates: agentProfile.risks,
      },
      literature: paperContext,
      protocols: protocolContext,
      expert_feedback_memory: feedback.slice(0, 6),
      feedback_instructions:
        feedback.length > 0
          ? "Apply relevant prior scientist corrections to this plan. Treat corrected_value and rationale as expert guidance for similar experiment types. Do not copy irrelevant feedback blindly; adapt it when it conflicts with the supplied literature or protocols."
          : "No prior scientist corrections were supplied for this experiment type.",
      required_json_shape: {
        project_title: "string",
        problem_statement: "string",
        novelty_assessment: {
          verdict: "string",
          rationale: "string",
          gaps: ["string"],
        },
        experimental_strategy: {
          overview: "string",
          protocol_adaptations: ["string"],
          method_keywords: ["string"],
          required_materials: ["short item name"],
        },
        timeline: [
          {
            week: 1,
            phase: "string",
            milestone: "string",
            tasks: ["string"],
            deliverable: "string",
          },
        ],
        validation_plan: {
          primary_metric: { name: "string", target: "string", method: "string" },
          secondary_metrics: [{ name: "string", target: "string", method: "string" }],
          statistical_approach: "string",
          reproducibility_checks: ["string"],
          positive_control: "string",
          negative_control: "string",
        },
        risks: [
          {
            id: "r1",
            title: "string",
            category: "scientific|operational|budget|ethical/safety",
            likelihood: "low|medium|high",
            impact: "low|medium|high",
            mitigation: "string",
          },
        ],
        scientist_review_questions: ["string"],
        judge_presentation_view: {
          headline: "string",
          one_line_pitch: "string",
          evidence_strength: "string",
          protocol_strategy: "string",
        },
      },
    },
    null,
    2,
  );
}

function systemPrompt() {
  return [
    "You are a careful universal research co-scientist and experimental design orchestrator.",
    "You adapt across life science, materials science, computational, environmental, engineering, and general research projects.",
    "You must be conservative, source-grounded, and explicit about uncertainty.",
    "Do not force wet-lab assumptions into computational, field, materials, or engineering work.",
    "When prior scientist feedback is supplied, use it as high-priority expert context for similar experiment types.",
    "You may propose practical experimental steps, but you must not provide clinical, diagnostic, or human-subject instructions.",
    "Return only JSON. No Markdown. No prose outside JSON.",
  ].join(" ");
}

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1));
    }
    throw new Error("LLM response did not contain JSON.");
  }
}

function asStringArray(v: unknown): string[] {
  if (typeof v === "string") {
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function normalizePlan(raw: unknown, project: LlmProjectInput): LlmPlan {
  if (!raw || typeof raw !== "object") throw new Error("LLM JSON root must be an object.");
  const obj = raw as Record<string, unknown>;
  const novelty = (obj.novelty_assessment ?? {}) as Record<string, unknown>;
  const strategy = (obj.experimental_strategy ?? {}) as Record<string, unknown>;
  const validation = (obj.validation_plan ?? {}) as Record<string, unknown>;
  const primaryVal = validation.primary_metric;
  const primary = (typeof primaryVal === "object" && primaryVal ? primaryVal : {}) as Record<string, unknown>;
  const judge = (obj.judge_presentation_view ?? {}) as Record<string, unknown>;

  const timeline = Array.isArray(obj.timeline)
    ? obj.timeline.map((row, idx): LlmTimelineWeek => {
        const r = (row ?? {}) as Record<string, unknown>;
        return {
          week: typeof r.week === "number" ? r.week : idx + 1,
          phase: typeof r.phase === "string" ? r.phase : "Execution",
          milestone: typeof r.milestone === "string" ? r.milestone : "Milestone",
          tasks: asStringArray(r.tasks ?? r.task).slice(0, 6),
          deliverable: typeof r.deliverable === "string" ? r.deliverable : "Deliverable",
        };
      })
    : [];

  const risks = Array.isArray(obj.risks)
    ? obj.risks.map((row, idx): LlmRisk => {
        const r = (row ?? {}) as Record<string, unknown>;
        return {
          id: typeof r.id === "string" ? r.id : `r${idx + 1}`,
          title: typeof r.title === "string" ? r.title : "Unspecified risk",
          category: typeof r.category === "string" ? r.category : "scientific",
          likelihood: typeof r.likelihood === "string" ? r.likelihood : "medium",
          impact: typeof r.impact === "string" ? r.impact : "medium",
          mitigation:
            typeof r.mitigation === "string" ? r.mitigation : "Review with domain expert.",
        };
      })
    : [];

  const secondaryMetrics = Array.isArray(validation.secondary_metrics)
    ? validation.secondary_metrics.map((row) => {
        if (typeof row === "string") {
          return {
            name: row,
            target: "Defined before execution",
            method: "Appropriate assay",
          };
        }
        const r = (row ?? {}) as Record<string, unknown>;
        return {
          name: typeof r.name === "string" ? r.name : "Secondary metric",
          target: typeof r.target === "string" ? r.target : "Defined before execution",
          method: typeof r.method === "string" ? r.method : "Appropriate assay",
        };
      })
    : [];

  const primaryMetric =
    typeof primaryVal === "string"
      ? { name: primaryVal, target: "Pre-registered threshold", method: "Direct measurement" }
      : {
          name: typeof primary.name === "string" ? primary.name : "Primary endpoint",
          target: typeof primary.target === "string" ? primary.target : "Pre-registered threshold",
          method: typeof primary.method === "string" ? primary.method : "Direct measurement",
        };

  return {
    project_title: typeof obj.project_title === "string" ? obj.project_title : project.title,
    problem_statement:
      typeof obj.problem_statement === "string"
        ? obj.problem_statement
        : `Test the hypothesis in ${project.domain}.`,
    novelty_assessment: {
      verdict: typeof novelty.verdict === "string" ? novelty.verdict : "Requires review",
      rationale:
        typeof novelty.rationale === "string"
          ? novelty.rationale
          : "Assess novelty against the returned literature before execution.",
      gaps: asStringArray(novelty.gaps),
    },
    experimental_strategy: {
      overview:
        typeof strategy.overview === "string"
          ? strategy.overview
          : "Use the matched protocols as a starting point and adapt to the target system.",
      protocol_adaptations: asStringArray(strategy.protocol_adaptations),
      method_keywords: asStringArray(strategy.method_keywords),
      required_materials: asStringArray(strategy.required_materials),
    },
    timeline,
    validation_plan: {
      primary_metric: primaryMetric,
      secondary_metrics: secondaryMetrics,
      statistical_approach:
        typeof validation.statistical_approach === "string"
          ? validation.statistical_approach
          : "Pre-register the analysis and report effect size with confidence intervals.",
      reproducibility_checks: asStringArray(validation.reproducibility_checks),
      positive_control:
        typeof validation.positive_control === "string"
          ? validation.positive_control
          : "Positive control from the same system.",
      negative_control:
        typeof validation.negative_control === "string"
          ? validation.negative_control
          : "Vehicle-only or assay-floor condition.",
    },
    risks,
    scientist_review_questions: asStringArray(obj.scientist_review_questions),
    judge_presentation_view: {
      headline: typeof judge.headline === "string" ? judge.headline : project.title,
      one_line_pitch:
        typeof judge.one_line_pitch === "string" ? judge.one_line_pitch : project.hypothesis,
      evidence_strength:
        typeof judge.evidence_strength === "string" ? judge.evidence_strength : "needs review",
      protocol_strategy:
        typeof judge.protocol_strategy === "string"
          ? judge.protocol_strategy
          : "Adapt matched protocols under scientist review.",
    },
  };
}

function validatePlanSchema(plan: LlmPlan) {
  if (plan.timeline.length === 0) {
    throw new Error("schema validation failed: timeline is empty");
  }
  if (!plan.project_title || plan.project_title.trim().length === 0) {
    throw new Error("schema validation failed: project_title is missing");
  }
  // Check for contamination in required_materials
  const contaminated = plan.experimental_strategy.required_materials.some(
    (m) => m.length > 100 || /steps preview|protocol|incubate|centrifuge/i.test(m)
  );
  if (contaminated) {
    throw new Error("materials field contaminated with protocol text");
  }
}

async function callChatCompletion({
  endpoint,
  apiKey,
  model,
  provider,
  messages,
}: {
  endpoint: string;
  apiKey: string;
  model: string;
  provider: "openrouter" | "nvidia";
  messages: ChatMessage[];
}) {
  const env = getEnvConfig();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (provider === "openrouter") {
    headers["HTTP-Referer"] = env.OPENROUTER_SITE_URL;
    headers["X-Title"] = env.OPENROUTER_APP_TITLE;
  }

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1,
        top_p: 0.9,
        max_tokens: 3500,
        response_format: { type: "json_object" },
      }),
    });
    const status = res.status;
    const json = (await res.json().catch(() => ({}))) as ChatCompletionResponse & {
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(json.error?.message ?? `LLM HTTP ${status}`);
    }
    const content = json.choices?.[0]?.message?.content;
    if (!content) throw new Error("LLM returned an empty message.");
    return { status, content };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error("LLM request was aborted");
    }
    throw err;
  }
}

export async function runLlmOrchestrator({
  project,
  papers,
  protocols,
  feedback = [],
}: {
  project: LlmProjectInput;
  papers: NormalizedPaper[];
  protocols: NormalizedProtocol[];
  feedback?: LlmFeedbackCorrection[];
}): Promise<LlmResult> {
  const env = getEnvConfig();
  const chain = buildLlmChain();
  const agentProfile = buildAgentProfile(project);

  if (chain.length === 0) {
    return {
      plan: null,
      debug: {
        provider: "none",
        model: null,
        endpoint: null,
        status: 0,
        ok: false,
        used_fallback: true,
        error: "No LLM key configured. Set OPENROUTER_API_KEY or NVIDIA_API_KEY / NVIDIA_NIM_API_KEY.",
        raw_chars: 0,
      },
    };
  }

  let lastError = "";

  for (const config of chain) {
    try {
      const { status, content } = await callChatCompletion({
        endpoint: config.endpoint,
        apiKey: config.apiKey,
        model: config.model,
        provider: config.provider,
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: buildPrompt(project, papers, protocols, feedback, agentProfile) },
        ],
      });

      try {
        const raw = extractJson(content);
        const plan = normalizePlan(raw, project);
        validatePlanSchema(plan);
        return {
          plan,
          debug: {
            provider: config.provider,
            model: config.model,
            endpoint: config.endpoint,
            status,
            ok: true,
            used_fallback: false,
            error: null,
            raw_chars: content.length,
          },
        };
      } catch (parseError: any) {
        // Repair attempt
        const maxRepairs = env.LLM_JSON_REPAIR_ATTEMPTS;
        let currentError = parseError.message;
        let lastContent = content;

        for (let attempt = 1; attempt <= maxRepairs; attempt++) {
          try {
            console.warn(`[LLM] JSON parse/schema failed on ${config.model} (Attempt ${attempt}/${maxRepairs}). Attempting repair...`);
            const { status: repairStatus, content: repairedContent } = await callChatCompletion({
              endpoint: config.endpoint,
              apiKey: config.apiKey,
              model: config.model,
              provider: config.provider,
              messages: [
                {
                  role: "system",
                  content:
                    "You are an expert JSON repair tool. You will be given a malformed JSON string. You must return ONLY the repaired, valid JSON without any prose, markdown formatting, or explanations.",
                },
                {
                  role: "user",
                  content: `Please repair this invalid JSON:\n\n${lastContent}\n\nError: ${currentError}`,
                },
              ],
            });
            const raw = extractJson(repairedContent);
            const plan = normalizePlan(raw, project);
            validatePlanSchema(plan);
            return {
              plan,
              debug: {
                provider: config.provider,
                model: config.model,
                endpoint: config.endpoint,
                status: repairStatus,
                ok: true,
                used_fallback: false,
                error: `JSON repaired after parse/schema failure on attempt ${attempt}`,
                raw_chars: repairedContent.length,
              },
            };
          } catch (repairError: any) {
            currentError = repairError.message;
            lastError = `Repair attempt ${attempt} failed on ${config.model}: ${currentError}`;
            console.warn(`[LLM] Repair attempt ${attempt} failed on ${config.model}. Error: ${currentError}`);
          }
        }
        continue; // Try next model in chain if all repairs fail
      }
    } catch (httpError: any) {
      lastError = `API Error on ${config.model}: ${httpError.message}`;
      console.warn(`[LLM] Error on ${config.model}: ${httpError.message}`);
      continue; // Try next model in chain
    }
  }

  return {
    plan: null,
    debug: {
      provider: chain[0].provider,
      model: chain[0].model,
      endpoint: chain[0].endpoint,
      status: 0,
      ok: false,
      used_fallback: true,
      error: `All models in chain failed. Last error: ${lastError}`,
      raw_chars: 0,
    },
  };
}
