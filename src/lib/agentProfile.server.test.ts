import { describe, expect, it } from "vitest";

import { buildAgentProfile, classifyAgentDomain } from "./agentProfile.server";

describe("agentProfile", () => {
  it("classifies computational projects without life-science fallbacks", () => {
    const profile = buildAgentProfile({
      domain: "machine learning",
      hypothesis:
        "A retrieval-augmented classifier improves legal document triage accuracy over a baseline model.",
      method_keywords: ["benchmark", "dataset", "python"],
    });

    expect(profile.kind).toBe("computational");
    expect(profile.protocolQueries.join(" ")).not.toMatch(/hela|cell culture|viability/i);
    expect(profile.defaultMaterials).toEqual(
      expect.arrayContaining(["Version-controlled code repository", "Benchmark dataset access"]),
    );
  });

  it("keeps wet-lab routing for explicit cell biology work", () => {
    expect(
      classifyAgentDomain({
        domain: "cell biology",
        organism_or_system: "HeLa cells",
        hypothesis: "Trehalose improves post-thaw viability.",
      }),
    ).toBe("life_science");
  });

  it("selects materials science validation defaults for materials projects", () => {
    const profile = buildAgentProfile({
      domain: "materials science",
      hypothesis: "Graphene coating improves electrode stability in a battery prototype.",
    });

    expect(profile.kind).toBe("materials_science");
    expect(profile.validation.primaryMetricName).toContain("material property");
    expect(profile.timelinePhases.map((p) => p.phase)).toEqual(
      expect.arrayContaining(["Synthesis", "Characterization"]),
    );
  });
});
