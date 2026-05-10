import type { Project } from "@/lib/mockData";

export type ScientistFeedbackSection =
  | "Protocol"
  | "Supplies"
  | "Budget"
  | "Timeline"
  | "Validation";

export const SCIENTIST_FEEDBACK_STORAGE_KEY = "h2p_scientist_feedback_v2";

export type ScientistFeedbackRecord = {
  id: string;
  experimentType: string;
  section: ScientistFeedbackSection;
  rating: number;
  originalSuggestion: string;
  correctedValue: string;
  reason: string;
  createdAt: string;
};

export type LlmFeedbackCorrection = {
  id: string;
  experiment_type: string;
  section: ScientistFeedbackSection;
  rating: number;
  original_suggestion: string;
  corrected_value: string;
  rationale: string;
  created_at: string;
};

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(/\s+/)
      .filter((t) => t.length >= 4),
  );
}

export function deriveExperimentType(
  project: Pick<Project, "title" | "hypothesis" | "domain" | "organism">,
): string {
  const organism = project.organism?.split(/[(,]/)[0]?.trim();
  const domain = project.domain?.split(/[/,]/)[0]?.trim();
  const haystack = `${project.title} ${project.hypothesis}`.toLowerCase();
  const techniqueMap: Array<[RegExp, string]> = [
    [/cryopreserv|cryoprotect|freezing medium|post-thaw/, "cryopreservation"],
    [/transfect/, "transfection"],
    [/crispr|knockout|knock-?in/, "CRISPR editing"],
    [/western blot/, "western blot"],
    [/flow cytometry|facs/, "flow cytometry"],
    [/rna-?seq|sequencing/, "sequencing"],
  ];
  const technique = techniqueMap.find(([re]) => re.test(haystack))?.[1];
  if (organism && technique) return `${organism} ${technique}`;
  if (organism && domain) return `${organism} · ${domain}`;
  return organism || domain || project.title;
}

export function loadScientistFeedback(): ScientistFeedbackRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SCIENTIST_FEEDBACK_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ScientistFeedbackRecord[]) : [];
  } catch {
    return [];
  }
}

export function persistScientistFeedback(list: ScientistFeedbackRecord[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SCIENTIST_FEEDBACK_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* best-effort */
  }
}

export function selectRelevantScientistFeedback(
  project: Pick<Project, "title" | "hypothesis" | "domain" | "organism">,
  limit = 6,
): ScientistFeedbackRecord[] {
  const all = loadScientistFeedback();
  const experimentType = deriveExperimentType(project);
  const targetTokens = tokenSet(
    `${experimentType} ${project.title} ${project.hypothesis} ${project.domain} ${project.organism}`,
  );

  return all
    .map((record) => {
      const exact = normalizeText(record.experimentType) === normalizeText(experimentType);
      const sourceTokens = tokenSet(
        `${record.experimentType} ${record.section} ${record.originalSuggestion} ${record.correctedValue} ${record.reason}`,
      );
      let overlap = 0;
      for (const token of sourceTokens) {
        if (targetTokens.has(token)) overlap += 1;
      }
      return { record, score: (exact ? 100 : 0) + overlap + record.rating / 10 };
    })
    .filter((row) => row.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((row) => row.record);
}

export function toLlmFeedbackCorrections(
  records: ScientistFeedbackRecord[],
): LlmFeedbackCorrection[] {
  return records.map((record) => ({
    id: record.id,
    experiment_type: record.experimentType,
    section: record.section,
    rating: record.rating,
    original_suggestion: record.originalSuggestion,
    corrected_value: record.correctedValue,
    rationale: record.reason,
    created_at: record.createdAt,
  }));
}
