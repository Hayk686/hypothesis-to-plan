import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Cpu,
  Database,
  Server,
  Cloud,
  Sparkles,
  Layers,
  Network,
  Info,
} from "lucide-react";
import { TECH_STACK } from "@/lib/services";

type Variant = "full" | "compact";

export function TechStackPanel({ variant = "full" }: { variant?: Variant }) {
  const isCompact = variant === "compact";

  return (
    <Card className="border-border/60 bg-gradient-card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-primary" />
          <h2
            className={
              isCompact
                ? "font-display text-lg font-semibold"
                : "font-display text-xl font-semibold"
            }
          >
            Technical Stack & API Readiness
          </h2>
        </div>
        <Badge variant="outline" className="text-[10px]">
          Demo mode · seeded data
        </Badge>
      </div>

      <div
        className={
          isCompact
            ? "grid gap-3 md:grid-cols-2"
            : "grid gap-3 md:grid-cols-2 lg:grid-cols-3"
        }
      >
        <Group icon={Cpu} title="Frontend" items={[...TECH_STACK.frontend]} />
        <Group
          icon={Server}
          title="Backend (planned)"
          items={[...TECH_STACK.backendPlanned]}
        />
        <Group
          icon={Sparkles}
          title="LLM layer (planned)"
          items={[...TECH_STACK.llmLayerPlanned]}
        />
        <Group
          icon={Database}
          title="Database (planned)"
          items={[...TECH_STACK.databasePlanned]}
        />
        <Group
          icon={Cloud}
          title="Hosting (planned)"
          items={[...TECH_STACK.hostingPlanned]}
        />

        <div className="rounded-lg border border-border/60 bg-background/50 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
            <Network className="h-3.5 w-3.5" />
            APIs (planned)
          </div>
          <ul className="space-y-2 text-sm">
            {TECH_STACK.apisPlanned.map((api) => (
              <li key={api.name}>
                <div className="font-medium">
                  {api.name}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    — {api.purpose}
                  </span>
                </div>
                <ul className="mt-1 space-y-0.5">
                  {api.endpoints.map((ep) => (
                    <li
                      key={ep}
                      className="font-mono text-[11px] text-muted-foreground"
                    >
                      {ep}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-foreground/80">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <div>
          <span className="font-semibold text-primary">Current demo mode: </span>
          {TECH_STACK.demoNote}{" "}
          <span className="text-muted-foreground">
            Service entry points: <code className="font-mono">searchLiterature()</code>,{" "}
            <code className="font-mono">getPaperDetails()</code>,{" "}
            <code className="font-mono">matchProtocols()</code>,{" "}
            <code className="font-mono">generateExperimentPlan()</code>,{" "}
            <code className="font-mono">saveScientistFeedback()</code>.
          </span>
        </div>
      </div>
    </Card>
  );
}

function Group({
  icon: Icon,
  title,
  items,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  items: string[];
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/50 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
        <Icon className="h-3.5 w-3.5" />
        {title}
      </div>
      <ul className="space-y-1 text-sm text-foreground/85">
        {items.map((it) => (
          <li key={it} className="leading-snug">
            • {it}
          </li>
        ))}
      </ul>
    </div>
  );
}
