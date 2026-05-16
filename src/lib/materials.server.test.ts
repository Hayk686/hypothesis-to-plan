import { afterEach, describe, expect, it, vi } from "vitest";

import { runMaterialsResolver } from "./materials.server";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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

  it("matches common cryopreservation consumables against the verified registry", async () => {
    const result = await runMaterialsResolver({
      required_materials: [
        "Cryovials, 2 mL, sterile",
        "Mr. Frosty / controlled-rate freezing container",
        "Tissue culture plasticware (T75, 6-well plates, tips)",
        "Assay reagents",
        "Control samples",
      ],
    });

    expect(result.debug.unmatchedCount).toBe(0);
    expect(result.debug.used_fallback).toBe(false);
    expect(result.data.map((m) => m.catalog)).toEqual(
      expect.arrayContaining(["09-740-71B", "5100-0001", "CLS430641 / CLS3516 / 4803"]),
    );
    expect(result.data.map((m) => m.name)).not.toEqual(
      expect.arrayContaining(["Assay reagents", "Control samples"]),
    );
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

  it("uses Nexar/Octopart as an electronics supplier fallback", async () => {
    vi.stubEnv("NEXAR_CLIENT_ID", "client-id");
    vi.stubEnv("NEXAR_CLIENT_SECRET", "client-secret");
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const href = String(url);
      if (href.includes("identity.nexar.com")) {
        return Response.json({ access_token: "token", expires_in: 3600 });
      }
      return Response.json({
        data: {
          supSearch: {
            results: [
              {
                part: {
                  mpn: "SEN-13322",
                  octopartUrl: "https://octopart.com/sen-13322",
                  shortDescription: "Soil moisture sensor module",
                  manufacturer: { name: "Generic" },
                  sellers: [
                    {
                      company: { name: "Example Distributor" },
                      offers: [
                        {
                          sku: "SKU-13322",
                          clickUrl: "https://example.com/sku-13322",
                          inventoryLevel: 42,
                          prices: [{ quantity: 1, price: 7.5, currency: "USD" }],
                        },
                      ],
                    },
                  ],
                },
              },
            ],
          },
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await runMaterialsResolver({
      required_materials: ["soil moisture sensor module"],
    });

    const material = result.data.find((m) => m.name === "soil moisture sensor module");
    expect(result.debug.nexarMatchedCount).toBe(1);
    expect(material).toMatchObject({
      source: "nexar",
      verified: true,
      supplier: "Example Distributor",
      catalog: "SKU-13322",
      unit_cost: 7.5,
    });
  });
});
