import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft,
  ExternalLink,
  Sparkles,
  FileSearch,
  Beaker,
  ShoppingCart,
  Calendar,
  CheckCircle2,
  ShieldAlert,
  Download,
  Quote,
  Presentation,
  Lightbulb,
  AlertCircle,
  Target,
  Copy,
  Check,
  MessagesSquare,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getProject,
  generatePlan,
  CATALOG_VERIFY_REQUIRED,
  type Project,
  type GeneratedPlan,
  type Paper,
} from "@/lib/mockData";
import {
  searchLiterature,
  type DataSource,
  type LiteratureDebug,
  type LivePlanResponse,
} from "@/lib/services";
import { VerificationBadge } from "@/components/VerificationBadge";
import { TechStackPanel } from "@/components/TechStackPanel";
import { LabReadinessCard } from "@/components/LabReadinessCard";
import { ScientistFeedbackPanel } from "@/components/ScientistFeedbackPanel";
import { LivePipelinePanel, SourceBadge } from "@/components/LivePipelinePanel";
import { computeLabReadiness } from "@/lib/labReadiness";

function literatureSourceLabel(source?: string): string {
  if (source === "semantic-scholar") return "Semantic Scholar";
  if (source === "openalex") return "OpenAlex";
  if (source === "crossref") return "Crossref";
  if (source === "pubmed") return "PubMed";
  if (source === "merged") return "scholarly indexes";
  return "literature search";
}

export const Route = createFileRoute("/project/$id")({
  head: () => ({
    meta: [
      { title: `Project — Hypothesis→Plan` },
      { name: "description", content: "Generated experimental plan." },
    ],
  }),
  component: ProjectPage,
  notFoundComponent: () => (
    <div className="min-h-screen">
      <Header />
      <div className="mx-auto max-w-4xl px-6 py-24 text-center">
        <h1 className="text-4xl font-bold">Project not found</h1>
        <p className="mt-3 text-muted-foreground">It may have been deleted.</p>
        <Button asChild className="mt-6">
          <Link to="/projects">Back to projects</Link>
        </Button>
      </div>
    </div>
  ),
});

function ProjectPage() {
  const { id } = Route.useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [copied, setCopied] = useState(false);
  const [showJudgeView, setShowJudgeView] = useState(false);
  const [pitchCopied, setPitchCopied] = useState(false);

  const [livePapers, setLivePapers] = useState<Paper[] | null>(null);
  const [paperSource, setPaperSource] = useState<DataSource>("seed");
  const [paperSourceNote, setPaperSourceNote] = useState<string>("");
  const [literatureLoading, setLiteratureLoading] = useState(false);
  const [literatureDebug, setLiteratureDebug] = useState<LiteratureDebug | null>(null);

  // /api/generate-plan response (opt-in via the LivePipelinePanel button).
  const [livePlan, setLivePlan] = useState<LivePlanResponse | null>(null);

  useEffect(() => {
    const p = getProject(id);
    if (!p) throw notFound();
    setProject(p);
    setPlan(generatePlan(p));
    setLivePapers(null);
    setPaperSource("seed");
    setPaperSourceNote("");
    setLiteratureDebug(null);

    if (p.id !== "demo-trehalose-hela-001") {
      setLiteratureLoading(true);
      const query = `${p.hypothesis} ${p.domain} ${p.organism}`.trim() || p.title;
      searchLiterature(query)
        .then((res) => {
          setLivePapers(res.data);
          setPaperSource(res.source);
          setPaperSourceNote(res.note ?? "");
          setLiteratureDebug(res.debug ?? null);
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : "live literature refresh failed";
          setLivePapers([]);
          setPaperSource("fallback");
          setPaperSourceNote(`Live literature refresh failed: ${msg}`);
        })
        .finally(() => setLiteratureLoading(false));
    }
  }, [id]);

  const handleRefreshLiterature = async () => {
    if (!project) return;
    setLiteratureLoading(true);
    try {
      const query =
        `${project.hypothesis} ${project.domain} ${project.organism}`.trim() || project.title;
      const res = await searchLiterature(query);
      setLivePapers(res.data);
      setPaperSource(res.source);
      setPaperSourceNote(res.note ?? "");
      setLiteratureDebug(res.debug ?? null);

      // Provenance-aware toast: only claim "fallback" when literature is
      // actually fallback AND no live papers are available from any source
      // (this refresh OR the orchestrator's livePlan).
      const liveCount = res.source === "live-api" ? res.data.length : 0;
      const livePlanLitCount = livePlan?.evidence_map?.length ?? 0;
      const livePlanLitOk =
        !!livePlan && livePlan.warnings.uses_fallback_literature === false && livePlanLitCount > 0;

      if (res.source === "live-api" && liveCount > 0) {
        toast.success("Live literature loaded", {
          description: `Returned ${liveCount} paper${liveCount === 1 ? "" : "s"} via Semantic Scholar.`,
        });
      } else if (livePlanLitOk) {
        toast.message("Live literature already loaded", {
          description: `Pipeline returned ${livePlanLitCount} papers via Semantic Scholar.`,
        });
      } else {
        toast.message("Using verified seeded fallback", {
          description: res.note ?? "Live Semantic Scholar unavailable.",
        });
      }
    } catch {
      // Defensive — searchLiterature already swallows errors, but never let
      // anything escape into the React render tree.
      setLivePapers(plan?.papers ?? null);
      setPaperSource("fallback");
      setPaperSourceNote("Verified seeded fallback — live API unavailable.");
      setLiteratureDebug(null);
      const livePlanLitOk =
        !!livePlan &&
        livePlan.warnings.uses_fallback_literature === false &&
        (livePlan.evidence_map?.length ?? 0) > 0;
      if (!livePlanLitOk) {
        toast.message("Using verified seeded fallback", {
          description: "Live Semantic Scholar request failed.",
        });
      }
    } finally {
      setLiteratureLoading(false);
    }
  };

  if (!project || !plan) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="mx-auto max-w-7xl px-6 py-12">
          <div className="space-y-4">
            <div className="h-10 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-32 animate-pulse rounded bg-muted" />
            <div className="h-96 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  // Effective values: prefer livePlan when present, else fall back to seeded plan.
  const liveTotalBudget = livePlan ? livePlan.materials_budget.subtotal_verified : null;
  const totalBudget = liveTotalBudget ?? plan.materials.reduce((s, m) => s + m.total, 0);
  const protocolLiveStatus = livePlan
    ? {
        ok: livePlan.source_status?.protocols?.ok ?? !livePlan.warnings.uses_fallback_protocols,
        used_fallback: livePlan.warnings.uses_fallback_protocols,
        reason: livePlan.source_status?.protocols?.reason,
      }
    : null;
  const readinessPlan = livePlan
    ? {
        ...plan,
        materials: livePlan.materials_budget.items.map((m) => ({
          name: m.name,
          purpose: m.note,
          vendor: m.supplier,
          catalog: m.catalog,
          quantity: "1",
          unitCost: m.unit_cost,
          total: m.unit_cost,
          category: m.category as "equipment" | "consumable" | "reagent" | "service",
          verification: {
            status: (m.verified ? "verified" : "pending") as "verified" | "pending" | "unverified",
            note: m.note,
            sourceUrl: m.source_url,
          },
        })),
        timeline: livePlan.timeline.map((t) => ({
          week: t.week,
          phase: t.phase,
          milestone: t.milestone,
          tasks: t.tasks,
          deliverable: t.deliverable,
        })),
        validation: {
          primaryMetric: livePlan.validation_plan.primary_metric,
          secondaryMetrics: livePlan.validation_plan.secondary_metrics,
          statisticalApproach: livePlan.validation_plan.statistical_approach,
          positiveControl: livePlan.validation_plan.positive_control,
          negativeControl: livePlan.validation_plan.negative_control,
          reproducibilityChecks: livePlan.validation_plan.reproducibility_checks,
          source: plan.validation.source,
        },
      }
    : plan;

  const baseReadiness = computeLabReadiness(
    readinessPlan,
    livePlan ? livePlan.literature_qc : plan.literatureQc,
    protocolLiveStatus,
  );
  const hasMissingCatalogs = baseReadiness.missingChecklist.some((m) =>
    m.toLowerCase().includes("catalog number"),
  );
  const mustCapBelow90 =
    !!livePlan && (livePlan.warnings.uses_fallback_protocols || hasMissingCatalogs);
  const liveScore = livePlan ? livePlan.lab_readiness_score : baseReadiness.score;
  const finalScore = mustCapBelow90 ? Math.min(liveScore, 89) : liveScore;
  const labReadiness = livePlan ? { ...baseReadiness, score: finalScore } : baseReadiness;
  const planText = livePlan
    ? formatLivePlanAsMarkdown(project, livePlan)
    : formatPlanAsMarkdown(project, plan, totalBudget);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(planText);
      setCopied(true);
      toast.success("Plan copied to clipboard", {
        description: `${planText.length.toLocaleString()} characters · structured Markdown`,
      });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not access clipboard", {
        description: "Try the Download .md option instead.",
      });
    }
  };

  const handleDownload = () => {
    const blob = new Blob([planText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slugify(project.title)}-research-plan.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Plan downloaded", { description: a.download });
  };

  return (
    <div className="min-h-screen">
      <Header />
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Breadcrumb + actions */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <Link
            to="/projects"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="mr-1 h-3 w-3" /> All projects
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                document
                  .getElementById("scientist-review")
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
            >
              <MessagesSquare className="mr-2 h-4 w-4" /> Scientist Review
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? (
                <Check className="mr-2 h-4 w-4 text-success" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              {copied ? "Copied" : "Copy plan"}
            </Button>
            <Button size="sm" onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" /> Export .md
            </Button>
            <Button
              size="sm"
              onClick={() => setShowJudgeView(true)}
              className="bg-gradient-hero shadow-glow"
            >
              <Presentation className="mr-2 h-4 w-4" /> Judge View
            </Button>
          </div>
        </div>

        {/* Challenge 4 flow banner */}
        <Card className="mb-4 border-primary/30 bg-primary/5 p-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge className="bg-primary/15 text-primary hover:bg-primary/20">
              Challenge 4 flow
            </Badge>
            <span className="font-mono text-foreground/80">
              Hypothesis <span className="text-primary">→</span> Literature QC{" "}
              <span className="text-primary">→</span> Runnable Experiment Plan{" "}
              <span className="text-primary">→</span> Scientist Review
            </span>
          </div>
        </Card>

        {/* Technical credibility note */}
        <div className="mb-6 rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
          <span className="font-mono">
            Live Semantic Scholar search is routed through{" "}
            <span className="text-foreground/80">/api/search-papers</span> server proxy with
            verified fallback for demo stability.
          </span>
        </div>

        {/* Project header */}
        <Card className="mb-6 border-border/60 bg-gradient-card p-6 shadow-elegant">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{project.domain}</Badge>
                {project.organism && (
                  <Badge variant="outline" className="bg-accent/30">
                    {project.organism}
                  </Badge>
                )}
                <Badge className="bg-success/15 text-success hover:bg-success/20">Plan ready</Badge>
              </div>
              <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-4xl">
                {project.title}
              </h1>
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-4">
                <Quote className="h-4 w-4 shrink-0 text-primary" />
                <p className="text-sm italic text-foreground/80">{project.hypothesis}</p>
              </div>
              {(project.resources || project.constraints) && (
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                  {project.resources && (
                    <div className="rounded-md border border-border/60 bg-background/40 p-2.5">
                      <span className="font-mono uppercase tracking-wider text-foreground/60">
                        Resources
                      </span>
                      <div className="mt-0.5 text-foreground/75">{project.resources}</div>
                    </div>
                  )}
                  {project.constraints && (
                    <div className="rounded-md border border-border/60 bg-background/40 p-2.5">
                      <span className="font-mono uppercase tracking-wider text-foreground/60">
                        Constraints
                      </span>
                      <div className="mt-0.5 text-foreground/75">{project.constraints}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Top summary cards */}
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            <ScoreCard
              label="Novelty Score"
              value={plan.noveltyScore}
              helper="How original vs. published corpus"
            />
            <ScoreCard
              label="Feasibility Score"
              value={plan.feasibilityScore}
              helper="Plan realism given budget & time"
            />
            <ScoreCard
              label="Evidence Confidence"
              value={plan.evidenceConfidence}
              helper="Strength of supporting literature"
            />
            <StatCard
              label="Estimated Cost"
              value={`$${(totalBudget / 1000).toFixed(1)}k`}
              helper={`${plan.materials.length} line items`}
            />
            <StatCard
              label="Estimated Duration"
              value={`${plan.timeline.length} wks`}
              helper={`${plan.protocol.length} protocol phases`}
            />
          </div>

          {/* Literature QC banner */}
          {plan.literatureQc ? (
            <div className="mt-4 flex flex-wrap items-start gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
              <Badge
                variant="outline"
                className="shrink-0 gap-1 border-primary/40 bg-primary/10 font-mono text-[10px] uppercase tracking-wider text-primary"
              >
                <FileSearch className="h-3 w-3" /> Literature QC: {livePlan ? livePlan.literature_qc.result : plan.literatureQc.result}
              </Badge>
              <span className="min-w-0 flex-1 text-foreground/80">{livePlan ? livePlan.literature_qc.reason : plan.literatureQc.reason}</span>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs">
              <VerificationBadge verification={{ status: "pending" }} />
              <span className="text-foreground/80">
                Demo data is seeded for layout — every literature reference, protocol source, and
                catalog number is marked
                <span className="font-mono"> pending verification</span> until a real source is
                attached.
              </span>
            </div>
          )}
        </Card>

        {/* Real-data pipeline (opt-in) */}
        <LivePipelinePanel project={project} livePlan={livePlan} onResult={setLivePlan} />

        {/* Lab Readiness */}
        <div className="mb-6">
          <LabReadinessCard report={labReadiness} variant="full" />
        </div>

        {/* Tabs */}
        <Tabs defaultValue="evidence" className="w-full">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
            <TabTrig value="evidence" icon={FileSearch}>
              Evidence
            </TabTrig>
            <TabTrig value="novelty" icon={Sparkles}>
              Novelty Analysis
            </TabTrig>
            <TabTrig value="protocol" icon={Beaker}>
              Protocol
            </TabTrig>
            <TabTrig value="materials" icon={ShoppingCart}>
              Materials & Budget
            </TabTrig>
            <TabTrig value="timeline" icon={Calendar}>
              Timeline
            </TabTrig>
            <TabTrig value="validation" icon={CheckCircle2}>
              Validation
            </TabTrig>
            <TabTrig value="risks" icon={ShieldAlert}>
              Risks
            </TabTrig>
          </TabsList>

          {/* EVIDENCE */}
          <TabsContent value="evidence" className="mt-6 space-y-4">
            {livePlan && livePlan.evidence_map.length > 0 && (
              <Card className="border-success/30 bg-success/5 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <FileSearch className="h-4 w-4 text-success" />
                    <h3 className="font-display text-sm font-semibold">
                      Live evidence ({livePlan.evidence_map.length})
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {livePlan.evidence_map.some((e) => e.source === "semantic-scholar") && (
                      <SourceBadge source="live-semantic-scholar" />
                    )}
                    {livePlan.evidence_map.some((e) => e.source === "openalex") && (
                      <SourceBadge source="openalex" />
                    )}
                    {livePlan.evidence_map.some((e) => e.source === "crossref") && (
                      <SourceBadge source="crossref" />
                    )}
                    {livePlan.evidence_map.some((e) => e.source === "pubmed") && (
                      <SourceBadge source="pubmed" />
                    )}
                    {livePlan.warnings.uses_fallback_literature && (
                      <SourceBadge source="curated-fallback" fallback />
                    )}
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {livePlan.evidence_map.slice(0, 6).map((e) => (
                    <a
                      key={e.id}
                      href={e.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border border-border/60 bg-background/60 p-2 hover:border-primary/40"
                    >
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <span className="font-mono">{e.role}</span>
                        <span>·</span>
                        <span>{e.year || "—"}</span>
                        <span>·</span>
                        <span>{Math.round(e.relevance_score * 100)}% rel.</span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-sm font-medium leading-snug">
                        {e.title}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{e.venue}</div>
                    </a>
                  ))}
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  <span className="font-mono">Literature QC:</span>{" "}
                  <span className="text-foreground/80">{livePlan.literature_qc.result}</span> —{" "}
                  {livePlan.literature_qc.reason}
                </div>
              </Card>
            )}
            {(() => {
              // Provenance priority: livePlan.source_status.literature wins over
              // the legacy paperSource state (which only updates when the user
              // clicks the refresh button). This guarantees the
              // Related work badge stays consistent with the Real-data pipeline
              // panel after a /api/generate-plan run.
              const liveLit = livePlan?.source_status?.literature ?? null;
              const liveEvidence = livePlan?.evidence_map ?? null;
              const isDemoProject = project.id === "demo-trehalose-hela-001";

              const displayPapers: Paper[] =
                liveEvidence && liveEvidence.length > 0
                  ? liveEvidence.map((e) => ({
                      id: e.id,
                      title: e.title,
                      authors: "",
                      year: e.year,
                      venue: e.venue,
                      citations: 0,
                      similarity: e.relevance_score,
                      abstract: "",
                      whyItMatters:
                        e.role === "primary"
                          ? "Primary evidence for this hypothesis."
                          : e.role === "supporting"
                            ? "Supporting evidence."
                            : "Background reference.",
                      doi: e.source_url,
                      verification: {
                        status: "verified",
                        sourceUrl: e.source_url,
                        note: literatureSourceLabel(e.source),
                        checkedAt: new Date().toISOString().slice(0, 10),
                      },
                    }))
                  : (livePapers ?? (isDemoProject ? plan.papers : []));

              const isRateLimited = /rate limit/i.test(paperSourceNote);
              const sourceLabel = liveLit
                ? liveLit.ok
                  ? liveLit.label.toUpperCase()
                  : "Curated fallback"
                : paperSource === "live-api"
                  ? "Live Semantic Scholar"
                  : paperSource === "fallback"
                    ? isRateLimited
                      ? "Rate limited — using verified seeded fallback"
                      : isDemoProject
                        ? "Verified seeded fallback"
                        : "Live literature unavailable"
                    : isDemoProject
                      ? "Verified seeded data"
                      : literatureLoading
                        ? "Querying literature"
                        : "Live literature pending";
              const sourceClass = liveLit
                ? liveLit.ok
                  ? "border-success/40 bg-success/10 text-success"
                  : "border-warning/40 bg-warning/10 text-warning-foreground"
                : paperSource === "live-api"
                  ? "border-success/40 bg-success/10 text-success"
                  : literatureLoading
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-warning/40 bg-warning/10 text-warning-foreground";
              const sourceNote = liveLit
                ? liveLit.ok
                  ? `Returned ${displayPapers.length} papers via ${liveLit.label}.`
                  : liveLit.reason
                : paperSourceNote;
              return (
                <>
                  <SectionHeader
                    title="Related work"
                    subtitle={`${displayPapers.length} papers ranked by relevance`}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase tracking-wider ${sourceClass}`}
                      >
                        {literatureLoading ? "Querying Semantic Scholar…" : sourceLabel}
                      </Badge>
                      {sourceNote && (
                        <span className="text-xs text-muted-foreground">{sourceNote}</span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleRefreshLiterature}
                      disabled={literatureLoading}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      {literatureLoading ? "Refreshing…" : "Refresh from Semantic Scholar"}
                    </Button>
                  </div>
                  {literatureDebug && !liveLit && (
                    <div className="rounded-md border border-dashed border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                      <span className="mr-3">
                        Proxy: {literatureDebug.proxyUsed ? "active" : "off"}
                      </span>
                      <span className="mr-3">
                        API key detected: {literatureDebug.hasApiKey ? "yes" : "no"}
                      </span>
                      <span className="mr-3">
                        Semantic Scholar status: {literatureDebug.semanticScholarStatus || "—"}
                      </span>
                      <span>Source: {paperSource === "live-api" ? "live" : "fallback"}</span>
                    </div>
                  )}
                  {displayPapers.length === 0 && (
                    <Card className="border-border/60 bg-card p-5">
                      <div className="font-display text-sm font-semibold">
                        No live references loaded
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        This user-created project is not showing seeded HeLa literature. Use the
                        refresh button or the real-data pipeline to query live sources for this
                        hypothesis.
                      </p>
                    </Card>
                  )}
                  {displayPapers.map((paper) => (
                    <Card
                      key={paper.id}
                      className="border-border/60 bg-gradient-card p-5 transition-smooth hover:border-primary/40"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <h4 className="font-display text-base font-semibold leading-snug">
                            {paper.title}
                          </h4>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {paper.authors} · <span className="italic">{paper.venue}</span> ·{" "}
                            {paper.year}
                          </div>
                          <p className="mt-3 text-sm text-foreground/80">{paper.abstract}</p>
                          <div className="mt-3 rounded-md border-l-2 border-primary/60 bg-primary/5 p-3">
                            <div className="flex items-start gap-2">
                              <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                              <div>
                                <div className="font-mono text-[10px] uppercase tracking-wider text-primary">
                                  Why it matters
                                </div>
                                <div className="text-sm text-foreground/85">
                                  {paper.whyItMatters}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-2">
                          <Badge variant="secondary" className="bg-primary/10 text-primary">
                            {Math.round(paper.similarity * 100)}% relevance
                          </Badge>
                          {paper.citations > 0 && (
                            <span className="font-mono text-xs text-muted-foreground">
                              {paper.citations} cites
                            </span>
                          )}
                          {(() => {
                            const href =
                              paper.verification?.sourceUrl ??
                              (paper.doi.startsWith("http")
                                ? paper.doi
                                : `https://doi.org/${paper.doi}`);
                            return (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center text-xs text-primary hover:underline"
                              >
                                Open source <ExternalLink className="ml-1 h-3 w-3" />
                              </a>
                            );
                          })()}
                          <VerificationBadge verification={paper.verification} />
                          {paper.verification?.note
                            ?.toLowerCase()
                            .startsWith("supporting source") && (
                            <Badge
                              variant="outline"
                              className="border-warning/40 bg-warning/10 font-mono text-[10px] uppercase tracking-wider text-warning-foreground"
                            >
                              Supporting source
                            </Badge>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </>
              );
            })()}
          </TabsContent>

          {/* NOVELTY */}
          <TabsContent value="novelty" className="mt-6 space-y-4">
            {(() => {
              const liveNov = (livePlan as any)?.novelty_assessment;
              const novScore = liveNov ? (liveNov.verdict === "High" ? 85 : liveNov.verdict === "Medium" ? 55 : 30) : plan.noveltyScore;
              const novRationale = liveNov ? liveNov.rationale : plan.noveltyRationale;
              const riskLevel = liveNov ? (liveNov.verdict === "High" ? "low" : "medium") : plan.noveltyAnalysis.riskLevel;
              const whatIsKnown = liveNov ? ["Extracted from the live evidence map."] : plan.noveltyAnalysis.whatIsKnown;
              const whatIsMissing = liveNov ? liveNov.gaps : plan.noveltyAnalysis.whatIsMissing;
              const whyNovel = liveNov ? liveNov.rationale : plan.noveltyAnalysis.whyNovel;
              const refinement = liveNov ? "Automatically generated plans currently do not include further refinements." : plan.noveltyAnalysis.refinement;

              return (
                <>
                  <Card className="border-border/60 bg-gradient-card p-8 shadow-elegant">
                    <div className="flex flex-wrap items-center gap-8">
                      <div className="relative flex h-40 w-40 shrink-0 items-center justify-center">
                        <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                          <circle
                            cx="50"
                            cy="50"
                            r="42"
                            stroke="currentColor"
                            strokeWidth="8"
                            fill="none"
                            className="text-muted"
                          />
                          <circle
                            cx="50"
                            cy="50"
                            r="42"
                            stroke="url(#grad)"
                            strokeWidth="8"
                            fill="none"
                            strokeDasharray={`${(novScore / 100) * 264} 264`}
                            strokeLinecap="round"
                          />
                          <defs>
                            <linearGradient id="grad" x1="0" x2="1" y1="0" y2="1">
                              <stop offset="0%" stopColor="oklch(0.48 0.13 200)" />
                              <stop offset="100%" stopColor="oklch(0.72 0.15 195)" />
                            </linearGradient>
                          </defs>
                        </svg>
                        <div className="text-center">
                          <div className="font-display text-4xl font-bold text-primary">
                            {novScore}
                          </div>
                          <div className="text-xs uppercase tracking-wider text-muted-foreground">
                            Novelty
                          </div>
                        </div>
                      </div>
                      <div className="flex-1">
                        <div className="mb-2 flex items-center gap-2">
                          <h3 className="font-display text-xl font-semibold">Why this score?</h3>
                          <RiskLevelBadge level={riskLevel} label="Novelty risk" />
                        </div>
                        <p className="mt-1 text-muted-foreground">{novRationale}</p>
                      </div>
                    </div>
                  </Card>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Card className="border-border/60 bg-gradient-card p-6">
                      <div className="mb-3 flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-success" />
                        <h3 className="font-display text-base font-semibold">What is already known</h3>
                      </div>
                      <ul className="space-y-2 text-sm">
                        {whatIsKnown.map((k: string, i: number) => (
                          <li key={i} className="flex gap-2">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-success" />
                            <span className="text-foreground/80">{k}</span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                    <Card className="border-border/60 bg-gradient-card p-6">
                      <div className="mb-3 flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-warning-foreground" />
                        <h3 className="font-display text-base font-semibold">
                          What is missing in the literature
                        </h3>
                      </div>
                      <ul className="space-y-2 text-sm">
                        {whatIsMissing.map((k: string, i: number) => (
                          <li key={i} className="flex gap-2">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" />
                            <span className="text-foreground/80">{k}</span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </div>

                  <Card className="border-border/60 bg-gradient-card p-6">
                    <div className="mb-2 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <h3 className="font-display text-base font-semibold">
                        Why this hypothesis may be novel
                      </h3>
                    </div>
                    <p className="text-foreground/80">{whyNovel}</p>
                  </Card>

                  <Card className="border-primary/30 bg-primary/5 p-6">
                    <div className="mb-2 flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" />
                      <h3 className="font-display text-base font-semibold text-primary">
                        Recommended refinement
                      </h3>
                    </div>
                    <p className="text-foreground/85">{refinement}</p>
                  </Card>
                </>
              );
            })()}
          </TabsContent>

          {/* PROTOCOL */}
          <TabsContent value="protocol" className="mt-6 space-y-4">
            {livePlan && livePlan.protocols.length > 0 && (
              <Card className="border-success/30 bg-success/5 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Beaker className="h-4 w-4 text-success" />
                    <h3 className="font-display text-sm font-semibold">
                      {livePlan.warnings.uses_fallback_protocols
                        ? `Curated fallback protocols (${livePlan.protocols.length})`
                        : `Live protocols (${livePlan.protocols.length})`}
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {livePlan.protocols.some((p) => p.source === "protocols.io") && (
                      <SourceBadge source="protocols.io" />
                    )}
                    {livePlan.warnings.uses_fallback_protocols && (
                      <SourceBadge source="curated-fallback" fallback />
                    )}
                  </div>
                </div>
                {livePlan.warnings.uses_fallback_protocols &&
                  (() => {
                    const ps = livePlan.source_status?.protocols;
                    const reason = ps?.reason ?? "";
                    const statusMatch = reason.match(/HTTP\s+(\d+|—)/i);
                    const statusCode = statusMatch?.[1] ?? "error";
                    return (
                      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5">
                        <Badge
                          variant="outline"
                          className="border-warning/60 bg-warning/20 text-[10px] font-mono uppercase tracking-wider text-warning-foreground"
                        >
                          protocols.io HTTP {statusCode} → curated fallback used
                        </Badge>
                        {reason && (
                          <span className="text-[11px] text-muted-foreground line-clamp-1">
                            {reason}
                          </span>
                        )}
                      </div>
                    );
                  })()}
                <div className="grid gap-2 md:grid-cols-2">
                  {livePlan.protocols.map((p) => (
                    <a
                      key={p.id}
                      href={p.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border border-border/60 bg-background/60 p-2 hover:border-primary/40"
                    >
                      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
                        <span className="font-mono">{p.source}</span>
                        <span>·</span>
                        <span>{Math.round(p.relevance_score * 100)}% rel.</span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-sm font-medium leading-snug">
                        {p.title}
                      </div>
                      {p.matched_keywords.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {p.matched_keywords.slice(0, 4).map((k) => (
                            <Badge key={k} variant="secondary" className="text-[9px]">
                              {k}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              </Card>
            )}
            <SectionHeader
              title="Experimental protocol"
              subtitle={`${plan.protocol.length} phases — preparation through expected outputs`}
            />
            <div className="space-y-3">
              {plan.protocol.map((step) => (
                <Card key={step.step} className="border-border/60 bg-gradient-card p-5">
                  <div className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-hero font-mono text-sm font-bold text-primary-foreground shadow-glow">
                      {step.step}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <h4 className="font-display text-base font-semibold">{step.title}</h4>
                        <Badge variant="outline" className="text-xs">
                          {step.phase}
                        </Badge>
                        <span className="text-xs text-muted-foreground">· {step.duration}</span>
                        <VerificationBadge verification={step.protocolSource} compact />
                      </div>
                      <p className="mt-1.5 text-sm text-foreground/80">{step.description}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {step.equipment.map((e) => (
                          <Badge key={e} variant="secondary" className="font-mono text-xs">
                            {e}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* MATERIALS */}
          <TabsContent value="materials" className="mt-6 space-y-4">
            {livePlan && livePlan.materials_budget.items.length > 0 && (
              <Card className="border-success/30 bg-success/5 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4 text-success" />
                    <h3 className="font-display text-sm font-semibold">
                      Live materials ({livePlan.materials_budget.items.length})
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {livePlan.warnings.has_unverified_materials ? (
                      <SourceBadge source="curated-fallback" fallback />
                    ) : (
                      <SourceBadge source="verified-supplier" />
                    )}
                    <Badge variant="outline" className="text-[10px]">
                      Subtotal ${livePlan.materials_budget.subtotal_verified.toLocaleString()} / cap
                      ${livePlan.materials_budget.budget_cap.toLocaleString()}
                    </Badge>
                  </div>
                </div>
                <ul className="grid gap-1.5 text-xs sm:grid-cols-2">
                  {livePlan.materials_budget.items.map((m, i) => (
                    <li
                      key={`${m.name}-${i}`}
                      className="flex items-start justify-between gap-2 rounded border border-border/60 bg-background/60 px-2 py-1.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium leading-tight">{m.name}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {m.supplier} · {m.pack_size}
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {m.source_url ? (
                          <a
                            href={m.source_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-[11px] text-primary hover:underline"
                          >
                            {m.catalog}
                          </a>
                        ) : (
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {m.catalog}
                          </span>
                        )}
                        <span className="font-mono text-[10px]">
                          ${m.unit_cost.toLocaleString()}
                        </span>
                        {m.verified ? (
                          <Badge
                            variant="outline"
                            className="border-success/40 bg-success/10 text-[9px] text-success"
                          >
                            verified
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-warning/40 bg-warning/10 text-[9px] text-warning-foreground"
                          >
                            verify
                          </Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            <div className="flex items-end justify-between">
              <SectionHeader
                title="Materials & budget"
                subtitle={`${plan.materials.length} line items`}
              />
              <div className="text-right">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Total estimated cost
                </div>
                <div className="font-display text-3xl font-bold text-primary">
                  ${totalBudget.toLocaleString()}
                </div>
              </div>
            </div>
            <Card className="overflow-hidden border-border/60 bg-card p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead>Purpose</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead className="text-right">Unit</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Source</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.materials.map((m, i) => {
                      const needsCatalog = m.catalog === CATALOG_VERIFY_REQUIRED;
                      return (
                        <TableRow key={i}>
                          <TableCell>
                            <div className="font-medium">{m.name}</div>
                            <Badge variant="outline" className="mt-1 text-[10px]">
                              {m.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-xs text-sm text-muted-foreground">
                            {m.purpose}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div>{m.vendor}</div>
                            {needsCatalog ? (
                              <Badge
                                variant="outline"
                                className="mt-1 border-destructive/30 bg-destructive/10 font-mono text-[10px] text-destructive"
                                title="Replace this sentinel with a real vendor catalog number before ordering."
                              >
                                Catalog: {CATALOG_VERIFY_REQUIRED}
                              </Badge>
                            ) : m.verification?.sourceUrl ? (
                              <a
                                href={m.verification.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-mono text-xs text-primary hover:underline"
                              >
                                {m.catalog}
                              </a>
                            ) : (
                              <div className="font-mono text-xs text-muted-foreground">
                                {m.catalog}
                              </div>
                            )}
                            {!needsCatalog &&
                              m.verification?.note
                                ?.toLowerCase()
                                .includes("verify before ordering") && (
                                <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-warning-foreground/80">
                                  Verify before ordering
                                </div>
                              )}
                          </TableCell>
                          <TableCell className="text-sm">{m.quantity}</TableCell>
                          <TableCell className="text-right font-mono text-sm">
                            ${m.unitCost.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">
                            ${m.total.toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <VerificationBadge verification={m.verification} compact />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/40">
                      <TableCell colSpan={5} className="text-right font-semibold">
                        Grand total
                      </TableCell>
                      <TableCell className="text-right font-mono text-lg font-bold text-primary">
                        ${totalBudget.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <VerificationBadge verification={plan.budgetSource} compact />
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          {/* TIMELINE */}
          <TabsContent value="timeline" className="mt-6 space-y-4">
            {livePlan && livePlan.timeline.length > 0 && (
              <Card className="border-success/30 bg-success/5 p-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-success" />
                    <h3 className="font-display text-sm font-semibold">
                      Live timeline ({livePlan.timeline.length} weeks)
                    </h3>
                  </div>
                  <SourceBadge source="seed" />
                </div>
                <ul className="space-y-1 text-xs">
                  {livePlan.timeline.map((wk) => (
                    <li
                      key={wk.week}
                      className="rounded border border-border/60 bg-background/60 px-2 py-1.5"
                    >
                      <span className="font-mono text-primary">W{wk.week}</span>{" "}
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        {wk.phase}
                      </span>{" "}
                      <span className="font-medium">{wk.milestone}</span>{" "}
                      <span className="text-muted-foreground">— {wk.deliverable}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Generated from project inputs by{" "}
                  <code className="font-mono text-foreground/80">/api/generate-plan</code>. Detailed
                  weekly view below uses the seeded baseline.
                </div>
              </Card>
            )}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <SectionHeader
                title="Week-by-week timeline"
                subtitle={`${plan.timeline.length} weeks · ${new Set(plan.timeline.map((t) => t.phase)).size} phases`}
              />
              <VerificationBadge verification={plan.timelineSource} />
            </div>
            <div className="relative">
              <div className="absolute bottom-0 left-5 top-2 hidden w-0.5 bg-gradient-to-b from-primary via-primary/40 to-transparent sm:block" />
              <div className="space-y-3">
                {plan.timeline.map((wk) => (
                  <div key={wk.week} className="relative sm:pl-14">
                    <div className="mb-2 inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-gradient-hero font-mono text-xs font-bold text-primary-foreground shadow-md sm:absolute sm:left-0 sm:top-0 sm:mb-0">
                      W{wk.week}
                    </div>
                    <Card className="border-border/60 bg-gradient-card p-4 transition-smooth hover:border-primary/40">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <Badge variant="outline" className="text-xs">
                          {wk.phase}
                        </Badge>
                        <h4 className="font-display font-semibold">{wk.milestone}</h4>
                      </div>
                      <ul className="mt-2 space-y-1 text-sm text-foreground/80">
                        {wk.tasks.map((t) => (
                          <li key={t} className="flex items-start gap-2">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" /> {t}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-2 text-xs text-muted-foreground">
                        <span className="font-mono uppercase tracking-wider">Deliverable:</span>{" "}
                        {wk.deliverable}
                      </div>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* VALIDATION */}
          <TabsContent value="validation" className="mt-6 space-y-4">
            {(() => {
              const vPlan = livePlan?.validation_plan ? {
                primaryMetric: {
                  name: (livePlan as any).validation_plan.primary_metric.name,
                  target: (livePlan as any).validation_plan.primary_metric.target,
                  method: (livePlan as any).validation_plan.primary_metric.method,
                },
                secondaryMetrics: (livePlan as any).validation_plan.secondary_metrics.map((sm: any) => ({
                  name: sm.name,
                  target: sm.target,
                  method: sm.method
                })),
                statisticalApproach: (livePlan as any).validation_plan.statistical_approach,
                reproducibilityChecks: (livePlan as any).validation_plan.reproducibility_checks,
                positiveControl: (livePlan as any).validation_plan.positive_control,
                negativeControl: (livePlan as any).validation_plan.negative_control,
                source: (livePlan as any).warnings?.uses_fallback_llm ? { status: "pending" as const } : { status: "verified" as const, note: "LLM Generated" },
              } : plan.validation;

              return (
                <>
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <SectionHeader
                      title="Validation plan"
                      subtitle="Primary endpoint, secondary metrics, statistical approach, controls, reproducibility"
                    />
                    <VerificationBadge verification={vPlan.source} />
                  </div>

                  <Card className="border-primary/30 bg-primary/5 p-6">
                    <div className="mb-2 flex items-center gap-2">
                      <Target className="h-4 w-4 text-primary" />
                      <h3 className="font-display text-base font-semibold text-primary">
                        Primary success metric
                      </h3>
                    </div>
                    <div className="font-medium">{vPlan.primaryMetric.name}</div>
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <div className="rounded-md border border-border/60 bg-background/60 p-3">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">
                          Target
                        </div>
                        <div className="mt-0.5 font-mono text-primary">
                          {vPlan.primaryMetric.target}
                        </div>
                      </div>
                      <div className="rounded-md border border-border/60 bg-background/60 p-3">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground">
                          Method
                        </div>
                        <div className="mt-0.5 text-sm">{vPlan.primaryMetric.method}</div>
                      </div>
                    </div>
                  </Card>

                  <Card className="overflow-hidden border-border/60 bg-card p-0">
                    <div className="border-b border-border/60 bg-muted/40 px-4 py-3">
                      <h3 className="font-display text-base font-semibold">Secondary metrics</h3>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Metric</TableHead>
                          <TableHead>Target</TableHead>
                          <TableHead>Method</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {vPlan.secondaryMetrics.map((v: any, i: number) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{v.name}</TableCell>
                            <TableCell className="font-mono text-sm text-primary">{v.target}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{v.method}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Card>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Card className="border-border/60 bg-gradient-card p-6">
                      <h3 className="mb-2 font-display text-base font-semibold">Statistical approach</h3>
                      <p className="text-sm text-foreground/80">{vPlan.statisticalApproach}</p>
                    </Card>
                    <Card className="border-border/60 bg-gradient-card p-6">
                      <h3 className="mb-2 font-display text-base font-semibold">
                        Reproducibility checks
                      </h3>
                      <ul className="space-y-2 text-sm">
                        {vPlan.reproducibilityChecks.map((c: string, i: number) => (
                          <li key={i} className="flex gap-2">
                            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
                            <span className="text-foreground/80">{c}</span>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <Card className="border-success/30 bg-success/5 p-5">
                      <Badge className="mb-2 bg-success/15 text-success hover:bg-success/20">
                        Positive control
                      </Badge>
                      <p className="text-sm text-foreground/85">{vPlan.positiveControl}</p>
                    </Card>
                    <Card className="border-muted/50 bg-muted/20 p-5">
                      <Badge variant="outline" className="mb-2">
                        Negative control
                      </Badge>
                      <p className="text-sm text-foreground/85">{vPlan.negativeControl}</p>
                    </Card>
                  </div>
                </>
              );
            })()}
          </TabsContent>

          {/* RISKS */}
          <TabsContent value="risks" className="mt-6 space-y-4">
            <SectionHeader
              title="Risks & mitigations"
              subtitle={`${plan.risks.length} risks across scientific, operational, budget, and ethical/safety categories`}
            />
            <div className="grid gap-3 md:grid-cols-2">
              {plan.risks.map((r) => (
                <Card key={r.id} className="border-border/60 bg-gradient-card p-5">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h4 className="font-display font-semibold leading-tight">{r.title}</h4>
                    <Badge variant="outline" className="shrink-0 text-xs capitalize">
                      {r.category}
                    </Badge>
                  </div>
                  <div className="mb-3 flex gap-2">
                    <RiskBadge label="Likelihood" level={r.likelihood} />
                    <RiskBadge label="Impact" level={r.impact} />
                  </div>
                  <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
                    <span className="font-mono text-xs uppercase tracking-wider text-primary">
                      Mitigation
                    </span>
                    <p className="mt-1 text-foreground/80">{r.mitigation}</p>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        <div id="scientist-review" className="mt-8 scroll-mt-24">
          <ScientistFeedbackPanel experimentType={deriveExperimentType(project)} />
        </div>
      </div>

      {showJudgeView && (
        <JudgeViewOverlay
          project={project}
          plan={plan}
          totalBudget={totalBudget}
          labReadiness={labReadiness}
          copied={pitchCopied}
          onCopy={() => {
            const lines: string[] = [];
            lines.push(`Hypothesis-to-Plan Core — Judge Pitch Summary`);
            lines.push(``);
            lines.push(`PROJECT: ${project.title}`);
            lines.push(``);
            lines.push(`HYPOTHESIS:`);
            lines.push(project.hypothesis);
            lines.push(``);
            if (plan.literatureQc) {
              lines.push(`LITERATURE QC — ${plan.literatureQc.result}`);
              lines.push(plan.literatureQc.reason);
              lines.push(``);
            }
            lines.push(`KEY EVIDENCE:`);
            plan.papers.slice(0, 3).forEach((p, i) => {
              const url = p.verification.sourceUrl ?? p.doi;
              lines.push(`${i + 1}. ${p.title} (${p.year}) — ${url}`);
            });
            lines.push(``);
            lines.push(
              `BUDGET: ~$${totalBudget.toLocaleString()} · TIMELINE: ${plan.timeline.length} weeks`,
            );
            lines.push(``);
            lines.push(`SUCCESS METRIC: ${plan.validation.primaryMetric.name}`);
            lines.push(`Target: ${plan.validation.primaryMetric.target}`);
            navigator.clipboard.writeText(lines.join("\n"));
            setPitchCopied(true);
            toast.success("Pitch summary copied");
            setTimeout(() => setPitchCopied(false), 2000);
          }}
          onClose={() => setShowJudgeView(false)}
        />
      )}
    </div>
  );
}

function JudgeViewOverlay({
  project,
  plan,
  totalBudget,
  labReadiness,
  copied,
  onCopy,
  onClose,
}: {
  project: Project;
  plan: GeneratedPlan;
  totalBudget: number;
  labReadiness: import("@/lib/labReadiness").LabReadinessReport;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  const topPapers = plan.papers.slice(0, 3);
  const topSupplies = plan.materials.slice(0, 5);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-2">
            <Presentation className="h-4 w-4 text-primary" />
            <span className="font-display text-sm font-semibold">Judge Presentation View</span>
            <Badge variant="outline" className="text-[10px]">
              Hypothesis-to-Plan Core
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" onClick={onCopy}>
              {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? "Copied" : "Copy Pitch Summary"}
            </Button>
            <Button size="sm" onClick={onClose}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl space-y-6 px-6 py-8">
        <div>
          <Badge variant="outline" className="mb-3">
            {project.domain}
          </Badge>
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight md:text-4xl">
            {project.title}
          </h1>
        </div>

        <Card className="border-primary/30 bg-primary/5 p-5">
          <Badge className="mb-2 bg-primary/15 text-primary hover:bg-primary/20">
            Demo hypothesis
          </Badge>
          <div className="flex items-start gap-2">
            <Quote className="h-4 w-4 shrink-0 text-primary" />
            <p className="italic leading-relaxed text-foreground/85">{project.hypothesis}</p>
          </div>
        </Card>

        {plan.literatureQc && (
          <Card className="border-border/60 bg-gradient-card p-5">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <h2 className="font-display text-xl font-semibold">Literature QC</h2>
              </div>
              <Badge className="bg-primary/15 text-primary hover:bg-primary/20">
                Novelty signal: {plan.literatureQc.result}
              </Badge>
            </div>
            <p className="mb-3 text-sm text-foreground/80">{plan.literatureQc.reason}</p>
            <div className="grid gap-2 md:grid-cols-3">
              {topPapers.map((p) => {
                const url = p.verification.sourceUrl ?? p.doi;
                return (
                  <a
                    key={p.id}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-border/60 bg-background/50 p-3 hover:border-primary/40"
                  >
                    <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary">
                      Evidence · {p.year} <ExternalLink className="h-3 w-3" />
                    </div>
                    <div className="line-clamp-3 text-sm font-medium leading-snug">{p.title}</div>
                  </a>
                );
              })}
            </div>
          </Card>
        )}

        <Card className="border-border/60 bg-gradient-card p-5">
          <h2 className="mb-3 font-display text-xl font-semibold">Experiment plan summary</h2>
          <div className="mb-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Protocol ({plan.protocol.length} phases)
            </div>
            <ol className="space-y-1 text-sm">
              {plan.protocol.map((s) => (
                <li
                  key={s.step}
                  className="rounded border border-border/60 bg-background/40 px-3 py-1.5"
                >
                  <span className="font-mono text-xs text-primary">#{s.step}</span>{" "}
                  <span className="font-medium">{s.title}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    — {s.phase} · {s.duration}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Supplies & catalog #
              </div>
              <Badge variant="outline" className="text-[10px]">
                Verify before ordering
              </Badge>
            </div>
            <ul className="space-y-1 text-sm">
              {topSupplies.map((m, i) => (
                <li
                  key={i}
                  className="flex flex-wrap justify-between gap-2 rounded border border-border/60 bg-background/40 px-3 py-1.5"
                >
                  <span>
                    <span className="font-medium">{m.name}</span>{" "}
                    <span className="text-xs text-muted-foreground">— {m.vendor}</span>
                  </span>
                  <span className="font-mono text-xs">
                    {m.verification.sourceUrl ? (
                      <a
                        href={m.verification.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        {m.catalog}
                      </a>
                    ) : (
                      m.catalog
                    )}
                    {" · "}${m.total}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 text-right text-sm">
              <span className="text-muted-foreground">Total estimated budget: </span>
              <span className="font-mono font-bold text-primary">
                ${totalBudget.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="mb-4">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Timeline ({plan.timeline.length} weeks) & key dependencies
            </div>
            <ol className="space-y-1 text-sm">
              {plan.timeline.map((wk) => (
                <li
                  key={wk.week}
                  className="rounded border border-border/60 bg-background/40 px-3 py-1.5"
                >
                  <span className="font-mono text-xs text-primary">W{wk.week}</span>{" "}
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {wk.phase}
                  </span>{" "}
                  <span className="font-medium">{wk.milestone}</span>{" "}
                  <span className="text-muted-foreground">— {wk.deliverable}</span>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Validation success metric
              </div>
            </div>
            <div className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm">
              <div className="font-medium">{plan.validation.primaryMetric.name}</div>
              <div className="mt-1 text-foreground/80">
                <span className="font-semibold text-success">Target:</span>{" "}
                {plan.validation.primaryMetric.target}
              </div>
              <div className="mt-1 text-muted-foreground">
                <span className="font-semibold">Method:</span>{" "}
                {plan.validation.primaryMetric.method}
              </div>
            </div>
          </div>
        </Card>

        <Card className="border-primary/30 bg-gradient-card p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-xl font-semibold">
              Challenge 4 — Hypothesis → Literature QC → Runnable Experiment Plan
            </h2>
            <Badge
              variant="outline"
              className="border-success/40 bg-success/10 text-[10px] uppercase tracking-wider text-success"
            >
              Verified source-backed demo
            </Badge>
          </div>
          <ul className="grid gap-2 text-sm md:grid-cols-2">
            <li className="rounded border border-border/60 bg-background/50 p-2">
              <b className="text-primary">Input:</b> plain-language hypothesis
            </li>
            <li className="rounded border border-border/60 bg-background/50 p-2">
              <b className="text-primary">Literature QC:</b> novelty signal —{" "}
              <span className="font-mono">
                {plan.literatureQc?.result ?? "Similar work exists"}
              </span>
            </li>
            <li className="rounded border border-border/60 bg-background/50 p-2">
              <b className="text-primary">Protocol:</b> grounded in public protocol references
              (OpenWetWare / protocols.io)
            </li>
            <li className="rounded border border-border/60 bg-background/50 p-2">
              <b className="text-primary">Supplies:</b> supplier + catalog #s with
              verify-before-ordering notes
            </li>
            <li className="rounded border border-border/60 bg-background/50 p-2">
              <b className="text-primary">Budget & timeline:</b> ${totalBudget.toLocaleString()} ·{" "}
              {plan.timeline.length} weeks with dependencies
            </li>
            <li className="rounded border border-border/60 bg-background/50 p-2">
              <b className="text-primary">Validation:</b> primary metric, controls, statistical
              approach
            </li>
            <li className="rounded border border-border/60 bg-background/50 p-2 md:col-span-2">
              <b className="text-primary">Lab Readiness Score + scientist feedback loop:</b> closes
              the corrections cycle locally
            </li>
          </ul>
        </Card>

        <LabReadinessCard report={labReadiness} variant="full" />

        <ScientistFeedbackPanel experimentType={deriveExperimentType(project)} compact />

        <TechStackPanel variant="compact" />

        <div className="flex flex-wrap items-center justify-center gap-3 pb-6">
          <Button variant="outline" onClick={onClose}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
          </Button>
          <Button onClick={onCopy}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? "Copied" : "Copy Pitch Summary"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ScoreCard({ label, value, helper }: { label: string; value: number; helper?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-primary/5 p-4" title={helper}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <div className="font-display text-2xl font-semibold text-primary">{value}</div>
        <div className="text-xs text-muted-foreground">/100</div>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-gradient-hero transition-all"
          style={{ width: `${value}%` }}
        />
      </div>
      {helper && (
        <div className="mt-1.5 text-[10px] leading-tight text-muted-foreground">{helper}</div>
      )}
    </div>
  );
}

function StatCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/50 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
      {helper && (
        <div className="mt-1.5 text-[10px] leading-tight text-muted-foreground">{helper}</div>
      )}
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h2 className="font-display text-2xl font-semibold tracking-tight">{title}</h2>
      <p className="text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function TabTrig({
  value,
  icon: Icon,
  children,
}: {
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <TabsTrigger
      value={value}
      className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm"
    >
      <Icon className="h-3.5 w-3.5" />
      {children}
    </TabsTrigger>
  );
}

function RiskBadge({ label, level }: { label: string; level: "low" | "medium" | "high" }) {
  const cls =
    level === "high"
      ? "bg-destructive/15 text-destructive"
      : level === "medium"
        ? "bg-warning/20 text-warning-foreground"
        : "bg-success/15 text-success";
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{label}:</span>
      <Badge className={cls} variant="secondary">
        {level}
      </Badge>
    </div>
  );
}

function RiskLevelBadge({ level, label }: { level: "low" | "medium" | "high"; label: string }) {
  const cls =
    level === "high"
      ? "bg-destructive/15 text-destructive"
      : level === "medium"
        ? "bg-warning/20 text-warning-foreground"
        : "bg-success/15 text-success";
  return (
    <Badge className={cls} variant="secondary">
      {label}: {level}
    </Badge>
  );
}

function slugify(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "research-plan"
  );
}

function deriveExperimentType(project: Project): string {
  const organism = project.organism?.split(/[(,]/)[0]?.trim();
  const domain = project.domain?.split(/[/,]/)[0]?.trim();
  // Prefer a concrete "<organism> <technique>" label when the title/hypothesis
  // makes the technique obvious (e.g. cryopreservation). This is what shows up
  // in the Scientist Review confirmation card.
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

function formatLivePlanAsMarkdown(project: Project, livePlan: LivePlanResponse): string {
  const L: string[] = [];
  const hr = () => L.push("\n---\n");
  const sourceRows = livePlan.source_status
    ? (["literature", "protocols", "materials"] as const).map((key) => {
        const row = livePlan.source_status![key];
        return `- **${key}:** ${row.label} (${row.coverage ?? "unknown"}) — ${row.reason}`;
      })
    : [];

  L.push(`# ${livePlan.project_summary.title || project.title}`);
  L.push(`\n_Generated by Hypothesis→Plan live pipeline · ${new Date().toLocaleDateString()}_`);
  L.push(`\n**Domain:** ${livePlan.project_summary.domain}`);
  if (livePlan.project_summary.organism_or_system) {
    L.push(`\n**System:** ${livePlan.project_summary.organism_or_system}`);
  }
  L.push(`\n## Hypothesis\n> ${livePlan.project_summary.hypothesis || project.hypothesis}`);

  hr();
  L.push(`## Source Status`);
  if (sourceRows.length) L.push(...sourceRows);
  L.push(`- **Fallback literature:** ${livePlan.warnings.uses_fallback_literature ? "yes" : "no"}`);
  L.push(`- **Fallback protocols:** ${livePlan.warnings.uses_fallback_protocols ? "yes" : "no"}`);
  L.push(
    `- **Unverified materials:** ${livePlan.warnings.has_unverified_materials ? "yes" : "no"}`,
  );
  if (livePlan.feedback_context) {
    L.push(
      `- **Scientist feedback memory:** ${livePlan.feedback_context.applied_count} correction(s) applied for ${livePlan.feedback_context.experiment_type}`,
    );
  }

  hr();
  L.push(`## Literature QC`);
  L.push(`- **Result:** ${livePlan.literature_qc.result}`);
  L.push(`- **Reason:** ${livePlan.literature_qc.reason}`);
  L.push(`- **Weak evidence:** ${livePlan.literature_qc.weak_evidence ? "yes" : "no"}`);

  hr();
  L.push(`## Evidence (${livePlan.evidence_map.length} sources)`);
  livePlan.evidence_map.forEach((e, i) => {
    L.push(`\n### ${i + 1}. ${e.title}`);
    L.push(`- Role: ${e.role}`);
    L.push(`- Source: ${e.source}`);
    L.push(`- Venue/year: ${e.venue || "unknown"} · ${e.year || "unknown"}`);
    L.push(`- Relevance: ${Math.round(e.relevance_score * 100)}%`);
    L.push(`- URL: ${e.source_url}`);
  });

  hr();
  L.push(`## Protocols (${livePlan.protocols.length})`);
  livePlan.protocols.forEach((p, i) => {
    L.push(`\n### ${i + 1}. ${p.title}`);
    L.push(`- Source: ${p.source}`);
    L.push(`- Authors: ${p.authors}`);
    L.push(`- Relevance: ${Math.round(p.relevance_score * 100)}%`);
    L.push(`- Matched keywords: ${p.matched_keywords.join(", ") || "none"}`);
    L.push(`- URL: ${p.url}`);
    L.push(`- Description: ${p.description}`);
  });

  hr();
  L.push(`## Materials & Budget`);
  L.push(
    `- **Verified subtotal:** $${livePlan.materials_budget.subtotal_verified.toLocaleString()}`,
  );
  L.push(`- **Budget cap:** $${livePlan.materials_budget.budget_cap.toLocaleString()}`);
  L.push(`- **Within budget:** ${livePlan.materials_budget.within_budget ? "yes" : "no"}`);
  L.push(`- **Source badge:** ${livePlan.materials_budget.source_badge}`);
  L.push(`\n| # | Item | Supplier | Catalog | Pack | Cost | Verified | Source |`);
  L.push(`|---|------|----------|---------|------|------|----------|--------|`);
  livePlan.materials_budget.items.forEach((m, i) => {
    L.push(
      `| ${i + 1} | ${m.name} | ${m.supplier} | ${m.catalog} | ${m.pack_size} | $${m.unit_cost.toLocaleString()} | ${m.verified ? "yes" : "no"} | ${m.source_url || "VERIFY_REQUIRED"} |`,
    );
  });

  hr();
  L.push(`## Timeline (${livePlan.timeline.length} weeks)`);
  livePlan.timeline.forEach((wk) => {
    L.push(`\n### Week ${wk.week} — ${wk.milestone} _(${wk.phase})_`);
    wk.tasks.forEach((t) => L.push(`- ${t}`));
    L.push(`_Deliverable:_ ${wk.deliverable}`);
  });

  hr();
  L.push(`## Validation Plan`);
  L.push(`\n**Primary metric:** ${livePlan.validation_plan.primary_metric.name}`);
  L.push(`- Target: ${livePlan.validation_plan.primary_metric.target}`);
  L.push(`- Method: ${livePlan.validation_plan.primary_metric.method}`);
  L.push(`\n**Secondary metrics:**`);
  livePlan.validation_plan.secondary_metrics.forEach((v) => {
    L.push(`- ${v.name} — target: ${v.target}; method: ${v.method}`);
  });
  L.push(`\n**Statistical approach:** ${livePlan.validation_plan.statistical_approach}`);
  L.push(`\n**Reproducibility checks:**`);
  livePlan.validation_plan.reproducibility_checks.forEach((c) => L.push(`- ${c}`));
  L.push(`\n**Positive control:** ${livePlan.validation_plan.positive_control}`);
  L.push(`\n**Negative control:** ${livePlan.validation_plan.negative_control}`);

  hr();
  L.push(`## Risks & Mitigations (${livePlan.risks.length})`);
  livePlan.risks.forEach((r) => {
    L.push(`\n### ${r.title} _(${r.category})_`);
    L.push(`- Likelihood: ${r.likelihood} · Impact: ${r.impact}`);
    L.push(`- **Mitigation:** ${r.mitigation}`);
  });

  hr();
  L.push(`## Scientist Review Questions`);
  livePlan.scientist_review_questions.forEach((q) => L.push(`- ${q}`));

  L.push(`\n---\n_End of live plan._`);
  return L.join("\n");
}

function formatPlanAsMarkdown(project: Project, plan: GeneratedPlan, totalBudget: number): string {
  const L: string[] = [];
  const hr = () => L.push("\n---\n");

  L.push(`# ${project.title}`);
  L.push(`\n_Generated by Hypothesis→Plan · ${new Date().toLocaleDateString()}_`);
  L.push(
    `\n**Domain:** ${project.domain}` +
      (project.organism ? ` · **System:** ${project.organism}` : ""),
  );
  L.push(`\n## Hypothesis\n> ${project.hypothesis}`);

  if (plan.problemStatement) L.push(`\n## Problem\n${plan.problemStatement}`);
  if (plan.whyItMatters) L.push(`\n## Why this matters\n${plan.whyItMatters}`);

  hr();
  L.push(`## Summary scores`);
  L.push(`- **Novelty Score:** ${plan.noveltyScore}/100`);
  L.push(`- **Feasibility Score:** ${plan.feasibilityScore}/100`);
  L.push(`- **Evidence Confidence:** ${plan.evidenceConfidence}/100`);
  L.push(`- **Estimated Cost:** $${totalBudget.toLocaleString()}`);
  L.push(`- **Estimated Duration:** ${plan.timeline.length} weeks`);

  if (plan.literatureQc) {
    hr();
    L.push(`## Literature QC`);
    L.push(`- **Result:** ${plan.literatureQc.result}`);
    L.push(`- **Reason:** ${plan.literatureQc.reason}`);
  }

  hr();
  L.push(`## Evidence — related work (${plan.papers.length} papers)`);
  plan.papers.forEach((p, i) => {
    const url =
      p.verification?.sourceUrl ?? (p.doi.startsWith("http") ? p.doi : `https://doi.org/${p.doi}`);
    L.push(`\n### ${i + 1}. ${p.title}`);
    L.push(`- _${p.authors} · ${p.venue} · ${p.year}_`);
    L.push(
      `- Relevance: ${Math.round(p.similarity * 100)}%${p.citations > 0 ? ` · Citations: ${p.citations}` : ""}`,
    );
    L.push(`- Source: ${url}`);
    L.push(
      `- **Verification:** \`${p.verification.status}\`${p.verification.note ? ` — ${p.verification.note}` : ""}`,
    );
    L.push(`- **Abstract:** ${p.abstract}`);
    L.push(`- **Why it matters:** ${p.whyItMatters}`);
  });

  hr();
  L.push(`## Novelty analysis`);
  L.push(`**Risk level:** ${plan.noveltyAnalysis.riskLevel}`);
  L.push(`\n**Rationale:** ${plan.noveltyRationale}`);
  L.push(`\n**What is already known:**`);
  plan.noveltyAnalysis.whatIsKnown.forEach((k) => L.push(`- ${k}`));
  L.push(`\n**What is missing:**`);
  plan.noveltyAnalysis.whatIsMissing.forEach((k) => L.push(`- ${k}`));
  L.push(`\n**Why this may be novel:** ${plan.noveltyAnalysis.whyNovel}`);
  L.push(`\n**Recommended refinement:** ${plan.noveltyAnalysis.refinement}`);

  hr();
  L.push(`## Experimental protocol (${plan.protocol.length} steps)`);
  plan.protocol.forEach((s) => {
    L.push(`\n### Step ${s.step} — ${s.title}  _(${s.phase} · ${s.duration})_`);
    L.push(s.description);
    if (s.equipment.length) L.push(`**Equipment:** ${s.equipment.join(", ")}`);
  });

  hr();
  L.push(`## Materials & budget`);
  L.push(
    `\n_Catalog numbers shown as \`VERIFY_REQUIRED\` must be replaced with confirmed vendor SKUs before ordering._`,
  );
  L.push(`\n| # | Item | Purpose | Supplier | Catalog | Qty | Unit | Total | Verification |`);
  L.push(`|---|------|---------|----------|---------|-----|------|-------|--------------|`);
  plan.materials.forEach((m, i) => {
    L.push(
      `| ${i + 1} | ${m.name} | ${m.purpose} | ${m.vendor} | ${m.catalog} | ${m.quantity} | $${m.unitCost.toLocaleString()} | $${m.total.toLocaleString()} | ${m.verification.status} |`,
    );
  });
  L.push(
    `\n**Grand total: $${totalBudget.toLocaleString()}**${plan.budgetSource ? ` _(budget source: ${plan.budgetSource.status})_` : ""}`,
  );

  hr();
  L.push(`## Timeline (${plan.timeline.length} weeks)`);
  plan.timeline.forEach((wk) => {
    L.push(`\n### Week ${wk.week} — ${wk.milestone}  _(${wk.phase})_`);
    wk.tasks.forEach((t) => L.push(`- ${t}`));
    L.push(`_Deliverable:_ ${wk.deliverable}`);
  });

  hr();
  L.push(`## Validation plan`);
  L.push(`\n**Primary metric:** ${plan.validation.primaryMetric.name}`);
  L.push(`- Target: ${plan.validation.primaryMetric.target}`);
  L.push(`- Method: ${plan.validation.primaryMetric.method}`);
  L.push(`\n**Secondary metrics:**`);
  plan.validation.secondaryMetrics.forEach((v) => {
    L.push(`- ${v.name} — target: ${v.target}; method: ${v.method}`);
  });
  L.push(`\n**Statistical approach:** ${plan.validation.statisticalApproach}`);
  L.push(`\n**Reproducibility checks:**`);
  plan.validation.reproducibilityChecks.forEach((c) => L.push(`- ${c}`));
  L.push(`\n**Positive control:** ${plan.validation.positiveControl}`);
  L.push(`\n**Negative control:** ${plan.validation.negativeControl}`);

  hr();
  L.push(`## Risks & mitigations (${plan.risks.length})`);
  plan.risks.forEach((r) => {
    L.push(`\n### ${r.title}  _(${r.category})_`);
    L.push(`- Likelihood: ${r.likelihood} · Impact: ${r.impact}`);
    L.push(`- **Mitigation:** ${r.mitigation}`);
  });

  L.push(`\n---\n_End of plan._`);
  return L.join("\n");
}
