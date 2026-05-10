import { describe, expect, it } from "vitest";

import { runMaterialsResolver } from "./materials.server";

describe("runMaterialsResolver", () => {
  it("matches known materials against the verified registry", () => {
    const result = runMaterialsResolver({
      required_materials: ["HeLa cells", "DMSO", "Trypan Blue"],
    });

    expect(result.debug.matchedCount).toBe(3);
    expect(result.debug.unmatchedCount).toBe(0);
    expect(result.debug.used_fallback).toBe(false);
    expect(result.data.map((m) => m.catalog)).toEqual(
      expect.arrayContaining(["93021013-1VL", "D2650-100ML", "T8154-20ML"]),
    );
  });

  it("returns unmatched terms as verify-required line items", () => {
    const result = runMaterialsResolver({
      required_materials: ["HeLa cells", "custom scaffold reagent"],
    });

    const unmatched = result.data.find((m) => m.name === "custom scaffold reagent");
    expect(result.debug.matchedCount).toBe(1);
    expect(result.debug.unmatchedCount).toBe(1);
    expect(result.debug.used_fallback).toBe(true);
    expect(unmatched).toMatchObject({
      catalog: "VERIFY_REQUIRED",
      verified: false,
      unit_cost: 0,
    });
  });
});
