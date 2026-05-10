// ============================================================
// Materials resolver core (server-only)
// ------------------------------------------------------------
// Used by /api/resolve-materials AND /api/generate-plan.
// Matches requested terms against a curated VERIFIED supplier
// registry. Items not in the registry are returned with
// verified=false and a "verify catalog" note.
// ============================================================

export type ResolveInput = {
  protocol_steps?: unknown;
  organism_or_system?: unknown;
  assay_type?: unknown;
  required_materials?: unknown;
};

export type NormalizedMaterial = {
  name: string;
  matched_term: string;
  supplier: string;
  product: string;
  catalog: string;
  category: "reagent" | "equipment" | "consumable" | "service";
  source_url: string;
  unit_cost: number;
  pack_size: string;
  verified: boolean;
  note: string;
};

export type ResolveDebug = {
  proxyUsed: true;
  registrySize: number;
  requestedTerms: string[];
  matchedCount: number;
  unmatchedCount: number;
  source: "verified-supplier-registry";
  used_fallback: boolean; // true if any unverified items present
};

export type ResolveResult = { data: NormalizedMaterial[]; debug: ResolveDebug };

type RegistryEntry = {
  key: string;
  aliases: string[];
  supplier: string;
  product: string;
  catalog: string;
  category: NormalizedMaterial["category"];
  source_url: string;
  unit_cost: number;
  pack_size: string;
};

const REGISTRY: RegistryEntry[] = [
  {
    key: "HeLa cells",
    aliases: ["hela", "hela cell"],
    supplier: "Sigma-Aldrich / MilliporeSigma",
    product: "HeLa human cervical adenocarcinoma cell line",
    catalog: "93021013-1VL",
    category: "consumable",
    source_url: "https://www.sigmaaldrich.com/US/en/product/sigma/cb_93021013",
    unit_cost: 720,
    pack_size: "1 vial",
  },
  {
    key: "Trehalose",
    aliases: ["trehalose", "d-(+)-trehalose"],
    supplier: "Sigma-Aldrich / MilliporeSigma",
    product: "D-(+)-Trehalose dihydrate, ≥99% (HPLC)",
    catalog: "T9449-25G",
    category: "reagent",
    source_url: "https://www.sigmaaldrich.com/US/en/product/sigma/t9449",
    unit_cost: 145,
    pack_size: "25 g",
  },
  {
    key: "DMSO",
    aliases: ["dmso", "dimethyl sulfoxide"],
    supplier: "Sigma-Aldrich / MilliporeSigma",
    product: "Dimethyl sulfoxide (DMSO), sterile-filtered",
    catalog: "D2650-100ML",
    category: "reagent",
    source_url: "https://www.sigmaaldrich.com/US/en/product/sigma/d2650",
    unit_cost: 95,
    pack_size: "100 mL",
  },
  {
    key: "DMEM",
    aliases: ["dmem", "dulbecco's modified eagle"],
    supplier: "Thermo Fisher Scientific / Gibco",
    product: "DMEM, low glucose, with sodium pyruvate",
    catalog: "31885023",
    category: "reagent",
    source_url: "https://www.thermofisher.com/order/catalog/product/31885023",
    unit_cost: 38,
    pack_size: "500 mL",
  },
  {
    key: "FBS",
    aliases: ["fbs", "fetal bovine serum", "fetal calf serum"],
    supplier: "Sigma-Aldrich / MilliporeSigma",
    product: "Fetal Bovine Serum (FBS), sterile-filtered",
    catalog: "F2442-50ML",
    category: "reagent",
    source_url: "https://www.sigmaaldrich.com/US/en/product/sigma/f2442",
    unit_cost: 95,
    pack_size: "50 mL",
  },
  {
    key: "PBS",
    aliases: ["pbs", "phosphate buffered saline", "phosphate-buffered saline"],
    supplier: "Sigma-Aldrich / MilliporeSigma",
    product: "Phosphate Buffered Saline (PBS)",
    catalog: "P4244-100ML",
    category: "reagent",
    source_url: "https://www.sigmaaldrich.com/US/en/product/sigma/p4244",
    unit_cost: 22,
    pack_size: "100 mL",
  },
  {
    key: "Trypsin-EDTA",
    aliases: ["trypsin", "trypsin-edta", "trypsin edta"],
    supplier: "Sigma-Aldrich / MilliporeSigma",
    product: "Trypsin-EDTA solution, 0.25%",
    catalog: "T4049-100ML",
    category: "reagent",
    source_url: "https://www.sigmaaldrich.com/US/en/product/sigma/t4049",
    unit_cost: 48,
    pack_size: "100 mL",
  },
  {
    key: "Trypan Blue",
    aliases: ["trypan blue", "viability assay reagent", "viability dye"],
    supplier: "Sigma-Aldrich / MilliporeSigma",
    product: "Trypan Blue solution, 0.4%",
    catalog: "T8154-20ML",
    category: "reagent",
    source_url: "https://www.sigmaaldrich.com/US/en/product/sigma/t8154",
    unit_cost: 32,
    pack_size: "20 mL",
  },
];

function normalizeTerms(input: ResolveInput): string[] {
  const out = new Set<string>();
  const contextParts: string[] = [];
  const push = (s: unknown) => {
    if (typeof s === "string" && s.trim()) {
      out.add(s.trim());
    }
  };
  const addContext = (s: unknown) => {
    if (typeof s === "string" && s.trim()) contextParts.push(s.trim());
  };
  if (Array.isArray(input.required_materials)) {
    for (const m of input.required_materials) push(m);
  }
  if (Array.isArray(input.protocol_steps)) {
    for (const step of input.protocol_steps) {
      if (typeof step === "string") {
        push(step);
        addContext(step);
      } else if (step && typeof step === "object") {
        const s = step as { equipment?: unknown; materials?: unknown; description?: unknown };
        if (Array.isArray(s.equipment)) s.equipment.forEach(push);
        if (Array.isArray(s.materials)) s.materials.forEach(push);
        if (typeof s.description === "string") {
          push(s.description);
          addContext(s.description);
        }
      }
    }
  }
  addContext(input.organism_or_system);
  addContext(input.assay_type);
  const context = contextParts.join(" ").toLowerCase();
  if (/hela/.test(context)) out.add("HeLa cells");
  if (/trehalose/.test(context)) out.add("Trehalose");
  if (/dmso|cryo|freez|thaw/.test(context)) out.add("DMSO");
  if (/cell|culture|hela|viability/.test(context)) {
    ["DMEM", "FBS", "PBS", "Trypsin-EDTA"].forEach((s) => out.add(s));
  }
  if (/viability|trypan|count|assay/.test(context)) out.add("Trypan Blue");
  if (out.size === 0) {
    [
      "HeLa cells",
      "Trehalose",
      "DMSO",
      "DMEM",
      "FBS",
      "PBS",
      "Trypsin-EDTA",
      "Trypan Blue",
    ].forEach((s) => out.add(s));
  }
  return Array.from(out);
}

function matchEntry(term: string): RegistryEntry | null {
  const t = term.toLowerCase();
  for (const entry of REGISTRY) {
    if (entry.aliases.some((a) => t.includes(a))) return entry;
  }
  return null;
}

export function runMaterialsResolver(input: ResolveInput): ResolveResult {
  const terms = normalizeTerms(input);
  const seenKeys = new Set<string>();
  const materials: NormalizedMaterial[] = [];
  let unmatched = 0;

  for (const term of terms) {
    const entry = matchEntry(term);
    if (entry) {
      if (seenKeys.has(entry.key)) continue;
      seenKeys.add(entry.key);
      materials.push({
        name: entry.key,
        matched_term: term,
        supplier: entry.supplier,
        product: entry.product,
        catalog: entry.catalog,
        category: entry.category,
        source_url: entry.source_url,
        unit_cost: entry.unit_cost,
        pack_size: entry.pack_size,
        verified: true,
        note: "Verified supplier source — confirm pack size and price before ordering.",
      });
    } else if (term.length <= 60) {
      unmatched += 1;
      materials.push({
        name: term,
        matched_term: term,
        supplier: "—",
        product: term,
        catalog: "VERIFY_REQUIRED",
        category: "consumable",
        source_url: "",
        unit_cost: 0,
        pack_size: "—",
        verified: false,
        note: "Not in verified supplier registry — pick a vendor SKU and verify before ordering.",
      });
    }
  }

  return {
    data: materials,
    debug: {
      proxyUsed: true,
      registrySize: REGISTRY.length,
      requestedTerms: terms,
      matchedCount: materials.filter((m) => m.verified).length,
      unmatchedCount: unmatched,
      source: "verified-supplier-registry",
      used_fallback: unmatched > 0,
    },
  };
}
