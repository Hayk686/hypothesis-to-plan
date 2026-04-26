import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, ShieldQuestion, ExternalLink } from "lucide-react";
import type { Verification, VerificationStatus } from "@/lib/mockData";

const COPY: Record<VerificationStatus, { label: string; cls: string; Icon: typeof ShieldCheck }> = {
  verified: {
    label: "Verified source",
    cls: "bg-success/15 text-success hover:bg-success/20 border-success/30",
    Icon: ShieldCheck,
  },
  pending: {
    label: "Source pending verification",
    cls: "bg-warning/20 text-warning-foreground hover:bg-warning/25 border-warning/30",
    Icon: ShieldQuestion,
  },
  unverified: {
    label: "Unverified",
    cls: "bg-destructive/15 text-destructive hover:bg-destructive/20 border-destructive/30",
    Icon: ShieldAlert,
  },
};

export function VerificationBadge({
  verification,
  compact = false,
}: {
  verification?: Verification;
  compact?: boolean;
}) {
  if (!verification) return null;
  const { label, cls, Icon } = COPY[verification.status];
  return (
    <Badge
      variant="outline"
      className={`gap-1 font-mono text-[10px] uppercase tracking-wider ${cls}`}
      title={verification.note ?? label}
    >
      <Icon className="h-3 w-3" />
      {compact ? verification.status : label}
    </Badge>
  );
}

export function SourceLink({ verification }: { verification?: Verification }) {
  if (!verification?.sourceUrl) return null;
  return (
    <a
      href={verification.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
    >
      Source <ExternalLink className="h-3 w-3" />
    </a>
  );
}
