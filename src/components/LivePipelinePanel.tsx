// ============================================================
// LivePipelinePanel
// ------------------------------------------------------------
// Action button + staged progress + warnings + dev debug panel
// for the /api/generate-plan orchestrator. The parent owns the
// resulting LivePlanResponse (via onResult) so the dashboard
// tabs can render real-source data alongside the seeded baseline.
//
// Important: this component never auto-runs the pipeline.
// The user must explicitly click "Run live data pipeline".
// ============================================================

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Sparkles,
  FileSearch,
  Beaker,
  ShoppingCart,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ServerCog,
} from "lucide-react";
import { toast } from "sonner";
import { generatePlanLive, type GeneratePlanStage, type LivePlanResponse } from "@/lib/services";
import type { Project } from "@/lib/mockData";

type Props = {
  project: Project;
  livePlan: LivePlanResponse | null;
  onResult: (plan: LivePlanResponse | null) => void;
};

const STAGE_LABEL: Record<GeneratePlanStage, string> = {
  "searching-literature": "Searching literature",
  "checking-protocols": "Checking protocols",
  "resolving-materials": "Resolving materials",
  "generating-plan": "Generating plan",
  done: "Done",
  error: "Error",
};

const STAGE_ORDER: GeneratePlanStage[] = [
  "searching-literature",
  "checking-protocols",
  "resolving-materials",
  "generating-plan",
];

export function LivePipelinePanel({ project, livePlan, onResult }: Props) {
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<GeneratePlanStage | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isDev = import.meta.env.DEV;

  const handleRun = async () => {
    setRunning(true);
    setError(null);
    setStage("searching-literature");
    try {
      const res = await generatePlanLive(project, (s) => setStage(s));
      if (res.ok) {
        onResult(res.data);
        const w = res.data.warnings;
        const litLive = !w.uses_fallback_literature;
        const litCount = res.data.evidence_map?.length ?? 0;

        if (litLive && litCount > 0) {
          // Always lead with the literature live status so a protocol fallback
          // never gets misread as "no papers returned".
          toast.success("Live literature loaded", {
            description: `Returned ${litCount} papers via Semantic Scholar.`,
          });
        }
        if (w.uses_fallback_protocols) {
          toast.message("Protocols.io unavailable", {
            description: "Using curated fallback protocols.",
          });
        }
        if (w.uses_fallback_literature) {
          toast.message("Literature fallback in use", {
            description: "Live Semantic Scholar returned no usable results.",
          });
        }
        if (w.has_unverified_materials) {
          toast.message("Some materials unverified", {
            description: "Catalog numbers or supplier URLs missing.",
          });
        }
        if (w.uses_fallback_llm) {
          toast.message("LLM orchestration fallback", {
            description: "Set OPENROUTER_API_KEY or NVIDIA_API_KEY for generated plans.",
          });
        }
        if ((res.data.feedback_context?.applied_count ?? 0) > 0) {
          toast.success("Scientist feedback applied", {
            description: `${res.data.feedback_context!.applied_count} prior correction(s) used as LLM context.`,
          });
        }
        if (
          !w.uses_fallback_literature &&
          !w.uses_fallback_protocols &&
          !w.has_unverified_materials &&
          !w.uses_fallback_llm
        ) {
          toast.success("Live pipeline complete", {
            description: "All sections backed by live or verified sources.",
          });
        }
      } else {
        setError(res.error);
        toast.error("Live pipeline failed", { description: res.error });
      }
    } finally {
      setRunning(false);
    }
  };

  const w = livePlan?.warnings;
  const showWarning =
    w &&
    (w.uses_fallback_literature ||
      w.uses_fallback_protocols ||
      w.has_unverified_materials ||
      w.uses_fallback_llm);

  return (
    <Card className="mb-6 border-border/60 bg-gradient-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <ServerCog className="h-4 w-4 text-primary" />
            <h3 className="font-display text-sm font-semibold">Real-data pipeline</h3>
            {livePlan ? (
              <Badge
                variant="outline"
                className="border-success/40 bg-success/10 text-[10px] uppercase tracking-wider text-success"
              >
                Live data merged
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                Seeded verified demo
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Calls <code className="font-mono text-foreground/80">/api/generate-plan</code> (Semantic
            Scholar → protocols.io → verified supplier registry). The seeded plan stays available as
            a labeled fallback.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {livePlan && (
            <Button variant="ghost" size="sm" onClick={() => onResult(null)} disabled={running}>
              Revert to seeded
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleRun}
            disabled={running}
            className="bg-gradient-hero shadow-glow"
          >
            {running ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            {running ? "Running…" : livePlan ? "Re-run live pipeline" : "Run live data pipeline"}
          </Button>
        </div>
      </div>

      {/* Staged progress */}
      {running && stage && (
        <div className="mt-4 grid gap-2 sm:grid-cols-4">
          {STAGE_ORDER.map((s) => {
            const idx = STAGE_ORDER.indexOf(s);
            const currentIdx = STAGE_ORDER.indexOf(stage as GeneratePlanStage);
            const state = idx < currentIdx ? "done" : idx === currentIdx ? "active" : "pending";
            const Icon =
              s === "searching-literature"
                ? FileSearch
                : s === "checking-protocols"
                  ? Beaker
                  : s === "resolving-materials"
                    ? ShoppingCart
                    : Sparkles;
            return (
              <div
                key={s}
                className={`flex items-center gap-2 rounded-md border p-2 text-xs ${
                  state === "done"
                    ? "border-success/40 bg-success/5 text-success"
                    : state === "active"
                      ? "border-primary/40 bg-primary/5 text-primary"
                      : "border-border/40 bg-muted/30 text-muted-foreground"
                }`}
              >
                {state === "done" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : state === "active" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Icon className="h-3.5 w-3.5" />
                )}
                <span className="font-mono">{STAGE_LABEL[s]}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Per-source status rows */}
      {livePlan?.source_status && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {(["literature", "protocols", "materials", "llm"] as const).map((k) => {
            const row = livePlan.source_status![k];
            if (!row) return null;
            const tone = row.ok
              ? "border-success/40 bg-success/5 text-success"
              : "border-warning/40 bg-warning/10 text-warning-foreground";
            const Icon = row.ok ? CheckCircle2 : AlertTriangle;
            const label =
              k === "literature"
                ? "Literature"
                : k === "protocols"
                  ? "Protocols"
                  : k === "materials"
                    ? "Materials"
                    : "LLM";
            return (
              <div
                key={k}
                className={`flex items-start gap-2 rounded-md border p-2 text-xs ${tone}`}
              >
                <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="min-w-0">
                  <div className="font-mono uppercase tracking-wider text-[10px] opacity-80">
                    {label}
                  </div>
                  <div className="font-semibold">{row.label}</div>
                  <div className="mt-0.5 text-[11px] opacity-80 break-words">{row.reason}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {livePlan?.feedback_context && livePlan.feedback_context.applied_count > 0 && (
        <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <div className="font-semibold text-primary">Scientist feedback memory applied</div>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              {livePlan.feedback_context.experiment_type}
            </Badge>
          </div>
          <div className="text-foreground/80">
            {livePlan.feedback_context.applied_count} prior structured correction
            {livePlan.feedback_context.applied_count === 1 ? "" : "s"} were sent to the LLM as
            expert context for this similar plan.
          </div>
        </div>
      )}

      {/* Global fallback warning banner */}
      {showWarning && (
        <div className="mt-4 flex flex-wrap items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning-foreground" />
          <div className="flex-1">
            <div className="font-semibold text-warning-foreground">
              Some sections use fallback data
            </div>
            <div className="mt-0.5 text-foreground/80">
              {w!.uses_fallback_literature && "Literature uses curated fallback. "}
              {w!.uses_fallback_protocols && "Protocols use curated fallback. "}
              {w!.has_unverified_materials &&
                "Some materials are not in the verified supplier registry. "}
              {w!.uses_fallback_llm && "LLM orchestration used deterministic fallback. "}
              See per-source rows above for the exact reason.
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !running && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Dev debug panel */}
      {isDev && livePlan && (
        <details className="mt-4 rounded-md border border-dashed border-border/60 bg-muted/30 p-3">
          <summary className="cursor-pointer font-mono text-[11px] text-muted-foreground">
            Dev · /api/generate-plan debug
          </summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-mono text-[10px] text-foreground/75">
            {JSON.stringify(livePlan.debug, null, 2)}
          </pre>
        </details>
      )}
    </Card>
  );
}

/** Small inline source-badge used by dashboard tabs. */
export function SourceBadge({
  source,
  fallback,
}: {
  source:
    | "live-semantic-scholar"
    | "pubmed"
    | "protocols.io"
    | "verified-supplier"
    | "curated-fallback"
    | "seed";
  fallback?: boolean;
}) {
  const map = {
    "live-semantic-scholar": {
      label: "Live Semantic Scholar",
      cls: "border-success/40 bg-success/10 text-success",
    },
    pubmed: { label: "PubMed", cls: "border-primary/40 bg-primary/10 text-primary" },
    "protocols.io": { label: "protocols.io", cls: "border-success/40 bg-success/10 text-success" },
    "verified-supplier": {
      label: "Verified supplier source",
      cls: "border-success/40 bg-success/10 text-success",
    },
    "curated-fallback": {
      label: "Curated fallback",
      cls: "border-warning/40 bg-warning/10 text-warning-foreground",
    },
    seed: {
      label: "Seeded verified demo",
      cls: "border-border/60 bg-muted/40 text-muted-foreground",
    },
  } as const;
  const entry = map[source];
  return (
    <Badge variant="outline" className={`text-[10px] uppercase tracking-wider ${entry.cls}`}>
      {entry.label}
      {fallback ? " · fallback" : ""}
    </Badge>
  );
}
