import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle2, AlertCircle, ClipboardCheck } from "lucide-react";
import type { LabReadinessReport } from "@/lib/labReadiness";

type Props = {
  report: LabReadinessReport;
  variant?: "full" | "compact";
};

export function LabReadinessCard({ report, variant = "full" }: Props) {
  const { score, status, topReasons, missingChecklist, factors } = report;

  const statusClass =
    status === "Lab-Ready Candidate"
      ? "bg-success/15 text-success hover:bg-success/20"
      : status === "Review Needed"
        ? "bg-warning/20 text-warning-foreground hover:bg-warning/25"
        : "bg-destructive/15 text-destructive hover:bg-destructive/20";

  return (
    <Card className="border-border/60 bg-gradient-card p-5 shadow-elegant">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold tracking-tight">
              Lab Readiness Score
            </h3>
            <p className="text-xs text-muted-foreground">
              Estimated readiness for real-lab execution
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-baseline gap-1">
            <span className="font-display text-3xl font-bold text-primary">{score}</span>
            <span className="text-xs text-muted-foreground">/100</span>
          </div>
          <Badge className={statusClass} variant="secondary">{status}</Badge>
        </div>
      </div>

      <div className="mt-4">
        <Progress value={score} className="h-2" />
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Why this score
          </div>
          <ul className="space-y-1.5 text-sm">
            {topReasons.map((r, i) => (
              <li
                key={i}
                className="rounded-md border border-border/60 bg-background/40 px-3 py-1.5 text-foreground/85"
              >
                {r}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 text-warning-foreground" />
            Missing items
          </div>
          {missingChecklist.length === 0 ? (
            <div className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-foreground/85">
              Nothing flagged — every readiness check passed.
            </div>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {missingChecklist.map((m, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 px-3 py-1.5"
                >
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-warning" />
                  <span className="text-foreground/85">{m}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {variant === "full" && (
        <div className="mt-5">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Factor breakdown
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {factors.map((f) => (
              <div
                key={f.key}
                className="rounded-md border border-border/60 bg-background/40 p-3"
                title={f.detail}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium">{f.label}</span>
                  <span className="font-mono text-xs text-primary">
                    {Math.round(f.score)}/100
                  </span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-hero"
                    style={{ width: `${f.score}%` }}
                  />
                </div>
                <div className="mt-1 text-[10px] leading-tight text-muted-foreground">
                  {f.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}
