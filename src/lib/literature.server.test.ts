import { describe, expect, it } from "vitest";

import { __literatureTestHooks, type NormalizedPaper } from "./literature.server";

function paper(title: string, abstract: string, citations = 0): NormalizedPaper {
  return {
    id: title,
    title,
    authors: "Test authors",
    year: 2025,
    venue: "Test venue",
    abstract,
    citation_count: citations,
    influential_citation_count: 0,
    source_url: "https://example.com",
    doi: null,
    pmid: null,
    relevance_score: 0.5,
    evidence_role: "background",
    source: "semantic-scholar",
    tldr: null,
  };
}

describe("literature rerank", () => {
  it("prioritizes soil moisture sensor papers over generic site-specific calibration papers", () => {
    const queries = [
      "site-specific calibration curve reduce soil moisture sensor absolute",
      "soil moisture sensor site specific calibration",
      "soil moisture sensor field calibration crop plots",
    ];
    const ranked = __literatureTestHooks.rerank(
      [
        paper(
          "Improving Green Roof Runoff Modeling: The Role of Site-Specific Calibration in SCS-CN Parameters",
          "This paper calibrates hydrologic runoff model parameters for sustainable cities.",
          200,
        ),
        paper(
          "The psychosis metabolic risk calculator: site-specific calibration in two European samples",
          "This paper validates a clinical risk model with site-specific calibration.",
          150,
        ),
        paper(
          "Field calibration of capacitance soil moisture sensors for crop plots",
          "Soil moisture sensor calibration reduced volumetric water content error in irrigated field crop plots.",
          10,
        ),
      ],
      queries,
    );

    expect(ranked[0].title).toContain("soil moisture sensors");
    expect(ranked.slice(0, 2).map((p) => p.title)).not.toEqual(
      expect.arrayContaining([expect.stringContaining("psychosis")]),
    );
  });
});
