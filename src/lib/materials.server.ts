// ============================================================
// Materials resolver core (server-only)
// ------------------------------------------------------------
// Used by /api/resolve-materials AND /api/generate-plan.
// Resolution order:
//   1. Curated verified supplier registry.
//   2. Mouser Search API for electronics/sensors/components (optional key).
//   3. Nexar/Octopart GraphQL for electronics/sensors/components (optional keys).
//   4. PubChem PUG REST for chemical identity validation (free, no key).
// Items without a supplier SKU remain verify-required.
// ============================================================

const PUBCHEM_PROPERTY_ENDPOINT = "https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name";
const PUBCHEM_SUMMARY_ENDPOINT = "https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound";
const MOUSER_KEYWORD_ENDPOINT = "https://api.mouser.com/api/v1.0/search/keyword";
const NEXAR_TOKEN_ENDPOINT = "https://identity.nexar.com/connect/token";
const NEXAR_GRAPHQL_ENDPOINT = "https://api.nexar.com/graphql";
const EXTERNAL_LOOKUP_LIMIT = 6;

export type ResolveInput = {
  protocol_steps?: unknown;
  organism_or_system?: unknown;
  assay_type?: unknown;
  domain?: unknown;
  constraints?: unknown;
  required_materials?: unknown;
};

export type MaterialSource =
  | "verified-supplier-registry"
  | "mouser"
  | "nexar"
  | "pubchem"
  | "unverified";

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
  source: MaterialSource;
  note: string;
};

export type ResolveAttempt = {
  source_name: "mouser" | "nexar" | "pubchem";
  query: string;
  status_code: number;
  result_count: number;
  error_message: string | null;
};

export type ResolveDebug = {
  proxyUsed: true;
  registrySize: number;
  hasMouserApiKey: boolean;
  hasNexarCredentials: boolean;
  requestedTerms: string[];
  matchedCount: number;
  mouserMatchedCount: number;
  nexarMatchedCount: number;
  pubchemMatchedCount: number;
  unmatchedCount: number;
  source: "verified-supplier-registry" | "live-supplier-apis" | "mixed";
  attempts: ResolveAttempt[];
  errors: string[];
  used_fallback: boolean;
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
    product: "D-(+)-Trehalose dihydrate, >=99% (HPLC)",
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
    if (typeof s === "string" && s.trim()) out.add(s.trim());
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
  addContext(input.domain);
  addContext(input.constraints);
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
      "Domain-specific material or data resource",
      "Measurement or instrument access",
      "Raw data recording template",
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

function compactQuery(term: string): string {
  return term
    .replace(/\b(required|material|materials|for|measure|measurement|assay|protocol)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

function shouldTryMouser(term: string): boolean {
  const t = term.toLowerCase();
  return /sensor|battery|electrode|moisture|pm2|air quality|microcontroller|arduino|raspberry|daq|voltage|current|connector|cable|resistor|capacitor|transistor|diode|module|board|probe|meter|logger|graphene/.test(
    t,
  );
}

function shouldTryPubChem(term: string): boolean {
  const t = term.toLowerCase();
  if (
    shouldTryMouser(t) &&
    !/graphene|oxide|electrolyte|carbon|silicon|lithium|sodium|chloride|acid|ethanol|methanol|dmso|buffer|salt|powder|nanoparticle/.test(
      t,
    )
  ) {
    return false;
  }
  return /acid|base|salt|buffer|solution|powder|oxide|graphene|carbon|silicon|lithium|sodium|chloride|ethanol|methanol|dmso|trehalose|glucose|polymer|nanoparticle|reagent|chemical|compound/.test(
    t,
  );
}

type MouserPriceBreak = { Price?: string; Quantity?: number };
type MouserProduct = {
  MouserPartNumber?: string;
  ManufacturerPartNumber?: string;
  Manufacturer?: string;
  Description?: string;
  ProductDetailUrl?: string;
  Category?: string;
  PriceBreaks?: MouserPriceBreak[];
  Availability?: string;
  Min?: string;
};
type MouserResponse = { SearchResults?: { Parts?: MouserProduct[] } };

function parsePrice(price: string | undefined): number {
  const match = (price ?? "").replace(/,/g, "").match(/([0-9]+(?:\.[0-9]+)?)/);
  return match ? Number(match[1]) : 0;
}

async function fetchMouserMaterial(
  term: string,
  apiKey: string | undefined,
): Promise<{ status: number; material: NormalizedMaterial | null; error: string | null }> {
  if (!apiKey) return { status: 0, material: null, error: "Mouser API key missing" };

  const query = compactQuery(term);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const endpoint = process.env.MOUSER_SEARCH_API_URL ?? MOUSER_KEYWORD_ENDPOINT;
    const res = await fetch(`${endpoint}?apiKey=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        SearchByKeywordRequest: {
          keyword: query,
          records: 5,
          startingRecord: 0,
          searchOptions: "None",
          searchWithYourSignUpLanguage: "en-US",
        },
      }),
    });
    clearTimeout(timeoutId);
    if (!res.ok) return { status: res.status, material: null, error: `Mouser HTTP ${res.status}` };

    const json = (await res.json()) as MouserResponse;
    const part = json.SearchResults?.Parts?.find((p) => p.MouserPartNumber && p.ProductDetailUrl);
    if (!part) return { status: res.status, material: null, error: null };

    const price = parsePrice(part.PriceBreaks?.[0]?.Price);
    return {
      status: res.status,
      material: {
        name: term,
        matched_term: term,
        supplier: "Mouser Electronics",
        product: part.Description ?? part.ManufacturerPartNumber ?? term,
        catalog: part.MouserPartNumber ?? "VERIFY_REQUIRED",
        category: /sensor|module|board|meter|logger|probe/i.test(part.Category ?? term)
          ? "equipment"
          : "consumable",
        source_url: part.ProductDetailUrl ?? "",
        unit_cost: price,
        pack_size: part.Min ? `minimum order ${part.Min}` : "1 item",
        verified: true,
        source: "mouser",
        note: `Live Mouser supplier result${part.Availability ? ` - availability: ${part.Availability}` : ""}. Confirm compatibility before ordering.`,
      },
      error: null,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      status: 0,
      material: null,
      error: err instanceof Error ? err.message : "Mouser fetch failed",
    };
  }
}

type NexarCredentials = { clientId?: string; clientSecret?: string };
type NexarTokenCache = { accessToken: string; expiresAt: number };
let nexarTokenCache: NexarTokenCache | null = null;

type NexarPrice = { price?: number; currency?: string; quantity?: number };
type NexarOffer = {
  sku?: string | null;
  clickUrl?: string | null;
  inventoryLevel?: number | null;
  prices?: NexarPrice[] | null;
};
type NexarSeller = {
  company?: { name?: string | null } | null;
  offers?: NexarOffer[] | null;
};
type NexarPart = {
  mpn?: string | null;
  octopartUrl?: string | null;
  shortDescription?: string | null;
  manufacturer?: { name?: string | null } | null;
  sellers?: NexarSeller[] | null;
};
type NexarSearchResponse = {
  data?: {
    supSearch?: {
      results?: Array<{ part?: NexarPart | null }> | null;
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

async function getNexarAccessToken(
  credentials: NexarCredentials,
): Promise<{ status: number; accessToken: string | null; error: string | null }> {
  if (!credentials.clientId || !credentials.clientSecret) {
    return { status: 0, accessToken: null, error: "Nexar credentials missing" };
  }
  if (nexarTokenCache && nexarTokenCache.expiresAt > Date.now() + 60_000) {
    return { status: 200, accessToken: nexarTokenCache.accessToken, error: null };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(process.env.NEXAR_TOKEN_URL ?? NEXAR_TOKEN_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      signal: controller.signal,
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: credentials.clientId,
        client_secret: credentials.clientSecret,
        scope: "supply.domain",
      }),
    });
    clearTimeout(timeoutId);
    if (!res.ok)
      return { status: res.status, accessToken: null, error: `Nexar auth HTTP ${res.status}` };
    const json = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!json.access_token)
      return { status: res.status, accessToken: null, error: "Nexar auth missing access_token" };
    nexarTokenCache = {
      accessToken: json.access_token,
      expiresAt: Date.now() + Math.max(60, json.expires_in ?? 3600) * 1000,
    };
    return { status: res.status, accessToken: json.access_token, error: null };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      status: 0,
      accessToken: null,
      error: err instanceof Error ? err.message : "Nexar auth failed",
    };
  }
}

function bestNexarOffer(part: NexarPart): { seller: string; offer: NexarOffer } | null {
  for (const seller of part.sellers ?? []) {
    for (const offer of seller.offers ?? []) {
      if (offer.sku || offer.clickUrl) {
        return { seller: seller.company?.name ?? "Octopart supplier", offer };
      }
    }
  }
  return null;
}

async function fetchNexarMaterial(
  term: string,
  credentials: NexarCredentials,
): Promise<{ status: number; material: NormalizedMaterial | null; error: string | null }> {
  const token = await getNexarAccessToken(credentials);
  if (!token.accessToken) return { status: token.status, material: null, error: token.error };

  const query = compactQuery(term);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(process.env.NEXAR_GRAPHQL_URL ?? NEXAR_GRAPHQL_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.accessToken}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        query: `
          query SupplierSearch($q: String!) {
            supSearch(q: $q, limit: 5) {
              results {
                part {
                  mpn
                  octopartUrl
                  shortDescription
                  manufacturer { name }
                  sellers {
                    company { name }
                    offers {
                      sku
                      clickUrl
                      inventoryLevel
                      prices { quantity price currency }
                    }
                  }
                }
              }
            }
          }
        `,
        variables: { q: query },
      }),
    });
    clearTimeout(timeoutId);
    if (!res.ok) return { status: res.status, material: null, error: `Nexar HTTP ${res.status}` };
    const json = (await res.json()) as NexarSearchResponse;
    if (json.errors?.length) {
      return {
        status: res.status,
        material: null,
        error: json.errors[0]?.message ?? "Nexar GraphQL error",
      };
    }
    const part = json.data?.supSearch?.results
      ?.map((r) => r.part)
      .find((p): p is NexarPart => Boolean(p?.mpn));
    if (!part) return { status: res.status, material: null, error: null };
    const match = bestNexarOffer(part);
    const price = match?.offer.prices?.[0];
    return {
      status: res.status,
      material: {
        name: term,
        matched_term: term,
        supplier: match?.seller ?? "Octopart / Nexar",
        product: part.shortDescription ?? part.mpn ?? term,
        catalog: match?.offer.sku ?? part.mpn ?? "VERIFY_REQUIRED",
        category: /sensor|module|board|meter|logger|probe/i.test(term) ? "equipment" : "consumable",
        source_url: match?.offer.clickUrl ?? part.octopartUrl ?? "",
        unit_cost: typeof price?.price === "number" ? price.price : 0,
        pack_size: price?.quantity ? `quantity ${price.quantity}` : "1 item",
        verified: Boolean(match?.offer.sku || match?.offer.clickUrl || part.octopartUrl),
        source: "nexar",
        note: `Live Nexar/Octopart supplier result${part.manufacturer?.name ? ` - manufacturer: ${part.manufacturer.name}` : ""}${typeof match?.offer.inventoryLevel === "number" ? ` - inventory: ${match.offer.inventoryLevel}` : ""}. Confirm compatibility before ordering.`,
      },
      error: null,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      status: 0,
      material: null,
      error: err instanceof Error ? err.message : "Nexar fetch failed",
    };
  }
}

type PubChemProperty = {
  PropertyTable?: {
    Properties?: Array<{
      CID?: number;
      MolecularFormula?: string;
      MolecularWeight?: number;
      IUPACName?: string;
    }>;
  };
};

async function fetchPubChemMaterial(
  term: string,
): Promise<{ status: number; material: NormalizedMaterial | null; error: string | null }> {
  const query = compactQuery(term);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(
      `${PUBCHEM_PROPERTY_ENDPOINT}/${encodeURIComponent(
        query,
      )}/property/MolecularFormula,MolecularWeight,IUPACName/JSON`,
      { headers: { Accept: "application/json" }, signal: controller.signal },
    );
    clearTimeout(timeoutId);
    if (!res.ok) return { status: res.status, material: null, error: `PubChem HTTP ${res.status}` };

    const json = (await res.json()) as PubChemProperty;
    const p = json.PropertyTable?.Properties?.[0];
    if (!p?.CID) return { status: res.status, material: null, error: null };

    return {
      status: res.status,
      material: {
        name: term,
        matched_term: term,
        supplier: "PubChem identity record",
        product: p.IUPACName ?? term,
        catalog: `CID:${p.CID}`,
        category: "reagent",
        source_url: `${PUBCHEM_SUMMARY_ENDPOINT}/${p.CID}`,
        unit_cost: 0,
        pack_size: p.MolecularFormula
          ? `${p.MolecularFormula}${p.MolecularWeight ? `; MW ${p.MolecularWeight}` : ""}`
          : "identity record",
        verified: false,
        source: "pubchem",
        note: "Chemical identity verified via PubChem; supplier SKU and price still require manual vendor selection.",
      },
      error: null,
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      status: 0,
      material: null,
      error: err instanceof Error ? err.message : "PubChem fetch failed",
    };
  }
}

function unverifiedMaterial(term: string): NormalizedMaterial {
  return {
    name: term,
    matched_term: term,
    supplier: "-",
    product: term,
    catalog: "VERIFY_REQUIRED",
    category: "consumable",
    source_url: "",
    unit_cost: 0,
    pack_size: "-",
    verified: false,
    source: "unverified",
    note: "Not in verified supplier registry or live supplier sources - pick a vendor SKU and verify before ordering.",
  };
}

export async function runMaterialsResolver(input: ResolveInput): Promise<ResolveResult> {
  const terms = normalizeTerms(input);
  const seenKeys = new Set<string>();
  const materials: NormalizedMaterial[] = [];
  const attempts: ResolveAttempt[] = [];
  const errors: string[] = [];
  const mouserKey = process.env.MOUSER_API_KEY;
  const nexarCredentials = {
    clientId: process.env.NEXAR_CLIENT_ID,
    clientSecret: process.env.NEXAR_CLIENT_SECRET,
  };
  let verifyRequired = 0;
  let mouserMatched = 0;
  let nexarMatched = 0;
  let pubchemMatched = 0;
  let externalLookups = 0;

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
        source: "verified-supplier-registry",
        note: "Verified supplier source - confirm pack size and price before ordering.",
      });
      continue;
    }

    if (term.length > 90) continue;

    let resolved: NormalizedMaterial | null = null;
    if (externalLookups < EXTERNAL_LOOKUP_LIMIT && shouldTryMouser(term)) {
      externalLookups += 1;
      const r = await fetchMouserMaterial(term, mouserKey);
      attempts.push({
        source_name: "mouser",
        query: compactQuery(term),
        status_code: r.status,
        result_count: r.material ? 1 : 0,
        error_message: r.error,
      });
      if (r.error && r.error !== "Mouser API key missing") errors.push(r.error);
      if (r.material) {
        resolved = r.material;
        mouserMatched += 1;
      }
    }

    if (!resolved && externalLookups < EXTERNAL_LOOKUP_LIMIT && shouldTryMouser(term)) {
      externalLookups += 1;
      const r = await fetchNexarMaterial(term, nexarCredentials);
      attempts.push({
        source_name: "nexar",
        query: compactQuery(term),
        status_code: r.status,
        result_count: r.material ? 1 : 0,
        error_message: r.error,
      });
      if (r.error && r.error !== "Nexar credentials missing") errors.push(r.error);
      if (r.material) {
        resolved = r.material;
        nexarMatched += 1;
      }
    }

    if (!resolved && externalLookups < EXTERNAL_LOOKUP_LIMIT && shouldTryPubChem(term)) {
      externalLookups += 1;
      const r = await fetchPubChemMaterial(term);
      attempts.push({
        source_name: "pubchem",
        query: compactQuery(term),
        status_code: r.status,
        result_count: r.material ? 1 : 0,
        error_message: r.error,
      });
      if (r.error) errors.push(r.error);
      if (r.material) {
        resolved = r.material;
        pubchemMatched += 1;
      }
    }

    if (resolved) {
      materials.push(resolved);
      if (!resolved.verified) verifyRequired += 1;
    } else {
      verifyRequired += 1;
      materials.push(unverifiedMaterial(term));
    }
  }

  const matchedCount = materials.filter((m) => m.verified).length;
  const liveCount = mouserMatched + nexarMatched + pubchemMatched;

  return {
    data: materials,
    debug: {
      proxyUsed: true,
      registrySize: REGISTRY.length,
      hasMouserApiKey: Boolean(mouserKey),
      hasNexarCredentials: Boolean(nexarCredentials.clientId && nexarCredentials.clientSecret),
      requestedTerms: terms,
      matchedCount,
      mouserMatchedCount: mouserMatched,
      nexarMatchedCount: nexarMatched,
      pubchemMatchedCount: pubchemMatched,
      unmatchedCount: verifyRequired,
      source:
        liveCount > 0 && matchedCount > 0
          ? "mixed"
          : liveCount > 0
            ? "live-supplier-apis"
            : "verified-supplier-registry",
      attempts,
      errors: Array.from(new Set(errors)).slice(0, 5),
      used_fallback: verifyRequired > 0,
    },
  };
}
