import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  FlaskConical,
  Quote,
  Sparkles,
  Target,
  Calendar,
  DollarSign,
  Heart,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  ListChecks,
  Beaker,
  ClipboardList,
} from "lucide-react";
import {
  getProject,
  generatePlan,
  type Project,
  type GeneratedPlan,
} from "@/lib/mockData";

export const Route = createFileRoute("/project/$id/present")({
  head: () => ({
    meta: [
      { title: "Judge Presentation — Hypothesis→Plan" },
      {
        name: "description",
        content: "One-page judge summary of the experimental plan.",
      },
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
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const p = getProject(id);
    if (!p) throw notFound();
    setProject(p);
    setPlan(generatePlan(p));
  }, [id]);

  const totalBudget = useMemo(
    () => (plan ? plan.materials.reduce((s, m) => s + m.total, 0) : 0),
    [plan],
  );

  const topPapers = useMemo(
    () => (plan ? plan.papers.slice(0, 3) : []),
    [plan],
  );

  const topSupplies = useMemo(
    () => (plan ? plan.materials.slice(0, 5) : []),
    [plan],
  );

  function handleCopyPitch() {
    if (!project || !plan) return;
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
    topPapers.forEach((p, i) => {
      const url = p.verification.sourceUrl ?? p.doi;
      lines.push(`${i + 1}. ${p.title} (${p.year})`);
      lines.push(`   ${url}`);
    });
    lines.push(``);
    lines.push(`PROTOCOL SUMMARY (${plan.protocol.length} phases):`);
    plan.protocol.forEach((s) => {
      lines.push(`  ${s.step}. [${s.phase}] ${s.title} — ${s.duration}`);
    });
    lines.push(``);
    lines.push(`SUPPLIES (top items, verify catalog # before ordering):`);
    topSupplies.forEach((m) => {
      lines.push(`  • ${m.name} — ${m.vendor} — Cat# ${m.catalog} — $${m.total}`);
    });
    lines.push(``);
    lines.push(`BUDGET: ~$${totalBudget.toLocaleString()} total`);
    lines.push(`TIMELINE: ${plan.timeline.length} weeks`);
    lines.push(`KEY DEPENDENCIES:`);
    plan.timeline.slice(0, 4).forEach((wk) => {
      lines.push(`  W${wk.week} (${wk.phase}) → ${wk.milestone}: ${wk.deliverable}`);
    });
    lines.push(``);
    lines.push(`VALIDATION SUCCESS METRIC:`);
    lines.push(`  ${plan.validation.primaryMetric.name}`);
    lines.push(`  Target: ${plan.validation.primaryMetric.target}`);
    lines.push(`  Method: ${plan.validation.primaryMetric.method}`);
    lines.push(``);
    lines.push(`WHY IT MATTERS:`);
    lines.push(plan.whyItMatters);

    navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!project || !plan) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
          <p className="mt-3 text-sm text-muted-foreground">
            Loading presentation…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Slim header */}
      <div className="sticky top-0 z-20 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-gradient-hero">
              <FlaskConical className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-display text-sm font-semibold">
              Hypothesis<span className="text-primary">→</span>Plan
            </span>
            <Badge variant="outline" className="ml-2 text-[10px]">
              Judge view
            </Badge>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/project/$id" params={{ id: project.id }}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to dashboard
              </Link>
            </Button>
            <Button size="sm" onClick={handleCopyPitch}>
              {copied ? (
                <Check className="mr-2 h-4 w-4" />
              ) : (
                <Copy className="mr-2 h-4 w-4" />
              )}
              {copied ? "Copied" : "Copy Pitch Summary"}
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-10">
        {/* Hero */}
        <div className="mb-8">
          <Badge variant="outline" className="mb-3">
            Hypothesis-to-Plan Core · {project.domain}
          </Badge>
          <h1 className="font-display text-3xl font-bold leading-tight tracking-tight md:text-5xl">
            {project.title}
          </h1>
        </div>

        {/* Hypothesis */}
        <Card className="mb-6 border-primary/30 bg-primary/5 p-6">
          <Badge className="mb-3 bg-primary/15 text-primary hover:bg-primary/20">
            Demo hypothesis
          </Badge>
          <div className="flex items-start gap-2">
            <Quote className="h-4 w-4 shrink-0 text-primary" />
            <p className="text-base italic leading-relaxed text-foreground/85 md:text-lg">
              {project.hypothesis}
            </p>
          </div>
        </Card>

        {/* Big number row */}
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          <BigStat
            icon={Sparkles}
            label="Novelty"
            value={`${plan.noveltyScore}/100`}
          />
          <BigStat
            icon={Target}
            label="Feasibility"
            value={`${plan.feasibilityScore}/100`}
          />
          <BigStat
            icon={DollarSign}
            label="Estimated cost"
            value={`$${(totalBudget / 1000).toFixed(1)}k`}
          />
          <BigStat
            icon={Calendar}
            label="Duration"
            value={`${plan.timeline.length} weeks`}
          />
        </div>

        {/* Literature QC */}
        {plan.literatureQc && (
          <Card className="mb-6 border-border/60 bg-gradient-card p-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" />
                <h2 className="font-display text-2xl font-semibold tracking-tight">
                  Literature QC
                </h2>
              </div>
              <Badge className="bg-primary/15 text-primary hover:bg-primary/20">
                Novelty signal: {plan.literatureQc.result}
              </Badge>
            </div>
            <p className="mb-4 text-sm leading-relaxed text-foreground/80">
              {plan.literatureQc.reason}
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              {topPapers.map((p) => {
                const url = p.verification.sourceUrl ?? p.doi;
                return (
                  <a
                    key={p.id}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group rounded-lg border border-border/60 bg-background/50 p-3 transition-colors hover:border-primary/40 hover:bg-background"
                  >
                    <div className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wider text-primary">
                      Evidence · {p.year}
                      <ExternalLink className="h-3 w-3 opacity-60 transition-opacity group-hover:opacity-100" />
                    </div>
                    <div className="line-clamp-3 text-sm font-medium leading-snug">
                      {p.title}
                    </div>
                    <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">
                      {p.venue}
                    </div>
                  </a>
                );
              })}
            </div>
          </Card>
        )}

        {/* Experiment plan summary */}
        <Card className="mb-6 border-border/60 bg-gradient-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              Experiment plan summary
            </h2>
          </div>

          {/* Protocol */}
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Protocol
              </h3>
              <Badge variant="outline" className="text-[10px]">
                {plan.protocol.length} phases
              </Badge>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              {plan.protocol.map((s) => (
                <div
                  key={s.step}
                  className="flex gap-3 rounded-lg border border-border/60 bg-background/50 p-3"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-hero font-mono text-xs font-bold text-primary-foreground">
                    {s.step}
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium leading-tight">
                      {s.title}
                    </div>
                    <div className="mt-0.5 text-[10px] uppercase tracking-wider text-primary">
                      {s.phase} · {s.duration}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Supplies */}
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Key supplies & catalog numbers
              </h3>
              <Badge variant="outline" className="text-[10px]">
                Verify before ordering
              </Badge>
            </div>
            <div className="overflow-hidden rounded-lg border border-border/60">
              <table className="w-full text-sm">
                <thead className="bg-background/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 font-medium">Vendor</th>
                    <th className="px-3 py-2 font-medium">Catalog #</th>
                    <th className="px-3 py-2 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {topSupplies.map((m, i) => {
                    const url = m.verification.sourceUrl;
                    return (
                      <tr
                        key={i}
                        className="border-t border-border/60 bg-background/30"
                      >
                        <td className="px-3 py-2 font-medium">{m.name}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {m.vendor}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {url ? (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-primary hover:underline"
                            >
                              {m.catalog}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : (
                            m.catalog
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          ${m.total}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border/60 bg-background/60">
                    <td
                      colSpan={3}
                      className="px-3 py-2 text-right text-xs uppercase tracking-wider text-muted-foreground"
                    >
                      Total estimated budget
                    </td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-primary">
                      ${totalBudget.toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Timeline + dependencies */}
          <div className="mb-6">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Timeline & key dependencies
              </h3>
              <Badge variant="outline" className="text-[10px]">
                {plan.timeline.length} weeks
              </Badge>
            </div>
            <ol className="space-y-1.5 text-sm text-foreground/80">
              {plan.timeline.map((wk) => (
                <li
                  key={wk.week}
                  className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-md border border-border/60 bg-background/40 px-3 py-2"
                >
                  <span className="font-mono text-xs text-primary">
                    W{wk.week}
                  </span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {wk.phase}
                  </span>
                  <span className="font-medium">{wk.milestone}</span>
                  <span className="text-muted-foreground">
                    — {wk.deliverable}
                  </span>
                </li>
              ))}
            </ol>
          </div>

          {/* Validation success metric */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Validation success metric
              </h3>
            </div>
            <div className="rounded-lg border border-success/30 bg-success/5 p-4">
              <div className="font-medium">
                {plan.validation.primaryMetric.name}
              </div>
              <div className="mt-1 text-sm text-foreground/80">
                <span className="font-semibold text-success">Target:</span>{" "}
                {plan.validation.primaryMetric.target}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                <span className="font-semibold">Method:</span>{" "}
                {plan.validation.primaryMetric.method}
              </div>
            </div>
          </div>
        </Card>

        {/* Why this matches Challenge 4 */}
        <Card className="mb-6 border-primary/30 bg-gradient-card p-6">
          <div className="mb-4 flex items-center gap-2">
            <ListChecks className="h-5 w-5 text-primary" />
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              Why this matches Challenge 4
            </h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <ChallengeRow
              icon={Quote}
              label="Input"
              value="Plain-language hypothesis from the scientist."
            />
            <ChallengeRow
              icon={Sparkles}
              label="Literature QC"
              value="Novelty signal + clickable evidence references."
            />
            <ChallengeRow
              icon={Beaker}
              label="Experiment Plan"
              value="Protocol, materials, budget, timeline, validation."
            />
            <ChallengeRow
              icon={ClipboardList}
              label="Operational realism"
              value="Real suppliers, catalog numbers, week-by-week dependencies."
            />
            <ChallengeRow
              icon={Heart}
              label="Stretch potential"
              value="Scientist review feedback loop on each evidence + supply card."
            />
            <ChallengeRow
              icon={CheckCircle2}
              label="Verifiability"
              value="Every external source carries a verification stamp + URL."
            />
          </div>
        </Card>

        {/* Why this matters */}
        <Card className="mb-8 border-primary/30 bg-gradient-hero p-8 text-primary-foreground shadow-glow">
          <div className="mb-2 flex items-center gap-2">
            <Heart className="h-5 w-5" />
            <h2 className="font-display text-2xl font-semibold tracking-tight">
              Why this matters
            </h2>
          </div>
          <p className="text-base leading-relaxed md:text-lg">
            {plan.whyItMatters}
          </p>
        </Card>

        {/* Bottom actions */}
        <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
          <Button asChild variant="outline">
            <Link to="/project/$id" params={{ id: project.id }}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
            </Link>
          </Button>
          <Button onClick={handleCopyPitch}>
            {copied ? (
              <Check className="mr-2 h-4 w-4" />
            ) : (
              <Copy className="mr-2 h-4 w-4" />
            )}
            {copied ? "Copied" : "Copy Pitch Summary"}
          </Button>
        </div>

        <div className="text-center text-xs text-muted-foreground">
          Generated by Hypothesis→Plan · Demo seed verified · Hackathon Challenge 4
        </div>
      </div>
    </div>
  );
}

function BigStat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card className="border-border/60 bg-gradient-card p-5">
      <div className="mb-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 font-display text-3xl font-bold text-primary">
        {value}
      </div>
    </Card>
  );
}

function ChallengeRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/50 p-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">
          {label}
        </div>
        <div className="text-sm text-foreground/85">{value}</div>
      </div>
    </div>
  );
}
