import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, ExternalLink, Sparkles, FileSearch, Beaker, ShoppingCart,
  Calendar, CheckCircle2, ShieldAlert, Download, Quote, Presentation,
  Lightbulb, AlertCircle, Target, Copy, Check,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getProject, generatePlan, CATALOG_VERIFY_REQUIRED,
  type Project, type GeneratedPlan,
} from "@/lib/mockData";
import { VerificationBadge } from "@/components/VerificationBadge";

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
        <Button asChild className="mt-6"><Link to="/projects">Back to projects</Link></Button>
      </div>
    </div>
  ),
});

function ProjectPage() {
  const { id } = Route.useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const p = getProject(id);
    if (!p) throw notFound();
    setProject(p);
    setPlan(generatePlan(p));
  }, [id]);

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

  const totalBudget = plan.materials.reduce((s, m) => s + m.total, 0);
  const planText = formatPlanAsMarkdown(project, plan, totalBudget);

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
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link to="/projects" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 h-3 w-3" /> All projects
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/project/$id/present" params={{ id: project.id }}>
                <Presentation className="mr-2 h-4 w-4" /> Judge view
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? <Check className="mr-2 h-4 w-4 text-success" /> : <Copy className="mr-2 h-4 w-4" />}
              {copied ? "Copied" : "Copy plan"}
            </Button>
            <Button size="sm" onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" /> Export .md
            </Button>
          </div>
        </div>

        {/* Project header */}
        <Card className="mb-6 border-border/60 bg-gradient-card p-6 shadow-elegant">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{project.domain}</Badge>
                {project.organism && <Badge variant="outline" className="bg-accent/30">{project.organism}</Badge>}
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
                      <span className="font-mono uppercase tracking-wider text-foreground/60">Resources</span>
                      <div className="mt-0.5 text-foreground/75">{project.resources}</div>
                    </div>
                  )}
                  {project.constraints && (
                    <div className="rounded-md border border-border/60 bg-background/40 p-2.5">
                      <span className="font-mono uppercase tracking-wider text-foreground/60">Constraints</span>
                      <div className="mt-0.5 text-foreground/75">{project.constraints}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Top summary cards */}
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            <ScoreCard label="Novelty Score" value={plan.noveltyScore} helper="How original vs. published corpus" />
            <ScoreCard label="Feasibility Score" value={plan.feasibilityScore} helper="Plan realism given budget & time" />
            <ScoreCard label="Evidence Confidence" value={plan.evidenceConfidence} helper="Strength of supporting literature" />
            <StatCard label="Estimated Cost" value={`$${(totalBudget / 1000).toFixed(1)}k`} helper={`${plan.materials.length} line items`} />
            <StatCard label="Estimated Duration" value={`${plan.timeline.length} wks`} helper={`${plan.protocol.length} protocol phases`} />
          </div>

          {/* Verification banner */}
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs">
            <VerificationBadge verification={{ status: "pending" }} />
            <span className="text-foreground/80">
              Demo data is seeded for layout — every literature reference, protocol source, and catalog number is marked
              <span className="font-mono"> pending verification</span> until a real source is attached.
            </span>
          </div>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="evidence" className="w-full">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
            <TabTrig value="evidence" icon={FileSearch}>Evidence</TabTrig>
            <TabTrig value="novelty" icon={Sparkles}>Novelty Analysis</TabTrig>
            <TabTrig value="protocol" icon={Beaker}>Protocol</TabTrig>
            <TabTrig value="materials" icon={ShoppingCart}>Materials & Budget</TabTrig>
            <TabTrig value="timeline" icon={Calendar}>Timeline</TabTrig>
            <TabTrig value="validation" icon={CheckCircle2}>Validation</TabTrig>
            <TabTrig value="risks" icon={ShieldAlert}>Risks</TabTrig>
          </TabsList>

          {/* EVIDENCE */}
          <TabsContent value="evidence" className="mt-6 space-y-4">
            <SectionHeader
              title="Related work"
              subtitle={`${plan.papers.length} papers from Semantic Scholar (mock) ranked by relevance`}
            />
            {plan.papers.map((paper) => (
              <Card key={paper.id} className="border-border/60 bg-gradient-card p-5 transition-smooth hover:border-primary/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-display text-base font-semibold leading-snug">{paper.title}</h4>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {paper.authors} · <span className="italic">{paper.venue}</span> · {paper.year}
                    </div>
                    <p className="mt-3 text-sm text-foreground/80">{paper.abstract}</p>
                    <div className="mt-3 rounded-md border-l-2 border-primary/60 bg-primary/5 p-3">
                      <div className="flex items-start gap-2">
                        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                        <div>
                          <div className="font-mono text-[10px] uppercase tracking-wider text-primary">Why it matters</div>
                          <div className="text-sm text-foreground/85">{paper.whyItMatters}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge variant="secondary" className="bg-primary/10 text-primary">
                      {Math.round(paper.similarity * 100)}% relevance
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">{paper.citations} cites</span>
                    <a
                      href={`https://doi.org/${paper.doi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center text-xs text-primary hover:underline"
                    >
                      DOI <ExternalLink className="ml-1 h-3 w-3" />
                    </a>
                    <VerificationBadge verification={paper.verification} />
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>

          {/* NOVELTY */}
          <TabsContent value="novelty" className="mt-6 space-y-4">
            <Card className="border-border/60 bg-gradient-card p-8 shadow-elegant">
              <div className="flex flex-wrap items-center gap-8">
                <div className="relative flex h-40 w-40 shrink-0 items-center justify-center">
                  <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" stroke="currentColor" strokeWidth="8" fill="none" className="text-muted" />
                    <circle
                      cx="50" cy="50" r="42" stroke="url(#grad)" strokeWidth="8" fill="none"
                      strokeDasharray={`${(plan.noveltyScore / 100) * 264} 264`}
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
                    <div className="font-display text-4xl font-bold text-primary">{plan.noveltyScore}</div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Novelty</div>
                  </div>
                </div>
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-2">
                    <h3 className="font-display text-xl font-semibold">Why this score?</h3>
                    <RiskLevelBadge level={plan.noveltyAnalysis.riskLevel} label="Novelty risk" />
                  </div>
                  <p className="mt-1 text-muted-foreground">{plan.noveltyRationale}</p>
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
                  {plan.noveltyAnalysis.whatIsKnown.map((k, i) => (
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
                  <h3 className="font-display text-base font-semibold">What is missing in the literature</h3>
                </div>
                <ul className="space-y-2 text-sm">
                  {plan.noveltyAnalysis.whatIsMissing.map((k, i) => (
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
                <h3 className="font-display text-base font-semibold">Why this hypothesis may be novel</h3>
              </div>
              <p className="text-foreground/80">{plan.noveltyAnalysis.whyNovel}</p>
            </Card>

            <Card className="border-primary/30 bg-primary/5 p-6">
              <div className="mb-2 flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <h3 className="font-display text-base font-semibold text-primary">Recommended refinement</h3>
              </div>
              <p className="text-foreground/85">{plan.noveltyAnalysis.refinement}</p>
            </Card>
          </TabsContent>

          {/* PROTOCOL */}
          <TabsContent value="protocol" className="mt-6 space-y-4">
            <SectionHeader title="Experimental protocol" subtitle={`${plan.protocol.length} phases — preparation through expected outputs`} />
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
                        <Badge variant="outline" className="text-xs">{step.phase}</Badge>
                        <span className="text-xs text-muted-foreground">· {step.duration}</span>
                        <VerificationBadge verification={step.protocolSource} compact />
                      </div>
                      <p className="mt-1.5 text-sm text-foreground/80">{step.description}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {step.equipment.map((e) => (
                          <Badge key={e} variant="secondary" className="font-mono text-xs">{e}</Badge>
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
            <div className="flex items-end justify-between">
              <SectionHeader title="Materials & budget" subtitle={`${plan.materials.length} line items`} />
              <div className="text-right">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Total estimated cost</div>
                <div className="font-display text-3xl font-bold text-primary">${totalBudget.toLocaleString()}</div>
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
                            <Badge variant="outline" className="mt-1 text-[10px]">{m.category}</Badge>
                          </TableCell>
                          <TableCell className="max-w-xs text-sm text-muted-foreground">{m.purpose}</TableCell>
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
                            ) : (
                              <div className="font-mono text-xs text-muted-foreground">{m.catalog}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{m.quantity}</TableCell>
                          <TableCell className="text-right font-mono text-sm">${m.unitCost.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-semibold">${m.total.toLocaleString()}</TableCell>
                          <TableCell><VerificationBadge verification={m.verification} compact /></TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/40">
                      <TableCell colSpan={5} className="text-right font-semibold">Grand total</TableCell>
                      <TableCell className="text-right font-mono text-lg font-bold text-primary">
                        ${totalBudget.toLocaleString()}
                      </TableCell>
                      <TableCell><VerificationBadge verification={plan.budgetSource} compact /></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </Card>
          </TabsContent>

          {/* TIMELINE */}
          <TabsContent value="timeline" className="mt-6 space-y-4">
            <SectionHeader title="Week-by-week timeline" subtitle={`${plan.timeline.length} weeks · ${new Set(plan.timeline.map((t) => t.phase)).size} phases`} />
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
                        <Badge variant="outline" className="text-xs">{wk.phase}</Badge>
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
                        <span className="font-mono uppercase tracking-wider">Deliverable:</span> {wk.deliverable}
                      </div>
                    </Card>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* VALIDATION */}
          <TabsContent value="validation" className="mt-6 space-y-4">
            <SectionHeader title="Validation plan" subtitle="Primary endpoint, secondary metrics, statistical approach, controls, reproducibility" />

            <Card className="border-primary/30 bg-primary/5 p-6">
              <div className="mb-2 flex items-center gap-2">
                <Target className="h-4 w-4 text-primary" />
                <h3 className="font-display text-base font-semibold text-primary">Primary success metric</h3>
              </div>
              <div className="font-medium">{plan.validation.primaryMetric.name}</div>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-border/60 bg-background/60 p-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Target</div>
                  <div className="mt-0.5 font-mono text-primary">{plan.validation.primaryMetric.target}</div>
                </div>
                <div className="rounded-md border border-border/60 bg-background/60 p-3">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Method</div>
                  <div className="mt-0.5 text-sm">{plan.validation.primaryMetric.method}</div>
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
                  {plan.validation.secondaryMetrics.map((v, i) => (
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
                <p className="text-sm text-foreground/80">{plan.validation.statisticalApproach}</p>
              </Card>
              <Card className="border-border/60 bg-gradient-card p-6">
                <h3 className="mb-2 font-display text-base font-semibold">Reproducibility checks</h3>
                <ul className="space-y-2 text-sm">
                  {plan.validation.reproducibilityChecks.map((c, i) => (
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
                <Badge className="mb-2 bg-success/15 text-success hover:bg-success/20">Positive control</Badge>
                <p className="text-sm text-foreground/85">{plan.validation.positiveControl}</p>
              </Card>
              <Card className="border-muted/50 bg-muted/20 p-5">
                <Badge variant="outline" className="mb-2">Negative control</Badge>
                <p className="text-sm text-foreground/85">{plan.validation.negativeControl}</p>
              </Card>
            </div>
          </TabsContent>

          {/* RISKS */}
          <TabsContent value="risks" className="mt-6 space-y-4">
            <SectionHeader title="Risks & mitigations" subtitle={`${plan.risks.length} risks across scientific, operational, budget, and ethical/safety categories`} />
            <div className="grid gap-3 md:grid-cols-2">
              {plan.risks.map((r) => (
                <Card key={r.id} className="border-border/60 bg-gradient-card p-5">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h4 className="font-display font-semibold leading-tight">{r.title}</h4>
                    <Badge variant="outline" className="shrink-0 text-xs capitalize">{r.category}</Badge>
                  </div>
                  <div className="mb-3 flex gap-2">
                    <RiskBadge label="Likelihood" level={r.likelihood} />
                    <RiskBadge label="Impact" level={r.impact} />
                  </div>
                  <div className="rounded-md border border-border/60 bg-muted/30 p-3 text-sm">
                    <span className="font-mono text-xs uppercase tracking-wider text-primary">Mitigation</span>
                    <p className="mt-1 text-foreground/80">{r.mitigation}</p>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>
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
        <div className="h-full rounded-full bg-gradient-hero transition-all" style={{ width: `${value}%` }} />
      </div>
      {helper && <div className="mt-1.5 text-[10px] leading-tight text-muted-foreground">{helper}</div>}
    </div>
  );
}

function StatCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/50 p-4">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
      {helper && <div className="mt-1.5 text-[10px] leading-tight text-muted-foreground">{helper}</div>}
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
  value, icon: Icon, children,
}: { value: string; icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <TabsTrigger value={value} className="gap-1.5 data-[state=active]:bg-background data-[state=active]:shadow-sm">
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
      <Badge className={cls} variant="secondary">{level}</Badge>
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
  return <Badge className={cls} variant="secondary">{label}: {level}</Badge>;
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "research-plan";
}

function formatPlanAsMarkdown(project: Project, plan: GeneratedPlan, totalBudget: number): string {
  const L: string[] = [];
  const hr = () => L.push("\n---\n");

  L.push(`# ${project.title}`);
  L.push(`\n_Generated by Hypothesis→Plan · ${new Date().toLocaleDateString()}_`);
  L.push(`\n**Domain:** ${project.domain}` + (project.organism ? ` · **System:** ${project.organism}` : ""));
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

  hr();
  L.push(`## Evidence — related work (${plan.papers.length} papers)`);
  plan.papers.forEach((p, i) => {
    L.push(`\n### ${i + 1}. ${p.title}`);
    L.push(`- _${p.authors} · ${p.venue} · ${p.year}_`);
    L.push(`- Relevance: ${Math.round(p.similarity * 100)}% · Citations: ${p.citations} · DOI: ${p.doi}`);
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
  L.push(`\n| # | Item | Purpose | Supplier | Catalog | Qty | Unit | Total |`);
  L.push(`|---|------|---------|----------|---------|-----|------|-------|`);
  plan.materials.forEach((m, i) => {
    L.push(`| ${i + 1} | ${m.name} | ${m.purpose} | ${m.vendor} | ${m.catalog} | ${m.quantity} | $${m.unitCost.toLocaleString()} | $${m.total.toLocaleString()} |`);
  });
  L.push(`\n**Grand total: $${totalBudget.toLocaleString()}**`);

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
