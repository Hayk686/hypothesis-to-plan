import { afterEach, describe, expect, it, vi } from "vitest";

import { runMaterialsResolver } from "./materials.server";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("runMaterialsResolver", () => {
  it("matches known materials against the verified registry", async () => {
    const result = await runMaterialsResolver({
      required_materials: ["HeLa cells", "DMSO", "Trypan Blue"],
    });

    expect(result.debug.matchedCount).toBe(3);
    expect(result.debug.unmatchedCount).toBe(0);
    expect(result.debug.used_fallback).toBe(false);
    expect(result.data.map((m) => m.catalog)).toEqual(
      expect.arrayContaining(["93021013-1VL", "D2650-100ML", "T8154-20ML"]),
    );
  });

  it("returns unmatched terms as verify-required line items", async () => {
    const result = await runMaterialsResolver({
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

  it("does not inject HeLa defaults for non-biological empty requests", async () => {
    const result = await runMaterialsResolver({
      assay_type: "machine learning benchmark",
      required_materials: [],
    });

    expect(result.data.map((m) => m.name)).not.toEqual(expect.arrayContaining(["HeLa cells"]));
    expect(result.data.map((m) => m.catalog)).toEqual(expect.arrayContaining(["VERIFY_REQUIRED"]));
  });

  it("uses PubChem as an identity-only fallback for known chemicals", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          PropertyTable: {
            Properties: [
              {
                CID: 433294,
                MolecularFormula: "LiCl",
                MolecularWeight: 42.39,
                IUPACName: "lithium;chloride",
              },
            ],
          },
        }),
      ),
    );

    const result = await runMaterialsResolver({
      required_materials: ["lithium chloride"],
    });

    const material = result.data.find((m) => m.name === "lithium chloride");
    expect(result.debug.pubchemMatchedCount).toBeGreaterThanOrEqual(1);
    expect(result.debug.used_fallback).toBe(true);
    expect(material).toMatchObject({
      source: "pubchem",
      verified: false,
    });
    expect(material?.catalog).toMatch(/^CID:/);
  });
});
