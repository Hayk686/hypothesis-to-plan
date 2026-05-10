import { describe, expect, it } from "vitest";

import { runLlmOrchestrator } from "./llm.server";

describe("runLlmOrchestrator", () => {
  it("returns an explicit fallback result when no LLM key is configured", async () => {
    const previousOpenRouter = process.env.OPENROUTER_API_KEY;
    const previousNvidia = process.env.NVIDIA_API_KEY;
    const previousNim = process.env.NVIDIA_NIM_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.NVIDIA_API_KEY;
    delete process.env.NVIDIA_NIM_API_KEY;

    try {
      const result = await runLlmOrchestrator({
        project: {
          title: "Test plan",
          hypothesis: "A bounded hypothesis",
          domain: "Cell biology",
          organism_or_system: "HeLa",
          budget_cap: 1000,
          timeline_weeks: 4,
          constraints: "",
        },
        papers: [],
        protocols: [],
      });

      expect(result.plan).toBeNull();
      expect(result.debug.provider).toBe("none");
      expect(result.debug.used_fallback).toBe(true);
      expect(result.debug.error).toContain("No LLM key configured");
    } finally {
      if (previousOpenRouter) process.env.OPENROUTER_API_KEY = previousOpenRouter;
      if (previousNvidia) process.env.NVIDIA_API_KEY = previousNvidia;
      if (previousNim) process.env.NVIDIA_NIM_API_KEY = previousNim;
    }
  });
});
