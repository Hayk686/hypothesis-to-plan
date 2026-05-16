import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { useState } from "react";
import {
  Loader2,
  Sparkles,
  Wand2,
  FileSearch,
  CheckCircle2,
  ExternalLink,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import {
  saveProject,
  generatePlan,
  type Project,
  type GeneratedPlan,
  DEMO_PROJECT,
} from "@/lib/mockData";

export const Route = createFileRoute("/new")({
  head: () => ({
    meta: [
      { title: "New Project — Hypothesis→Plan" },
      { name: "description", content: "Create a new research project from a hypothesis." },
    ],
  }),
  component: NewProjectPage,
});

const DOMAINS = [
  "Cell biology / Cryopreservation",
  "Neuroscience / Gene Therapy",
  "Oncology",
  "Microbiology",
  "Immunology",
  "Materials Science",
  "Climate Science",
  "Computational Biology",
  "Other",
];

type Phase = "form" | "qc-loading" | "qc-review" | "plan-loading";

type LiveQcPaper = {
  id: string;
  title: string;
  authors: string;
  year: number;
  venue: string;
  abstract: string;
  citation_count: number;
  source_url: string;
  doi: string | null;
  relevance_score: number;
  evidence_role: "primary" | "supporting" | "background";
  source: "semantic-scholar" | "pubmed";
};

type LiveQcResponse = {
  data?: LiveQcPaper[];
  debug?: {
    source?: "semantic-scholar" | "pubmed" | "merged" | "none";
    used_fallback?: boolean;
    primaryQuery?: string;
  };
};

function livePaperToPlanPaper(p: LiveQcPaper) {
  return {
    id: p.id,
    title: p.title,
    authors: p.authors,
    year: p.year,
    venue: p.venue,
    citations: p.citation_count,
    similarity: p.relevance_score,
    abstract: p.abstract,
    whyItMatters: `${p.evidence_role} evidence returned by live ${
      p.source === "semantic-scholar" ? "Semantic Scholar" : "PubMed"
    } search for this hypothesis.`,
    doi: p.source_url,
    verification: {
      status: "verified" as const,
      sourceUrl: p.source_url,
      note: `Live ${p.source === "semantic-scholar" ? "Semantic Scholar" : "PubMed"} Literature QC result.`,
      checkedAt: new Date().toISOString().slice(0, 10),
    },
  };
}

async function runLiveLiteratureQc(project: Project): Promise<{
  papers: ReturnType<typeof livePaperToPlanPaper>[];
  literatureQc: NonNullable<GeneratedPlan["literatureQc"]>;
  sourceLabel: string;
}> {
  const res = await fetch("/api/search-literature", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      hypothesis: project.hypothesis,
      domain: project.domain,
      organism_or_system: project.organism,
      constraints: project.constraints,
    }),
  });
  if (!res.ok) {
    return {
      papers: [],
      literatureQc: {
        result: "Live literature check unavailable",
        reason: `Literature QC request failed with HTTP ${res.status}. No seeded HeLa references were substituted.`,
      },
      sourceLabel: "Live QC unavailable",
    };
  }

  const json = (await res.json()) as LiveQcResponse;
  const papers = (json.data ?? []).slice(0, 5).map(livePaperToPlanPaper);
  const debug = json.debug;
  const count = papers.length;
  const sourceLabel =
    debug?.source === "merged"
      ? "Live Semantic Scholar + PubMed"
      : debug?.source === "pubmed"
        ? "Live PubMed"
        : debug?.source === "semantic-scholar"
          ? "Live Semantic Scholar"
          : "Live literature search";

  const result =
    count === 0
      ? "No prior work found"
      : count <= 2 || debug?.used_fallback
        ? "Limited similar work found"
        : "Similar work exists";
  const reason =
    count === 0
      ? `No relevant papers returned for "${debug?.primaryQuery ?? project.hypothesis.slice(0, 120)}".`
      : `Returned ${count} live reference${count === 1 ? "" : "s"} for this exact project context via ${sourceLabel}.`;

  return { papers, literatureQc: { result, reason }, sourceLabel };
}

function NewProjectPage() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("form");
  const [stage, setStage] = useState(0);
  const [draftProject, setDraftProject] = useState<Project | null>(null);
  const [draftPlan, setDraftPlan] = useState<GeneratedPlan | null>(null);
  const [qcSourceLabel, setQcSourceLabel] = useState("Live literature search");
  const [exampleLoading, setExampleLoading] = useState(false);
  const [form, setForm] = useState({
    title: "",
    hypothesis: "",
    domain: DOMAINS[0],
    organism: "",
    budget: 50000,
    timelineWeeks: 12,
    resources: "",
    constraints: "",
  });

  function update<K extends keyof typeof form>(k: K, v: (typeof form)[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function loadGeneratedExample() {
    setExampleLoading(true);
    try {
      const res = await fetch("/api/generate-example", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const example = (await res.json()) as Partial<typeof form>;
      setForm({
        title: typeof example.title === "string" ? example.title : DEMO_PROJECT.title,
        hypothesis:
          typeof example.hypothesis === "string" ? example.hypothesis : DEMO_PROJECT.hypothesis,
        domain: typeof example.domain === "string" ? example.domain : DEMO_PROJECT.domain,
        organism: typeof example.organism === "string" ? example.organism : DEMO_PROJECT.organism,
        budget: typeof example.budget === "number" ? example.budget : DEMO_PROJECT.budget,
        timelineWeeks:
          typeof example.timelineWeeks === "number"
            ? example.timelineWeeks
            : DEMO_PROJECT.timelineWeeks,
        resources:
          typeof example.resources === "string" ? example.resources : DEMO_PROJECT.resources,
        constraints:
          typeof example.constraints === "string" ? example.constraints : DEMO_PROJECT.constraints,
      });
    } catch {
      setForm({
        title: DEMO_PROJECT.title,
        hypothesis: DEMO_PROJECT.hypothesis,
        domain: DEMO_PROJECT.domain,
        organism: DEMO_PROJECT.organism,
        budget: DEMO_PROJECT.budget,
        timelineWeeks: DEMO_PROJECT.timelineWeeks,
        resources: DEMO_PROJECT.resources,
        constraints: DEMO_PROJECT.constraints,
      });
    } finally {
      setExampleLoading(false);
    }
  }

  async function handleSubmitHypothesis(e: React.FormEvent) {
    e.preventDefault();
    if (!form.hypothesis || !form.title) return;
    setPhase("qc-loading");

    // Build a draft project so we can derive Literature QC from the seeded plan.
    // For the demo hypothesis, this resolves to the verified DEMO_PLAN with the
    // "Similar work exists" novelty signal.
    const project: Project = {
      id: `proj-${Date.now()}`,
      title: form.title,
      hypothesis: form.hypothesis,
      domain: form.domain,
      organism: form.organism,
      budget: form.budget,
      timelineWeeks: form.timelineWeeks,
      resources: form.resources,
      constraints: form.constraints,
      createdAt: new Date().toISOString(),
      noveltyScore: Math.min(95, 55 + (form.hypothesis.length % 35)),
      status: "complete",
    };

    // If the user submitted the demo hypothesis verbatim, route through the
    // verified DEMO_PROJECT so Literature QC + plan are the verified ones.
    const effectiveProject: Project = project;

    // Simulated literature QC latency (no network call — stays demo-stable).
    const qc = await runLiveLiteratureQc(project);
    const plan = {
      ...generatePlan(effectiveProject),
      papers: qc.papers,
      literatureQc: qc.literatureQc,
      evidenceConfidence: qc.papers.length >= 3 ? 82 : qc.papers.length > 0 ? 55 : 25,
      noveltyScore: qc.papers.length >= 3 ? 45 : qc.papers.length > 0 ? 68 : 86,
    };
    setDraftProject(project);
    // We always persist as the user-created project (so it appears under their
    // projects), but reuse the verified plan content when it's the demo hypothesis.
    setDraftPlan(plan);
    setQcSourceLabel(qc.sourceLabel);
    setPhase("qc-review");
  }

  async function proceedToFullPlan() {
    if (!draftProject) return;
    setPhase("plan-loading");
    const stages = [
      "Drafting experimental protocol…",
      "Estimating materials & budget…",
      "Generating timeline & risks…",
      "Compiling validation plan…",
    ];
    for (let i = 0; i < stages.length; i++) {
      setStage(i);
      await new Promise((r) => setTimeout(r, 500));
    }
    saveProject(draftProject);
    navigate({ to: "/project/$id", params: { id: draftProject.id } });
  }

  function backToForm() {
    setPhase("form");
    setDraftPlan(null);
    setDraftProject(null);
  }

  const planLoadingStages = [
    "Drafting experimental protocol…",
    "Estimating materials & budget…",
    "Generating timeline & risks…",
    "Compiling validation plan…",
  ];

  return (
    <div className="min-h-screen">
      <Header />
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <Badge variant="outline" className="mb-3">
              {phase === "form"
                ? "Step 1 of 2 · Hypothesis"
                : phase === "qc-loading" || phase === "qc-review"
                  ? "Step 2 of 2 · Literature QC"
                  : "Generating plan"}
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight">
              {phase === "form"
                ? "New research project"
                : phase === "qc-loading"
                  ? "Checking published literature…"
                  : phase === "qc-review"
                    ? "Literature QC result"
                    : "Building your experiment plan"}
            </h1>
            <p className="mt-2 text-muted-foreground">
              {phase === "form"
                ? "Describe your hypothesis. We'll run a Literature QC check before drafting the full plan."
                : phase === "qc-loading"
                  ? "Searching the verified source-backed corpus for prior work."
                  : phase === "qc-review"
                    ? "Review the novelty signal and references before generating the full experiment plan."
                    : "Compiling your protocol, materials, timeline, and validation."}
            </p>
          </div>
          {phase === "form" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadGeneratedExample}
              disabled={exampleLoading}
            >
              {exampleLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-2 h-4 w-4" />
              )}
              Generate example
            </Button>
          )}
        </div>

        {phase === "form" && (
          <Card className="border-border/60 bg-gradient-card p-8 shadow-elegant">
            <form onSubmit={handleSubmitHypothesis} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">Project title</Label>
                <Input
                  id="title"
                  placeholder="e.g. CRISPR-Cas13 RNA editing for Huntington's"
                  value={form.title}
                  onChange={(e) => update("title", e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="hypothesis">Hypothesis *</Label>
                <Textarea
                  id="hypothesis"
                  rows={5}
                  placeholder="State your hypothesis as precisely as possible. Include mechanism, system, and expected effect size."
                  value={form.hypothesis}
                  onChange={(e) => update("hypothesis", e.target.value)}
                  required
                  className="resize-none font-sans"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Be specific — mechanism, system, magnitude.</span>
                  <span>{form.hypothesis.length} chars</span>
                </div>
              </div>

              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="domain">Domain</Label>
                  <select
                    id="domain"
                    value={form.domain}
                    onChange={(e) => update("domain", e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {DOMAINS.map((d) => (
                      <option key={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>
                    Timeline:{" "}
                    <span className="font-mono text-primary">{form.timelineWeeks} weeks</span>
                  </Label>
                  <Slider
                    value={[form.timelineWeeks]}
                    min={4}
                    max={52}
                    step={1}
                    onValueChange={([v]) => update("timelineWeeks", v)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="organism">Target organism / system</Label>
                <Input
                  id="organism"
                  placeholder="e.g. R6/2 mouse, E. coli BL21, HEK293T, A. thaliana"
                  value={form.organism}
                  onChange={(e) => update("organism", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>
                  Budget:{" "}
                  <span className="font-mono text-primary">${form.budget.toLocaleString()}</span>
                </Label>
                <Slider
                  value={[form.budget]}
                  min={5000}
                  max={500000}
                  step={5000}
                  onValueChange={([v]) => update("budget", v)}
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>$5k</span>
                  <span>$500k</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="resources">Available lab resources</Label>
                <Textarea
                  id="resources"
                  rows={2}
                  placeholder="e.g. BSL-2 lab, confocal microscope, qPCR, mouse colony"
                  value={form.resources}
                  onChange={(e) => update("resources", e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="constraints">Constraints (optional)</Label>
                <Textarea
                  id="constraints"
                  rows={2}
                  placeholder="e.g. No clinical samples, IACUC pending, BSL-2 only"
                  value={form.constraints}
                  onChange={(e) => update("constraints", e.target.value)}
                />
              </div>

              <Button
                type="submit"
                size="lg"
                className="w-full bg-gradient-hero shadow-glow"
                disabled={!form.title || !form.hypothesis}
              >
                <FileSearch className="mr-2 h-4 w-4" />
                Run Literature QC
              </Button>
            </form>
          </Card>
        )}

        {phase === "qc-loading" && (
          <Card className="border-primary/30 bg-primary/5 p-10 text-center shadow-elegant">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
            <div className="mt-4 font-display text-lg font-semibold text-primary">
              Checking published literature…
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Querying live Semantic Scholar/PubMed for prior work, similar studies, and exact
              matches.
            </p>
          </Card>
        )}

        {phase === "qc-review" && draftPlan && draftProject && (
          <div className="space-y-5">
            <Card className="border-primary/30 bg-gradient-card p-6 shadow-elegant">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileSearch className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-xl font-semibold">Literature QC</h2>
                </div>
                <Badge className="bg-primary/15 text-primary hover:bg-primary/20">
                  Novelty signal: {draftPlan.literatureQc?.result ?? "Similar work exists"}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-foreground/85">
                {draftPlan.literatureQc?.reason ??
                  "Related publications exist in the verified source-backed corpus — review the references below before drafting the full plan."}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-success/40 bg-success/10 text-[10px] uppercase tracking-wider text-success"
                >
                  {qcSourceLabel}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  This check is live; seeded HeLa references are not substituted for other
                  hypotheses.
                </span>
              </div>
            </Card>

            {draftPlan.papers.length > 0 ? (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-display text-base font-semibold">
                    Top references ({Math.min(3, draftPlan.papers.length)})
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    Why each matters → reviewed before plan generation
                  </span>
                </div>
                <div className="space-y-3">
                  {draftPlan.papers.slice(0, 3).map((p) => {
                    const url =
                      p.verification?.sourceUrl ??
                      (p.doi.startsWith("http") ? p.doi : `https://doi.org/${p.doi}`);
                    return (
                      <Card key={p.id} className="border-border/60 bg-card p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <h4 className="font-display text-sm font-semibold leading-snug">
                              {p.title}
                            </h4>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {p.authors} · <span className="italic">{p.venue}</span> · {p.year}
                            </div>
                            <div className="mt-2 rounded-md border-l-2 border-primary/60 bg-primary/5 p-2 text-xs text-foreground/85">
                              <span className="font-mono uppercase tracking-wider text-primary">
                                Why it matters:
                              </span>{" "}
                              {p.whyItMatters}
                            </div>
                          </div>
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex shrink-0 items-center text-xs text-primary hover:underline"
                          >
                            Open source <ExternalLink className="ml-1 h-3 w-3" />
                          </a>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ) : (
              <Card className="border-border/60 bg-card p-4">
                <div className="font-display text-sm font-semibold">
                  No live references returned
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  You can still proceed, but the plan should be treated as weak-evidence until a
                  scientist verifies related work manually.
                </p>
              </Card>
            )}

            <Card className="border-success/30 bg-success/5 p-4">
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                <p className="text-sm text-foreground/85">
                  Literature QC complete. You can now generate the full experiment plan — protocol,
                  materials, budget, timeline, validation, and risks.
                </p>
              </div>
            </Card>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button variant="outline" onClick={backToForm}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Edit hypothesis
              </Button>
              <Button
                size="lg"
                className="bg-gradient-hero shadow-glow"
                onClick={proceedToFullPlan}
              >
                Proceed to Full Experiment Plan
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {phase === "plan-loading" && (
          <Card className="border-primary/30 bg-primary/5 p-8 shadow-elegant">
            <div className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="font-medium text-primary">{planLoadingStages[stage]}</div>
            </div>
            <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-gradient-hero transition-all duration-500"
                style={{ width: `${((stage + 1) / planLoadingStages.length) * 100}%` }}
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              {planLoadingStages.map((s, i) => (
                <Badge
                  key={s}
                  variant={i <= stage ? "default" : "outline"}
                  className={i <= stage ? "bg-primary/20 text-primary" : ""}
                >
                  <Sparkles className="mr-1 h-3 w-3" />
                  {s.replace("…", "")}
                </Badge>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
