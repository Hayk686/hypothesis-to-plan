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
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { saveProject, type Project, DEMO_PROJECT } from "@/lib/mockData";

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
  "Neuroscience / Gene Therapy",
  "Oncology",
  "Microbiology",
  "Immunology",
  "Materials Science",
  "Climate Science",
  "Computational Biology",
  "Other",
];

function NewProjectPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState(0);
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

  function loadDemo() {
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
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.hypothesis || !form.title) return;
    setLoading(true);
    const stages = [
      "Searching Semantic Scholar corpus…",
      "Computing novelty score…",
      "Drafting experimental protocol…",
      "Estimating materials & budget…",
      "Generating timeline & risks…",
    ];
    for (let i = 0; i < stages.length; i++) {
      setStage(i);
      await new Promise((r) => setTimeout(r, 600));
    }
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
    saveProject(project);
    navigate({ to: "/project/$id", params: { id: project.id } });
  }

  const stages = [
    "Searching Semantic Scholar corpus…",
    "Computing novelty score…",
    "Drafting experimental protocol…",
    "Estimating materials & budget…",
    "Generating timeline & risks…",
  ];

  return (
    <div className="min-h-screen">
      <Header />
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <Badge variant="outline" className="mb-3">Step 1 of 1</Badge>
            <h1 className="text-4xl font-bold tracking-tight">New research project</h1>
            <p className="mt-2 text-muted-foreground">
              Describe your hypothesis and constraints. We'll generate a complete plan.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={loadDemo}>
            <Wand2 className="mr-2 h-4 w-4" />
            Load example
          </Button>
        </div>

        <Card className="border-border/60 bg-gradient-card p-8 shadow-elegant">
          <form onSubmit={handleSubmit} className="space-y-6">
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
                  {DOMAINS.map((d) => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Timeline: <span className="font-mono text-primary">{form.timelineWeeks} weeks</span></Label>
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
              <Label>Budget: <span className="font-mono text-primary">${form.budget.toLocaleString()}</span></Label>
              <Slider
                value={[form.budget]}
                min={5000}
                max={500000}
                step={5000}
                onValueChange={([v]) => update("budget", v)}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>$5k</span><span>$500k</span>
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

            {loading ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-6">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <div className="font-medium text-primary">{stages[stage]}</div>
                </div>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-gradient-hero transition-all duration-500"
                    style={{ width: `${((stage + 1) / stages.length) * 100}%` }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {stages.map((s, i) => (
                    <Badge
                      key={s}
                      variant={i <= stage ? "default" : "outline"}
                      className={i <= stage ? "bg-primary/20 text-primary" : ""}
                    >
                      {s.replace("…", "")}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : (
              <Button
                type="submit"
                size="lg"
                className="w-full bg-gradient-hero shadow-glow"
                disabled={!form.title || !form.hypothesis}
              >
                <Sparkles className="mr-2 h-4 w-4" />
                Generate experimental plan
              </Button>
            )}
          </form>
        </Card>
      </div>
    </div>
  );
}
