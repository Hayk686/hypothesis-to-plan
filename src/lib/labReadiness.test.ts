import { describe, expect, it } from "vitest";

import { DEMO_PLAN } from "./mockData";
import { computeLabReadiness } from "./labReadiness";

describe("computeLabReadiness", () => {
  it("scores the seeded demo plan and reports ordering blockers", () => {
    const report = computeLabReadiness(DEMO_PLAN);

    expect(report.score).toBeGreaterThan(0);
    expect(report.score).toBeLessThanOrEqual(100);
    expect(report.unresolvedVerifyCount).toBeGreaterThan(0);
    expect(report.missingChecklist).toEqual(
      expect.arrayContaining([expect.stringContaining("missing a confirmed catalog number")]),
    );
  });

  it("caps protocol readiness when live protocols fall back", () => {
    const report = computeLabReadiness(DEMO_PLAN, DEMO_PLAN.literatureQc, {
      ok: false,
      used_fallback: true,
      reason: "protocols.io HTTP 401",
    });

    const protocolFactor = report.factors.find((f) => f.key === "protocol");
    expect(protocolFactor?.score).toBeLessThanOrEqual(60);
    expect(report.missingChecklist).toEqual(
      expect.arrayContaining([expect.stringContaining("protocols.io unavailable")]),
    );
  });
});
