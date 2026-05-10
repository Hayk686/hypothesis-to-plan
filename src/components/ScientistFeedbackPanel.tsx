import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CheckCircle2, MessageSquare, Sparkles, Star } from "lucide-react";
import { toast } from "sonner";
import {
  loadScientistFeedback,
  persistScientistFeedback,
  type ScientistFeedbackRecord,
  type ScientistFeedbackSection,
} from "@/lib/scientistFeedback";

const SECTIONS: ScientistFeedbackSection[] = [
  "Protocol",
  "Supplies",
  "Budget",
  "Timeline",
  "Validation",
];

export function ScientistFeedbackPanel({
  experimentType,
  compact = false,
}: {
  experimentType: string;
  compact?: boolean;
}) {
  const [section, setSection] = useState<ScientistFeedbackSection>("Protocol");
  const [rating, setRating] = useState<number>(4);
  const [original, setOriginal] = useState<string>("");
  const [corrected, setCorrected] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [history, setHistory] = useState<ScientistFeedbackRecord[]>(() =>
    loadScientistFeedback().filter((r) => r.experimentType === experimentType),
  );
  const [lastSaved, setLastSaved] = useState<ScientistFeedbackRecord | null>(null);

  function save() {
    if (!corrected.trim() && !reason.trim()) {
      toast.error("Add a correction or reason before saving.");
      return;
    }
    const record: ScientistFeedbackRecord = {
      id: `fb-${Date.now()}`,
      experimentType,
      section,
      rating,
      originalSuggestion: original.trim() || `(unspecified ${section.toLowerCase()} item)`,
      correctedValue: corrected.trim() || "(no replacement value provided)",
      reason: reason.trim() || "(no reason provided)",
      createdAt: new Date().toISOString(),
    };
    const all = loadScientistFeedback();
    all.push(record);
    persistScientistFeedback(all);
    setHistory((h) => [record, ...h]);
    setLastSaved(record);
    toast.success("Feedback saved as structured correction");
    setOriginal("");
    setCorrected("");
    setReason("");
    setRating(4);
  }

  return (
    <Card className={`border-border/60 bg-gradient-card ${compact ? "p-5" : "p-6"} shadow-elegant`}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h3 className="font-display text-lg font-semibold">Scientist Review</h3>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
          Local feedback loop · {history.length} saved
        </Badge>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Rate each section, paste the original suggestion, the corrected value, and the reason. Saved
        feedback becomes context for the next similar plan.
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">Section</Label>
          <div className="flex flex-wrap gap-1.5">
            {SECTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSection(s)}
                className={`rounded-md border px-2.5 py-1 text-xs transition-smooth ${
                  section === s
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border/60 bg-background/40 text-muted-foreground hover:border-primary/40"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wider text-muted-foreground">
            Accuracy rating (1–5)
          </Label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                aria-label={`Rate ${n}`}
                className="rounded p-1 transition-smooth hover:scale-110"
              >
                <Star
                  className={`h-5 w-5 ${
                    n <= rating ? "fill-primary text-primary" : "text-muted-foreground/40"
                  }`}
                />
              </button>
            ))}
            <span className="ml-2 font-mono text-xs text-muted-foreground">{rating}/5</span>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div className="space-y-2">
          <Label
            htmlFor="fb-original"
            className="text-xs uppercase tracking-wider text-muted-foreground"
          >
            Original suggestion
          </Label>
          <Textarea
            id="fb-original"
            rows={2}
            placeholder={`e.g. ${section === "Supplies" ? "Sigma D2438 DMSO, $80/100ml" : "10% DMSO + 90% FBS freezing medium"}`}
            value={original}
            onChange={(e) => setOriginal(e.target.value)}
            className="resize-none text-sm"
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="fb-corrected"
            className="text-xs uppercase tracking-wider text-muted-foreground"
          >
            Corrected value
          </Label>
          <Textarea
            id="fb-corrected"
            rows={2}
            placeholder={`e.g. ${section === "Supplies" ? "Switch to in-house aliquoted DMSO; saves $40" : "Use 5% DMSO + 5% trehalose blend"}`}
            value={corrected}
            onChange={(e) => setCorrected(e.target.value)}
            className="resize-none text-sm"
          />
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <Label
          htmlFor="fb-reason"
          className="text-xs uppercase tracking-wider text-muted-foreground"
        >
          Reason / scientific rationale
        </Label>
        <Textarea
          id="fb-reason"
          rows={2}
          placeholder="Why does the correction matter? (cell line nuance, vendor change, prior result…)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="resize-none text-sm"
        />
      </div>

      <div className="mt-4 flex items-center justify-end">
        <Button onClick={save} size="sm">
          <CheckCircle2 className="mr-2 h-4 w-4" />
          Save Scientist Feedback
        </Button>
      </div>

      {lastSaved && (
        <>
          <Card className="mt-4 border-success/30 bg-success/5 p-4">
            <div className="mb-2 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <div className="font-display text-sm font-semibold text-success">
                Feedback saved as structured correction
              </div>
            </div>
            <dl className="grid gap-1.5 text-xs">
              <FeedbackRow label="Experiment type" value={lastSaved.experimentType} />
              <FeedbackRow label="Section" value={lastSaved.section} />
              <FeedbackRow label="Rating" value={`${lastSaved.rating}/5`} />
              <FeedbackRow label="Original suggestion" value={lastSaved.originalSuggestion} />
              <FeedbackRow label="Corrected value" value={lastSaved.correctedValue} />
              <FeedbackRow label="Reason" value={lastSaved.reason} />
              <FeedbackRow
                label="Status"
                value="Will be used as context for the next similar plan"
              />
            </dl>
          </Card>

          <Card className="mt-3 border-primary/30 bg-primary/5 p-4">
            <div className="mb-1.5 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <div className="font-display text-sm font-semibold text-primary">
                Next similar plan improvement
              </div>
            </div>
            <p className="text-xs text-foreground/85">{nextPlanImprovement(lastSaved)}</p>
          </Card>
        </>
      )}

      {history.length > 0 && (
        <details className="mt-4 rounded-md border border-border/60 bg-background/40 p-3 text-xs">
          <summary className="cursor-pointer font-mono uppercase tracking-wider text-muted-foreground">
            Saved feedback history ({history.length})
          </summary>
          <ul className="mt-2 space-y-2">
            {history.map((r) => (
              <li key={r.id} className="rounded border border-border/60 bg-card/60 p-2">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <Badge variant="outline" className="text-[10px]">
                    {r.section}
                  </Badge>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {r.rating}/5 · {new Date(r.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-1 text-foreground/85">
                  <span className="font-mono text-primary">→</span> {r.correctedValue}
                </div>
                <div className="text-muted-foreground">{r.reason}</div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

function FeedbackRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2">
      <dt className="font-mono uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="text-foreground/90">{value}</dd>
    </div>
  );
}

function nextPlanImprovement(record: ScientistFeedbackRecord): string {
  const exp = record.experimentType;
  const isCryo = /cryopreserv/i.test(exp);
  const baseSubject = isCryo
    ? "Future cryopreservation plans"
    : `Future ${exp.toLowerCase()} plans`;

  switch (record.section) {
    case "Supplies":
      return `${baseSubject} will prefer verified catalog numbers and flag vendor/SKU swaps for scientist review before adding to the BOM.`;
    case "Protocol":
      return isCryo
        ? `${baseSubject} will prefer verified catalog numbers and flag trehalose concentration ranges for scientist review.`
        : `${baseSubject} will surface protocol deviations like this one as recommended adjustments before locking the plan.`;
    case "Budget":
      return `${baseSubject} will down-rank cost lines previously corrected by scientists and propose the verified lower-cost option first.`;
    case "Timeline":
      return `${baseSubject} will adjust phase durations toward the corrected scientist estimate and flag overly optimistic week counts.`;
    case "Validation":
      return `${baseSubject} will require the corrected acceptance criterion (e.g., effect size, time points) up-front in the validation plan.`;
    default:
      return `${baseSubject} will use this correction as additional grounding context.`;
  }
}
