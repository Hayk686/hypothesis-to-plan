import { describe, expect, it } from "vitest";
import { runLiteratureSearch } from "./literature.server";
import { runProtocolsSearch } from "./protocols.server";
import { runLlmOrchestrator } from "./llm.server";
import { runMaterialsResolver } from "./materials.server";
import { buildAgentProfile } from "./agentProfile.server";

describe("Detailed Pipeline Verification: Soil Moisture Calibration", () => {
  it("executes the end-to-end planning pipeline", async () => {
    const project = {
      title: "Soil Moisture Sensor Calibration for Field Plots",
      hypothesis:
        "A site-specific calibration curve will reduce soil moisture sensor absolute error by at least 20% compared with the manufacturer default calibration across field crop plots.",
      domain: "Climate Science",
      organism: "Field soil moisture sensor network",
      budget: 12000,
      timelineWeeks: 5,
      resources: "Soil moisture sensors, gravimetric sampling supplies, field plot access",
      constraints: "Collect duplicate samples and record weather metadata for every field visit.",
    };

    console.log("=== STEP 1: Building Agent Profile ===");
    const profile = buildAgentProfile({
      hypothesis: project.hypothesis,
      domain: project.domain,
      organism_or_system: project.organism,
      constraints: project.constraints,
    });
    console.log("Agent Profile Kind:", profile.kind);

    console.log("\n=== STEP 2: Running Literature Search (Parallel) ===");
    const lit = await runLiteratureSearch({
      hypothesis: project.hypothesis,
      domain: project.domain,
      organism_or_system: project.organism,
      constraints: project.constraints,
    });
    console.log("Literature Source:", lit.debug.source);
    console.log("Papers Found:", lit.data.length);
    if (lit.data.length > 0) {
      console.log("Top Paper Title:", lit.data[0].title);
      console.log("Top Paper Relevance:", lit.data[0].relevance_score);
    }

    console.log("\n=== STEP 3: Running Protocols Search (Parallel) ===");
    const proto = await runProtocolsSearch({
      hypothesis: project.hypothesis,
      domain: project.domain,
      organism_or_system: project.organism,
      constraints: project.constraints,
    });
    console.log("Protocols Source:", proto.debug.source);
    console.log("Protocols Found:", proto.data.length);
    if (proto.data.length > 0) {
      console.log("Top Protocol Title:", proto.data[0].title);
    }

    console.log("\n=== STEP 4: Running LLM Plan Generation ===");
    const llm = await runLlmOrchestrator({
      project: {
        title: project.title,
        hypothesis: project.hypothesis,
        domain: project.domain,
        organism_or_system: project.organism,
        budget_cap: project.budget,
        timeline_weeks: project.timelineWeeks,
        constraints: project.constraints,
      },
      papers: lit.data,
      protocols: proto.data,
      feedback: [],
    });

    console.log("LLM Used Fallback:", llm.debug.used_fallback);
    if (llm.plan) {
      console.log("LLM Generated Plan:", JSON.stringify(llm.plan, null, 2));
    } else {
      console.log("LLM plan was null, error:", llm.debug.error);
    }

    console.log("\n=== STEP 5: Running Materials Resolution ===");
    const materialsList =
      llm.plan?.experimental_strategy?.required_materials && llm.plan.experimental_strategy.required_materials.length > 0
        ? llm.plan.experimental_strategy.required_materials
        : profile.defaultMaterials;
    const mat = await runMaterialsResolver({
      organism_or_system: project.organism,
      assay_type: project.domain,
      domain: project.domain,
      constraints: project.constraints,
      required_materials: materialsList,
      protocol_steps: proto.data.map((p) => ({
        description: `${p.title}. ${p.description}`,
        equipment: materialsList,
      })),
    });
    console.log("Materials matched:", mat.data.length);
    if (mat.data.length > 0) {
      console.log("First Material Matched:", mat.data[0].name, "Supplier:", mat.data[0].supplier, "Cost:", mat.data[0].unit_cost);
    }

    // Verify some baseline expectations
    expect(lit.data).toBeDefined();
    expect(proto.data).toBeDefined();
    expect(mat.data).toBeDefined();
  }, 90000);
});
