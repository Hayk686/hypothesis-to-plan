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
  Calendar, CheckCircle2, ShieldAlert, Download, Quote,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  getProject, generatePlan, type Project, type GeneratedPlan,
} from "@/lib/mockData";

export const Route = createFileRoute("/project/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Project — Hypothesis→Plan` },
      { name: "description", content: `Experimental plan for project ${params.id}` },
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

  useEffect(() => {
    const p = getProject(id);
    if (!p) {
      throw notFound();
    }
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

  return (
    <div className="min-h-screen">
      <Header />
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Breadcrumb + actions */}
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link to="/projects" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 h-3 w-3" /> All projects
          </Link>
          <Button variant="outline" size="sm">
            <Download className="mr-2 h-4 w-4" /> Export plan
          </Button>
        </div>

        {/* Project header */}
        <Card className="mb-6 border-border/60 bg-gradient-card p-6 shadow-elegant">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline">{project.domain}</Badge>
                <Badge className="bg-success/15 text-success hover:bg-success/20">Plan ready</Badge>
              </div>
              <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-4xl">
                {project.title}
              </h1>
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-border/60 bg-muted/30 p-4">
                <Quote className="h-4 w-4 shrink-0 text-primary" />
                <p className="text-sm italic text-foreground/80">{project.hypothesis}</p>
              </div>
            </div>
          </div>

          {/* Stat strip */}
          <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard label="Novelty" value={`${plan.noveltyScore}/100`} accent />
            <StatCard label="Feasibility" value={`${feasibilityScore}/100`} accent />
            <StatCard label="Protocol steps" value={`${plan.protocol.length}`} />
            <StatCard label="Estimated cost" value={`$${(totalBudget / 1000).toFixed(1)}k`} />
            <StatCard label="Duration" value={`${plan.timeline.length} wks`} />
          </div>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="evidence" className="w-full">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-muted/50 p-1">
            <TabTrig value="evidence" icon={FileSearch}>Evidence</TabTrig>
            <TabTrig value="novelty" icon={Sparkles}>Novelty</TabTrig>
            <TabTrig value="protocol" icon={Beaker}>Protocol</TabTrig>
            <TabTrig value="materials" icon={ShoppingCart}>Materials & Budget</TabTrig>
            <TabTrig value="timeline" icon={Calendar}>Timeline</TabTrig>
            <TabTrig value="validation" icon={CheckCircle2}>Validation</TabTrig>
            <TabTrig value="risks" icon={ShieldAlert}>Risks</TabTrig>
          </TabsList>

          {/* EVIDENCE */}
          <TabsContent value="evidence" className="mt-6 space-y-4">
            <SectionHeader title="Related work" subtitle={`${plan.papers.length} papers ranked by semantic similarity`} />
            {plan.papers.map((paper) => (
              <Card key={paper.id} className="border-border/60 bg-gradient-card p-5 transition-smooth hover:border-primary/40">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <h4 className="font-display text-base font-semibold leading-snug">{paper.title}</h4>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {paper.authors} · <span className="italic">{paper.venue}</span> · {paper.year}
                    </div>
                    <p className="mt-3 text-sm text-foreground/80">{paper.abstract}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <Badge variant="secondary" className="bg-primary/10 text-primary">
                      {Math.round(paper.similarity * 100)}% match
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
                  <h3 className="font-display text-xl font-semibold">Why this score?</h3>
                  <p className="mt-2 text-muted-foreground">{plan.noveltyRationale}</p>
                </div>
              </div>
            </Card>
            <Card className="border-border/60 bg-gradient-card p-6">
              <h3 className="mb-2 font-display text-lg font-semibold">Research gap</h3>
              <p className="text-foreground/80">{plan.researchGap}</p>
            </Card>
            <div className="grid gap-3 md:grid-cols-3">
              <MiniStat label="Comparable papers" value={`${plan.papers.length}`} sub="last 5 years" />
              <MiniStat label="Top similarity" value={`${Math.round(Math.max(...plan.papers.map(p => p.similarity)) * 100)}%`} sub="closest match" />
              <MiniStat label="Avg citations" value={`${Math.round(plan.papers.reduce((s, p) => s + p.citations, 0) / plan.papers.length)}`} sub="across cohort" />
            </div>
          </TabsContent>

          {/* PROTOCOL */}
          <TabsContent value="protocol" className="mt-6 space-y-4">
            <SectionHeader title="Experimental protocol" subtitle={`${plan.protocol.length} sequential phases`} />
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
                      </div>
                      <p className="mt-1.5 text-sm text-foreground/80">{step.description}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {step.equipment.map((e) => (
                          <Badge key={e} variant="secondary" className="text-xs font-mono">{e}</Badge>
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
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Total</div>
                <div className="font-display text-3xl font-bold text-primary">${totalBudget.toLocaleString()}</div>
              </div>
            </div>
            <Card className="overflow-hidden border-border/60 bg-card p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Catalog</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead className="text-right">Unit</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.materials.map((m, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="font-medium">{m.name}</div>
                        <Badge variant="outline" className="mt-1 text-[10px]">{m.category}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{m.vendor}</TableCell>
                      <TableCell className="font-mono text-xs">{m.catalog}</TableCell>
                      <TableCell className="text-sm">{m.quantity}</TableCell>
                      <TableCell className="text-right font-mono text-sm">${m.unitCost.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-sm font-semibold">${m.total.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/40">
                    <TableCell colSpan={5} className="text-right font-semibold">Grand total</TableCell>
                    <TableCell className="text-right font-mono text-lg font-bold text-primary">
                      ${totalBudget.toLocaleString()}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* TIMELINE */}
          <TabsContent value="timeline" className="mt-6 space-y-4">
            <SectionHeader title="Week-by-week timeline" subtitle={`${plan.timeline.length} weeks · ${new Set(plan.timeline.map(t => t.phase)).size} phases`} />
            <div className="relative">
              <div className="absolute bottom-0 left-6 top-0 w-0.5 bg-gradient-to-b from-primary via-primary/40 to-transparent" />
              <div className="space-y-3">
                {plan.timeline.map((wk) => (
                  <Card key={wk.week} className="ml-12 border-border/60 bg-gradient-card p-4 transition-smooth hover:border-primary/40">
                    <div className="absolute -ml-[3.4rem] flex h-10 w-10 items-center justify-center rounded-full border-2 border-background bg-gradient-hero font-mono text-xs font-bold text-primary-foreground shadow-md">
                      W{wk.week}
                    </div>
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
                ))}
              </div>
            </div>
          </TabsContent>

          {/* VALIDATION */}
          <TabsContent value="validation" className="mt-6 space-y-4">
            <SectionHeader title="Validation plan" subtitle="Pre-defined pass criteria & methods" />
            <Card className="overflow-hidden border-border/60 bg-card p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Metric</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Pass criteria</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {plan.validation.map((v, i) => (
                    <TableRow key={i}>
                      <TableCell><Badge variant="outline">{v.category}</Badge></TableCell>
                      <TableCell className="font-medium">{v.metric}</TableCell>
                      <TableCell className="font-mono text-sm text-primary">{v.target}</TableCell>
                      <TableCell className="text-sm">{v.method}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{v.passCriteria}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>

          {/* RISKS */}
          <TabsContent value="risks" className="mt-6 space-y-4">
            <SectionHeader title="Risks & mitigations" subtitle={`${plan.risks.length} identified risks`} />
            <div className="grid gap-3 md:grid-cols-2">
              {plan.risks.map((r) => (
                <Card key={r.id} className="border-border/60 bg-gradient-card p-5">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h4 className="font-display font-semibold leading-tight">{r.title}</h4>
                    <Badge variant="outline" className="shrink-0 text-xs">{r.category}</Badge>
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

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border border-border/60 p-4 ${accent ? "bg-primary/5" : "bg-background/50"}`}>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 font-display text-2xl font-semibold ${accent ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="border-border/60 bg-gradient-card p-5">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </Card>
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
      <Badge className={`${cls} hover:${cls}`} variant="secondary">{level}</Badge>
    </div>
  );
}
