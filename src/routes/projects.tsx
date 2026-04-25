import { createFileRoute, Link } from "@tanstack/react-router";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useEffect, useState } from "react";
import { loadProjects, deleteProject, type Project, DEMO_PROJECT } from "@/lib/mockData";
import { ArrowRight, Calendar, DollarSign, Plus, Sparkles, Trash2 } from "lucide-react";

export const Route = createFileRoute("/projects")({
  head: () => ({
    meta: [
      { title: "Saved Projects — Hypothesis→Plan" },
      { name: "description", content: "All your saved research projects." },
    ],
  }),
  component: ProjectsPage,
});

function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    setProjects(loadProjects());
  }, []);

  function handleDelete(id: string) {
    deleteProject(id);
    setProjects(loadProjects());
  }

  return (
    <div className="min-h-screen">
      <Header />
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold tracking-tight">Saved projects</h1>
            <p className="mt-2 text-muted-foreground">
              {projects.length} project{projects.length === 1 ? "" : "s"} · stored locally
            </p>
          </div>
          <Button asChild className="bg-gradient-hero shadow-glow">
            <Link to="/new"><Plus className="mr-2 h-4 w-4" />New project</Link>
          </Button>
        </div>

        {projects.length === 0 ? (
          <Card className="p-12 text-center">
            <p className="text-muted-foreground">No projects yet.</p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <Card
                key={p.id}
                className="group flex flex-col border-border/60 bg-gradient-card p-6 transition-smooth hover:border-primary/40 hover:shadow-elegant"
              >
                <div className="mb-3 flex items-start justify-between gap-2">
                  <Badge variant="outline" className="text-xs">{p.domain.split(" / ")[0]}</Badge>
                  {p.id === DEMO_PROJECT.id && (
                    <Badge className="bg-primary/15 text-primary hover:bg-primary/20">
                      <Sparkles className="mr-1 h-3 w-3" /> Demo
                    </Badge>
                  )}
                </div>
                <h3 className="line-clamp-2 font-display text-lg font-semibold leading-tight">
                  {p.title}
                </h3>
                <p className="mt-2 line-clamp-3 flex-1 text-sm text-muted-foreground">
                  {p.hypothesis}
                </p>

                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border/60 pt-4 text-xs">
                  <div>
                    <div className="text-muted-foreground">Novelty</div>
                    <div className="mt-0.5 font-mono font-semibold text-primary">{p.noveltyScore}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" /> Wks</div>
                    <div className="mt-0.5 font-mono font-semibold">{p.timelineWeeks}</div>
                  </div>
                  <div>
                    <div className="text-muted-foreground flex items-center gap-1"><DollarSign className="h-3 w-3" />Bgt</div>
                    <div className="mt-0.5 font-mono font-semibold">${(p.budget / 1000).toFixed(0)}k</div>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <Button asChild size="sm" className="flex-1">
                    <Link to="/project/$id" params={{ id: p.id }}>
                      Open <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                  {p.id !== DEMO_PROJECT.id && (
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
