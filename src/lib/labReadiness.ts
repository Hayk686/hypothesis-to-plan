// ============================================================
// LAB READINESS SCORE
// ------------------------------------------------------------
// Estimates how ready a generated experiment plan is for real
// lab execution. Pure function over the existing seeded plan —
// no backend, no API keys, no extra data needed.
//
// Inputs (all derived from GeneratedPlan + LiteratureQc state):
//   - literature QC completed
//   - protocol source coverage (steps with verified protocolSource)
//   - supplies / catalog numbers completeness
//   - budget completeness (vendor coverage + budgetSource)
//   - timeline dependencies completeness (deliverables per week)
//   - validation plan completeness
//   - number of unresolved "verify before ordering" items
// ============================================================

import { CATALOG_VERIFY_REQUIRED, type GeneratedPlan, type LiteratureQc } from "@/lib/mockData";

export type LabReadinessStatus = "Draft" | "Review Needed" | "Lab-Ready Candidate";

export type LabReadinessFactor = {
  key: string;
  label: string;
  weight: number; // 0-100
  score: number; // 0-100
  detail: string;
};

export type LabReadinessReport = {
  score: number; // 0-100, weighted average
  status: LabReadinessStatus;
  topReasons: string[]; // 3 reasons (high or low)
  missingChecklist: string[];
  factors: LabReadinessFactor[];
  unresolvedVerifyCount: number;
};

function clamp(n: number, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, n));
}

export type ProtocolLiveStatus = {
  ok: boolean; // true = live protocols.io worked
  used_fallback: boolean; // true = curated fallback used
  reason?: string; // e.g. "protocols.io HTTP 400"
};

export function computeLabReadiness(
  plan: GeneratedPlan,
  literatureQc?: LiteratureQc | null,
  protocolLive?: ProtocolLiveStatus | null,
): LabReadinessReport {
  const missing: string[] = [];

  // 1. Literature QC completed
  const litQc = literatureQc ?? plan.literatureQc;
  const litScore = litQc && litQc.result && litQc.reason ? 100 : 30;
  if (!litQc) missing.push("Literature QC verdict not generated yet");

  // 2. Protocol source coverage
  const protoTotal = plan.protocol.length || 1;
  const protoVerified = plan.protocol.filter(
    (s) => s.protocolSource && s.protocolSource.status === "verified",
  ).length;
  // Base score from seeded protocol-source verification.
  let protoScore = clamp((protoVerified / protoTotal) * 100);
  let protoDetail = `${protoVerified}/${protoTotal} steps backed by a verified protocol source.`;

  // Live override: if protocols.io fell back, cap the protocol coverage.
  if (protocolLive) {
    if (protocolLive.used_fallback) {
      protoScore = Math.min(protoScore, 60);
      const why = protocolLive.reason ? ` ${protocolLive.reason}.` : "";
      protoDetail = `${protoVerified}/${protoTotal} steps backed by curated fallback protocols; live protocols.io failed.${why}`;
      missing.push("protocols.io unavailable — using curated fallback protocols");
    } else if (protocolLive.ok) {
      protoScore = 100;
      protoDetail = `${protoTotal}/${protoTotal} steps backed by live protocols.io sources.`;
    }
  }

  if (protoVerified < protoTotal && !protocolLive) {
    missing.push(
      `${protoTotal - protoVerified}/${protoTotal} protocol step(s) without a verified source`,
    );
  }

  // 3. Supplies / catalog number completeness
  const matTotal = plan.materials.length || 1;
  const matMissingCatalog = plan.materials.filter(
    (m) => m.catalog === CATALOG_VERIFY_REQUIRED || !m.catalog || m.catalog === "—",
  ).length;
  const matScore = clamp(((matTotal - matMissingCatalog) / matTotal) * 100);
  if (matMissingCatalog > 0) {
    missing.push(`${matMissingCatalog} material line item(s) missing a confirmed catalog number`);
  }

  // 4. Budget completeness — vendor coverage + budget source attached
  const matWithVendor = plan.materials.filter(
    (m) => m.vendor && m.vendor !== "—" && m.vendor !== "General lab supplier",
  ).length;
  const vendorRatio = matWithVendor / matTotal;
  const budgetSourceBonus = plan.budgetSource ? 30 : 0;
  const budgetScore = clamp(vendorRatio * 70 + budgetSourceBonus);
  if (!plan.budgetSource) missing.push("Budget source / quote provenance not attached");
  if (vendorRatio < 0.7) {
    missing.push("Several materials still use a generic vendor — assign specific suppliers");
  }

  // 5. Timeline dependencies completeness
  const tlTotal = plan.timeline.length || 1;
  const tlComplete = plan.timeline.filter(
    (w) => w.deliverable && w.tasks && w.tasks.length > 0 && w.milestone,
  ).length;
  const tlSourceBonus = plan.timelineSource ? 15 : 0;
  const tlScore = clamp((tlComplete / tlTotal) * 85 + tlSourceBonus);
  if (tlComplete < tlTotal) {
    missing.push(`${tlTotal - tlComplete} week(s) missing a deliverable or task list`);
  }
  if (!plan.timelineSource) missing.push("Timeline source / SOP reference not attached");

  // 6. Validation plan completeness
  const v = plan.validation;
  let valFilled = 0;
  const valTotal = 7;
  if (v.primaryMetric?.name && v.primaryMetric?.target && v.primaryMetric?.method) valFilled++;
  if (v.secondaryMetrics && v.secondaryMetrics.length > 0) valFilled++;
  if (v.statisticalApproach) valFilled++;
  if (v.reproducibilityChecks && v.reproducibilityChecks.length > 0) valFilled++;
  if (v.positiveControl) valFilled++;
  if (v.negativeControl) valFilled++;
  if (v.source) valFilled++;
  const valScore = clamp((valFilled / valTotal) * 100);
  if (!v.primaryMetric?.target) missing.push("Validation plan missing primary metric target");
  if (!v.positiveControl) missing.push("Validation plan missing positive control");
  if (!v.negativeControl) missing.push("Validation plan missing negative control");
  if (!v.source) missing.push("Validation plan missing methodology source");

  // 7. Unresolved "verify before ordering" items
  const verifyBeforeOrdering = plan.materials.filter((m) =>
    m.verification?.note?.toLowerCase().includes("verify before ordering"),
  ).length;
  const pendingVerification = plan.materials.filter(
    (m) => m.verification?.status === "pending",
  ).length;
  const unresolvedVerifyCount = verifyBeforeOrdering + pendingVerification;
  // Penalty: each unresolved item drops the verification subscore.
  const verifySubscore = clamp(100 - unresolvedVerifyCount * 6);
  if (unresolvedVerifyCount > 0) {
    missing.push(
      `${unresolvedVerifyCount} item(s) still flagged "verify before ordering" / pending`,
    );
  }

  const factors: LabReadinessFactor[] = [
    {
      key: "literature",
      label: "Literature QC completed",
      weight: 12,
      score: litScore,
      detail: litQc
        ? `Verdict on file: "${litQc.result}".`
        : "No literature QC verdict generated yet.",
    },
    {
      key: "protocol",
      label: "Protocol source coverage",
      weight: 18,
      score: protoScore,
      detail: protoDetail,
    },
    {
      key: "supplies",
      label: "Supplies & catalog numbers",
      weight: 16,
      score: matScore,
      detail: `${matTotal - matMissingCatalog}/${matTotal} materials have a confirmed catalog number.`,
    },
    {
      key: "budget",
      label: "Budget completeness",
      weight: 14,
      score: budgetScore,
      detail: `${matWithVendor}/${matTotal} materials have a specific vendor${plan.budgetSource ? "; budget source attached." : "; budget source missing."}`,
    },
    {
      key: "timeline",
      label: "Timeline & dependencies",
      weight: 14,
      score: tlScore,
      detail: `${tlComplete}/${tlTotal} weeks have tasks, milestone, and deliverable defined.`,
    },
    {
      key: "validation",
      label: "Validation plan",
      weight: 16,
      score: valScore,
      detail: `${valFilled}/${valTotal} validation fields completed (metrics, stats, controls, source).`,
    },
    {
      key: "verify",
      label: "Resolved verification items",
      weight: 10,
      score: verifySubscore,
      detail:
        unresolvedVerifyCount === 0
          ? "All items verified — no outstanding ordering blockers."
          : `${unresolvedVerifyCount} item(s) still need verification before ordering.`,
    },
  ];

  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const score = Math.round(factors.reduce((s, f) => s + (f.score * f.weight) / totalWeight, 0));

  const status: LabReadinessStatus =
    score >= 80 ? "Lab-Ready Candidate" : score >= 55 ? "Review Needed" : "Draft";

  // Top 3 reasons — mix strongest and weakest factors so the user sees both.
  const sortedDesc = [...factors].sort((a, b) => b.score - a.score);
  const sortedAsc = [...factors].sort((a, b) => a.score - b.score);
  const topReasons: string[] = [];
  if (status === "Lab-Ready Candidate") {
    topReasons.push(
      `${sortedDesc[0].label}: ${Math.round(sortedDesc[0].score)}/100 — ${sortedDesc[0].detail}`,
      `${sortedDesc[1].label}: ${Math.round(sortedDesc[1].score)}/100 — ${sortedDesc[1].detail}`,
      `${sortedAsc[0].label}: ${Math.round(sortedAsc[0].score)}/100 — ${sortedAsc[0].detail}`,
    );
  } else {
    topReasons.push(
      `${sortedAsc[0].label}: ${Math.round(sortedAsc[0].score)}/100 — ${sortedAsc[0].detail}`,
      `${sortedAsc[1].label}: ${Math.round(sortedAsc[1].score)}/100 — ${sortedAsc[1].detail}`,
      `${sortedDesc[0].label}: ${Math.round(sortedDesc[0].score)}/100 — ${sortedDesc[0].detail}`,
    );
  }

  return {
    score,
    status,
    topReasons,
    missingChecklist: missing.slice(0, 8),
    factors,
    unresolvedVerifyCount,
  };
}
