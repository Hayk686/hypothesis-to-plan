import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  FileSearch,
  Beaker,
  Calendar,
  ShieldAlert,
  CheckCircle2,
  ArrowRight,
  Zap,
  ShieldCheck,
  BookCheck,
  Wrench,
  MessagesSquare,
} from "lucide-react";
import { DEMO_PROJECT } from "@/lib/mockData";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hypothesis→Plan — From idea to experiment in 60 seconds" },
      {
        name: "description",
        content:
          "AI research co-scientist that turns a hypothesis into a complete experimental plan: novelty score, related work, protocol, materials, timeline, validation, and risks.",
      },
    ],
  }),
  component: LandingPage,
});

const features = [
  { icon: Sparkles, title: "Novelty Score", desc: "Quantify how original your hypothesis is against the published corpus." },
  { icon: FileSearch, title: "Evidence Map", desc: "Surface the most relevant papers and identify the precise research gap." },
  { icon: Beaker, title: "Experimental Protocol", desc: "Step-by-step procedures grounded in established methods." },
  { icon: Calendar, title: "Week-by-Week Timeline", desc: "Realistic milestones, deliverables, and dependencies." },
  { icon: ShieldAlert, title: "Risk Analysis", desc: "Surface technical, biological, and logistical risks with mitigations." },
  { icon: CheckCircle2, title: "Validation Plan", desc: "Pre-defined pass criteria and statistical readouts." },
];

function LandingPage() {
  return (
    <div className="min-h-screen">
      <Header />

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 grid-pattern opacity-40" />
        <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-gradient-hero opacity-20 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-6 pt-20 pb-24 text-center">
          <Badge variant="secondary" className="mb-6 border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium text-primary">
            <Zap className="mr-1.5 h-3 w-3" />
            Verified source-backed demo · API-ready literature QC
          </Badge>
          <h1 className="mx-auto max-w-4xl text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
            From hypothesis to{" "}
            <span className="text-gradient">experimental plan</span> in 60 seconds.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
            An AI co-scientist that reads the literature, scores your novelty, and drafts a full
            protocol — materials, timeline, validation, and risks included.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="h-12 bg-gradient-hero px-8 text-base shadow-glow">
              <Link to="/new">
                Start a project
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12 px-8 text-base">
              <Link to="/project/$id" params={{ id: DEMO_PROJECT.id }}>
                Try the demo
              </Link>
            </Button>
          </div>

          {/* Floating preview card */}
          <div className="relative mx-auto mt-16 max-w-4xl">
            <div className="absolute inset-0 rounded-2xl bg-gradient-hero opacity-30 blur-2xl" />
            <Card className="relative overflow-hidden border-border/60 bg-gradient-card p-0 shadow-elegant">
              <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-4 py-3">
                <div className="flex gap-1.5">
                  <div className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
                  <div className="h-2.5 w-2.5 rounded-full bg-warning/60" />
                  <div className="h-2.5 w-2.5 rounded-full bg-success/60" />
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  hypothesis-to-plan / demo
                </span>
              </div>
              <div className="grid gap-4 p-6 text-left md:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-background/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Novelty</div>
                  <div className="mt-1 font-display text-3xl font-semibold text-primary">74<span className="text-base text-muted-foreground">/100</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-hero" style={{ width: "74%" }} />
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 bg-background/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Feasibility</div>
                  <div className="mt-1 font-display text-3xl font-semibold text-primary">82<span className="text-base text-muted-foreground">/100</span></div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gradient-hero" style={{ width: "82%" }} />
                  </div>
                </div>
                <div className="rounded-lg border border-border/60 bg-background/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Cost</div>
                  <div className="mt-1 font-display text-3xl font-semibold">$28k</div>
                  <div className="mt-2 text-xs text-muted-foreground">17 line items</div>
                </div>
                <div className="rounded-lg border border-border/60 bg-background/50 p-4">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">Duration</div>
                  <div className="mt-1 font-display text-3xl font-semibold">8 wks</div>
                  <div className="mt-2 text-xs text-muted-foreground">6 protocol phases</div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="mx-auto max-w-7xl px-6 py-24">
        <div className="mb-12 text-center">
          <Badge variant="outline" className="mb-4">What you get</Badge>
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
            Everything a PI would ask for.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
            Seven analyses, one hypothesis. Built to look credible to a domain expert on the first read.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Card key={f.title} className="group border-border/60 bg-gradient-card p-6 transition-smooth hover:border-primary/40 hover:shadow-elegant">
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary transition-smooth group-hover:bg-primary group-hover:text-primary-foreground">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="font-display text-lg font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground">{f.desc}</p>
            </Card>
          ))}
        </div>
      </section>

      {/* DIFFERENTIATORS — Why this is more than a generic AI planner */}
      <section className="border-t border-border/60 bg-background">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="mb-12 text-center">
            <Badge variant="outline" className="mb-4 border-primary/30 text-primary">Differentiators</Badge>
            <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
              Why this is more than a generic AI planner.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Four design choices that make the output trustworthy at the bench, not just convincing on screen.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                icon: ShieldCheck,
                title: "Literature QC gate before planning",
                desc: "Every hypothesis passes a literature quality-control check first. If the evidence base is too thin or contradictory, the planner flags it instead of confidently inventing a protocol.",
              },
              {
                icon: BookCheck,
                title: "Real-source-backed evidence & protocols",
                desc: "Papers come with DOIs and verification badges. Protocol steps cite their methodological source. Nothing in the plan is a hallucinated reference.",
              },
              {
                icon: Wrench,
                title: "Lab Readiness Score",
                desc: "An operational readiness score covering reagents, equipment, biosafety, and skills — so a PI can see whether their lab can actually run this plan tomorrow.",
              },
              {
                icon: MessagesSquare,
                title: "Scientist Review feedback loop",
                desc: "A built-in review surface for domain experts to challenge assumptions, flag missing controls, and feed corrections back into future plans.",
              },
            ].map((d) => (
              <Card
                key={d.title}
                className="group flex flex-col border-border/60 bg-gradient-card p-6 transition-smooth hover:border-primary/40 hover:shadow-elegant"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary transition-smooth group-hover:bg-primary group-hover:text-primary-foreground">
                  <d.icon className="h-5 w-5" />
                </div>
                <h3 className="font-display text-lg font-semibold leading-snug">{d.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{d.desc}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border/60 bg-muted/30">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <div className="grid gap-12 md:grid-cols-2 md:items-center">
            <div>
              <Badge variant="outline" className="mb-4">How it works</Badge>
              <h2 className="text-4xl font-bold tracking-tight">
                Three inputs. One complete plan.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Drop in your hypothesis, pick a budget and timeline, and we synthesize a
                research-grade plan you can hand to a lab tomorrow.
              </p>
              <div className="mt-8 space-y-4">
                {[
                  ["1", "Describe your hypothesis", "A single paragraph is enough."],
                  ["2", "Set the constraints", "Budget, timeline, lab capabilities."],
                  ["3", "Review your plan", "Tabs for evidence, protocol, budget, risks."],
                ].map(([n, t, d]) => (
                  <div key={n} className="flex gap-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-mono text-sm font-semibold text-primary-foreground">
                      {n}
                    </div>
                    <div>
                      <div className="font-medium">{t}</div>
                      <div className="text-sm text-muted-foreground">{d}</div>
                    </div>
                  </div>
                ))}
              </div>
              <Button asChild size="lg" className="mt-8 bg-gradient-hero shadow-glow">
                <Link to="/new">
                  Generate your plan <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
            <Card className="border-border/60 bg-gradient-card p-6 shadow-elegant">
              <div className="font-mono text-xs text-muted-foreground">EXAMPLE HYPOTHESIS</div>
              <p className="mt-2 font-display text-lg leading-relaxed">
                "{DEMO_PROJECT.hypothesis}"
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Badge variant="secondary">Immunology</Badge>
                <Badge variant="secondary">CRISPRi</Badge>
                <Badge variant="secondary">Intestinal organoids</Badge>
                <Badge variant="secondary">IL6 / IBD</Badge>
              </div>
              <div className="mt-6 border-t border-border/60 pt-4">
                <Link
                  to="/project/$id"
                  params={{ id: DEMO_PROJECT.id }}
                  className="inline-flex items-center text-sm font-medium text-primary hover:underline"
                >
                  See the generated plan <ArrowRight className="ml-1 h-3 w-3" />
                </Link>
              </div>
            </Card>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        Hypothesis→Plan · Seeded with verified public sources for demo reliability · Optional live Semantic Scholar refresh.
      </footer>
    </div>
  );
}
