import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { ArrowLeft, FlaskConical, Quote, Sparkles, Target, Calendar, DollarSign, Heart } from "lucide-react";
import { getProject, generatePlan, type Project, type GeneratedPlan } from "@/lib/mockData";

export const Route = createFileRoute("/project/$id/present")({
  head: () => ({
    meta: [
      { title: "Judge Presentation — Hypothesis→Plan" },
      { name: "description", content: "Single-page summary of the experimental plan." },
    ],
  }),
  component: PresentPage,
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center">
      <p>Project not found.</p>
    </div>
  ),
});

function PresentPage() {
  const { id } = Route.useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [plan, setPlan] = useState<GeneratedPlan | null>(null);

  useEffect(() => {
    const p = getProject(id);
    if (!p) throw notFound();
    setProject(p);
    setPlan(generatePlan(p));
  }, [id]);

  if (!project || !plan) return null;

  const totalBudget = plan.materials.reduce((s, m) => s + m.total, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Slim header */}
      <div className="border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/project/$id" params={{ id: project.id }} className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="mr-1 h-3 w-3" /> Back to dashboard
          </Link>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-hero">
              <FlaskConical className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display text-sm font-semibold">Hypothesis<span className="text-primary">→</span>Plan</span>
            <Badge variant="outline" className="ml-2 text-[10px]">Judge view</Badge>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-12">
        {/* Hero */}
        <div className="mb-10">
          <Badge variant="outline" className="mb-3">{project.domain}</Badge>
          <h1 className="font-display text-4xl font-bold leading-tight tracking-tight md:text-5xl">
            {project.title}
          </h1>
        </div>

        {/* Problem + Hypothesis */}
        <div className="mb-8 grid gap-5 md:grid-cols-2">
          <Card className="border-border/60 bg-gradient-card p-6">
            <Badge className="mb-3 bg-warning/20 text-warning-foreground hover:bg-warning/30">Problem</Badge>
            <p className="text-base leading-relaxed text-foreground/85">{plan.problemStatement}</p>
          </Card>
          <Card className="border-primary/30 bg-primary/5 p-6">
            <Badge className="mb-3 bg-primary/15 text-primary hover:bg-primary/20">Hypothesis</Badge>
            <div className="flex items-start gap-2">
              <Quote className="h-4 w-4 shrink-0 text-primary" />
              <p className="text-base leading-relaxed italic text-foreground/85">{project.hypothesis}</p>
            </div>
          </Card>
        </div>

        {/* Big number row */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <BigStat icon={Sparkles} label="Novelty" value={`${plan.noveltyScore}/100`} />
          <BigStat icon={Target} label="Feasibility" value={`${plan.feasibilityScore}/100`} />
          <BigStat icon={DollarSign} label="Estimated cost" value={`$${(totalBudget / 1000).toFixed(1)}k`} />
          <BigStat icon={Calendar} label="Duration" value={`${plan.timeline.length} weeks`} />
        </div>

        {/* Protocol summary */}
        <Card className="mb-8 border-border/60 bg-gradient-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold tracking-tight">Protocol summary</h2>
            <Badge variant="outline">{plan.protocol.length} phases</Badge>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {plan.protocol.map((s) => (
              <div key={s.step} className="flex gap-3 rounded-lg border border-border/60 bg-background/50 p-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-gradient-hero font-mono text-xs font-bold text-primary-foreground">
                  {s.step}
                </div>
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <div className="font-medium leading-tight">{s.title}</div>
                    <span className="font-mono text-[10px] text-muted-foreground">{s.duration}</span>
                  </div>
                  <div className="mt-0.5 text-xs uppercase tracking-wider text-primary">{s.phase}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Timeline strip */}
        <Card className="mb-8 border-border/60 bg-gradient-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-display text-2xl font-semibold tracking-tight">Timeline</h2>
            <Badge variant="outline">{plan.timeline.length} weeks</Badge>
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${plan.timeline.length}, minmax(0, 1fr))` }}>
            {plan.timeline.map((wk) => (
              <div key={wk.week} className="rounded-md border border-border/60 bg-background/50 p-2 text-center">
                <div className="font-mono text-[10px] text-muted-foreground">W{wk.week}</div>
                <div className="mt-1 text-[11px] font-medium leading-tight">{wk.phase}</div>
              </div>
            ))}
          </div>
          <ol className="mt-4 space-y-1 text-sm text-foreground/80">
            {plan.timeline.map((wk) => (
              <li key={wk.week} className="flex gap-2">
                <span className="font-mono text-xs text-muted-foreground">W{wk.week}</span>
                <span className="font-medium">{wk.milestone}</span>
                <span className="text-muted-foreground">— {wk.deliverable}</span>
              </li>
            ))}
          </ol>
        </Card>

        {/* Why this matters */}
        <Card className="mb-8 border-primary/30 bg-gradient-hero p-8 text-primary-foreground shadow-glow">
          <div className="mb-2 flex items-center gap-2">
            <Heart className="h-5 w-5" />
            <h2 className="font-display text-2xl font-semibold tracking-tight">Why this matters</h2>
          </div>
          <p className="text-lg leading-relaxed">{plan.whyItMatters}</p>
        </Card>

        <div className="text-center text-xs text-muted-foreground">
          Generated by Hypothesis→Plan · Mock data · Hackathon demo
        </div>
      </div>
    </div>
  );
}

function BigStat({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <Card className="border-border/60 bg-gradient-card p-5">
      <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 font-display text-3xl font-bold text-primary">{value}</div>
    </Card>
  );
}
