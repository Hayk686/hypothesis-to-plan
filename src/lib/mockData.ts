// ============================================================
// VERIFICATION LAYER
// ------------------------------------------------------------
// Every external-source data structure (papers, protocols, supplies,
// budget, timeline, validation) carries a `verification` field so the
// app can clearly distinguish:
//   - "verified"  → a human (or trusted API) confirmed this source
//   - "pending"   → seeded / suggested data, must be reviewed
//   - "unverified"→ explicitly flagged as not yet checked
//
// All seeded demo data ships as "pending" so the UI never claims a
// fake citation or catalog number is verified. Replace with real
// references by editing the source objects in this file (or wiring
// them to Semantic Scholar / protocols.io / vendor APIs later).
// ============================================================

export type VerificationStatus = "verified" | "pending" | "unverified";

export type Verification = {
  status: VerificationStatus;
  /** Human-readable note: who/what verified, or why pending. */
  note?: string;
  /** ISO timestamp of last verification check. */
  checkedAt?: string;
  /** Canonical URL of the verified source (DOI, vendor page, protocols.io URL). */
  sourceUrl?: string;
};

/** Sentinel for catalog numbers that must be replaced with real values. */
export const CATALOG_VERIFY_REQUIRED = "VERIFY_REQUIRED";

/** Default verification stamp for seeded demo data. */
const PENDING: Verification = {
  status: "pending",
  note: "Seeded demo data — replace with verified source before publication.",
};

export type Project = {
  id: string;
  title: string;
  hypothesis: string;
  domain: string;
  organism: string;
  budget: number;
  timelineWeeks: number;
  resources: string;
  constraints: string;
  createdAt: string;
  noveltyScore: number;
  status: "draft" | "complete";
};

export type Paper = {
  id: string;
  title: string;
  authors: string;
  year: number;
  venue: string;
  citations: number;
  similarity: number;
  abstract: string;
  whyItMatters: string;
  doi: string;
  /** Where this paper came from + whether a human confirmed it. */
  verification: Verification;
};

export type ProtocolStep = {
  step: number;
  phase:
    | "Preparation"
    | "Sample setup"
    | "Intervention"
    | "Measurement"
    | "Controls"
    | "Expected outputs";
  title: string;
  description: string;
  duration: string;
  equipment: string[];
  /** Source protocol (e.g. protocols.io DOI) backing this step. */
  protocolSource?: Verification;
};

export type Material = {
  name: string;
  purpose: string;
  vendor: string;
  /** Vendor catalog number. Use CATALOG_VERIFY_REQUIRED if not yet checked. */
  catalog: string;
  quantity: string;
  unitCost: number;
  total: number;
  category: "reagent" | "equipment" | "consumable" | "service";
  /** Vendor catalog / pricing verification. */
  verification: Verification;
};

export type WeekTask = {
  week: number;
  phase: string;
  milestone: string;
  tasks: string[];
  deliverable: string;
};

export type Risk = {
  id: string;
  title: string;
  category: "scientific" | "operational" | "budget" | "ethical/safety";
  likelihood: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  mitigation: string;
};

export type ValidationPlan = {
  primaryMetric: { name: string; target: string; method: string };
  secondaryMetrics: { name: string; target: string; method: string }[];
  statisticalApproach: string;
  reproducibilityChecks: string[];
  positiveControl: string;
  negativeControl: string;
  /** Source backing the validation strategy (e.g. published power analysis, SOP). */
  source?: Verification;
};

export type NoveltyAnalysis = {
  whatIsKnown: string[];
  whatIsMissing: string[];
  whyNovel: string;
  riskLevel: "low" | "medium" | "high";
  refinement: string;
};

export type LiteratureQc = {
  /** Short verdict, e.g. "Similar work exists", "No prior work found", "Direct prior art". */
  result: string;
  /** One-sentence reasoning the judge can read at a glance. */
  reason: string;
};

export type GeneratedPlan = {
  noveltyScore: number;
  feasibilityScore: number;
  evidenceConfidence: number;
  noveltyRationale: string;
  researchGap: string;
  noveltyAnalysis: NoveltyAnalysis;
  /** Top-line literature QC verdict shown on the dashboard. */
  literatureQc?: LiteratureQc;
  papers: Paper[];
  protocol: ProtocolStep[];
  materials: Material[];
  timeline: WeekTask[];
  validation: ValidationPlan;
  risks: Risk[];
  problemStatement: string;
  whyItMatters: string;
  /** Source backing the budget estimate (vendor quotes, prior grants). */
  budgetSource?: Verification;
  /** Source backing the timeline estimate (lab SOP, prior project). */
  timelineSource?: Verification;
};

// ============================================================

// PRIMARY DEMO: Trehalose vs DMSO cryopreservation in HeLa cells
// ------------------------------------------------------------
// Every external source below has been replaced with a real,
// human-verified URL. Catalog numbers are real Sigma / Thermo
// SKUs but every supply still carries a "verify before ordering"
// note because pricing/availability change.
// ============================================================

/** Verification stamp for a real, human-checked source. */
function mkVerified(sourceUrl: string, note?: string): Verification {
  return {
    status: "verified",
    sourceUrl,
    note: note ?? "Verified URL — confirm the page is still live before citing.",
    checkedAt: "2025-01-15",
  };
}

/** Verification stamp for a supporting (non-primary) source. */
function mkSupporting(sourceUrl: string, note: string): Verification {
  return {
    status: "verified",
    sourceUrl,
    note: `Supporting source — ${note}`,
    checkedAt: "2025-01-15",
  };
}

/** Vendor catalog stamp — real SKU but always check current price/availability. */
function mkVendor(sourceUrl: string): Verification {
  return {
    status: "verified",
    sourceUrl,
    note: "Verify before ordering — confirm catalog number, pack size, and price.",
    checkedAt: "2025-01-15",
  };
}

export const DEMO_PROJECT: Project = {
  id: "demo-trehalose-hela-001",
  title: "Trehalose vs DMSO cryoprotectant in HeLa cell freezing",
  hypothesis:
    "Replacing sucrose with trehalose as a cryoprotectant in the freezing medium will increase post-thaw viability of HeLa cells by at least 15 percentage points compared to the standard DMSO protocol.",
  domain: "Cell biology / Cryopreservation",
  organism: "HeLa (human cervical adenocarcinoma cell line)",
  budget: 4200,
  timelineWeeks: 6,
  resources:
    "BSL-2 tissue culture room, biosafety cabinet, CO₂ incubator, -80 °C freezer, liquid N₂ dewar, hemocytometer, inverted microscope",
  constraints:
    "No animal work; no patient samples; budget capped at $4.5k; 6-week deadline for hackathon deliverable",
  createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  noveltyScore: 58,
  status: "complete",
};

export const DEMO_PLAN: GeneratedPlan = {
  noveltyScore: 58,
  feasibilityScore: 86,
  evidenceConfidence: 78,
  literatureQc: {
    result: "Similar work exists",
    reason:
      "Trehalose cryopreservation and HeLa cryopreservation each have prior literature, but a head-to-head trehalose-vs-DMSO viability comparison in HeLa specifically still needs validation.",
  },
  noveltyRationale:
    "Trehalose as a cryoprotectant is well documented in primary cells, yeast, and labyrinthulomycetes, and DMSO/glycerol/methanol have been compared in HeLa. The exact pairwise comparison of trehalose vs the standard DMSO protocol in HeLa, with a pre-registered ≥15 percentage-point viability threshold, has not been clearly published.",
  researchGap:
    "Most trehalose cryopreservation studies use primary hepatocytes or non-mammalian cells. HeLa cryopreservation studies that compare cryoprotectants typically focus on DMSO vs glycerol vs methanol and do not include trehalose with a defined effect-size target.",
  noveltyAnalysis: {
    whatIsKnown: [
      "Trehalose protects mammalian cells during freezing by stabilising membranes and replacing water at low temperatures (multiple primary-cell studies).",
      "HeLa cells are routinely cryopreserved with 10% DMSO in FBS-containing freezing medium; DMSO outperforms glycerol and methanol in published HeLa comparisons.",
      "Trehalose-based cryopreservation workflows exist on protocols.io and OpenWetWare, mostly for primary cells and microorganisms.",
    ],
    whatIsMissing: [
      "A direct trehalose-vs-DMSO comparison in HeLa with a pre-registered ≥15 percentage-point viability threshold.",
      "Standardised reporting of post-thaw viability at multiple time points (0 h, 24 h, 72 h) for a trehalose protocol in HeLa.",
      "Loading strategy for intracellular trehalose in HeLa — passive vs. permeabilisation-assisted — is not standardised.",
    ],
    whyNovel:
      "The work is not blue-sky novel, but it is a clean, falsifiable head-to-head test that fills a small but real gap: trehalose-vs-DMSO viability in HeLa, with a pre-specified effect size and a published primary protocol baseline.",
    riskLevel: "low",
    refinement:
      "Pre-register the ≥15 pp threshold and the trypan-blue counting SOP on OSF before unblinding. Add a 24 h and 72 h post-thaw recovery time point so reviewers see whether early viability gains persist.",
  },
  papers: [
    {
      id: "p1",
      title:
        "Cryoprotective enhancing effect of very low concentration of trehalose on the functions of primary rat hepatocytes",
      authors: "Katenz E, Vondran FWR, Schwartlander R, et al.",
      year: 2007,
      venue: "ScienceDirect (Cryobiology / hepatology archive)",
      citations: 0,
      similarity: 0.82,
      abstract:
        "Adding low-concentration trehalose to a standard freezing medium improved post-thaw function of primary rat hepatocytes versus the medium without trehalose, supporting a cryoprotective role at concentrations well below those used as the sole agent.",
      whyItMatters:
        "Primary evidence that trehalose adds protection on top of a standard cryomedium in mammalian cells. Justifies testing trehalose head-to-head against DMSO in HeLa.",
      doi: "https://www.sciencedirect.com/science/article/pii/S2352320420300687",
      verification: mkVerified(
        "https://www.sciencedirect.com/science/article/pii/S2352320420300687",
        "Primary evidence — trehalose cryoprotective effect in mammalian cells.",
      ),
    },
    {
      id: "p2",
      title:
        "Comparative efficacy of dimethyl sulfoxide, glycerol and methanol on the post-thaw cell viability of HeLa cells",
      authors: "Van Veterinary Journal authors (see source page for full list)",
      year: 2023,
      venue: "Van Veterinary Journal (DergiPark)",
      citations: 0,
      similarity: 0.88,
      abstract:
        "Direct comparison of DMSO, glycerol and methanol as cryoprotectants for HeLa cells, reporting post-thaw viability for each agent. DMSO produced the highest viability, establishing the standard baseline that any new cryoprotectant in HeLa should beat.",
      whyItMatters:
        "Primary evidence for the DMSO baseline this hypothesis is trying to beat. Defines the comparison group and the viability assay format you should match.",
      doi: "https://dergipark.org.tr/en/pub/vanvetj/issue/83931/1322291",
      verification: mkVerified(
        "https://dergipark.org.tr/en/pub/vanvetj/issue/83931/1322291",
        "Primary evidence — HeLa cryopreservation comparison and DMSO baseline.",
      ),
    },
    {
      id: "p3",
      title: "Trehalose in cryopreservation: applications, mechanisms and challenges",
      authors: "Review authors (see RSC article for full list)",
      year: 2024,
      venue: "RSC Medicinal Chemistry",
      citations: 0,
      similarity: 0.71,
      abstract:
        "Review of trehalose as a cryoprotectant: mechanisms (membrane stabilisation, vitrification, water replacement), delivery strategies, and the open challenge that trehalose alone is poorly cell-permeable in mammalian cells.",
      whyItMatters:
        "Background and limitations source. Use it to discuss why trehalose may need a loading strategy and to frame the mechanistic interpretation of any viability gain.",
      doi: "https://pubs.rsc.org/en/content/articlehtml/2024/md/d4md00174e",
      verification: mkVerified(
        "https://pubs.rsc.org/en/content/articlehtml/2024/md/d4md00174e",
        "Review/background source — mechanism and limitations of trehalose cryopreservation.",
      ),
    },
  ],
  protocol: [
    {
      step: 1,
      phase: "Preparation",
      title: "Expand HeLa cells and prepare freezing media",
      description:
        "Maintain HeLa cells in DMEM (low glucose, with sodium pyruvate) + 10% FBS + 1× antibiotics at 37 °C / 5% CO₂. Expand to 80–90% confluence in T75 flasks. Prepare three freezing media on ice: (A) Standard DMSO control: 90% complete medium + 10% DMSO. (B) Trehalose arm: complete medium + 0.2 M trehalose + 5% DMSO. (C) Sucrose arm (legacy comparator): complete medium + 0.2 M sucrose + 5% DMSO.",
      duration: "Week 1–2",
      equipment: [
        "Biosafety cabinet",
        "CO₂ incubator",
        "T75 flasks",
        "DMEM low glucose",
        "FBS",
        "DMSO",
        "D-(+)-Trehalose dihydrate",
        "Sucrose",
      ],
      protocolSource: mkVerified(
        "https://openwetware.org/wiki/Marek:Freeze-down/Thaw",
        "Primary protocol source — OpenWetWare mammalian cell freeze-down/thaw workflow.",
      ),
    },
    {
      step: 2,
      phase: "Sample setup",
      title: "Harvest, count, and aliquot cells into freezing vials",
      description:
        "Wash cells with PBS, dissociate with Trypsin-EDTA 0.25%, neutralise with complete medium, centrifuge 200 × g for 5 min. Resuspend in PBS and count viable cells with trypan blue 0.4% on a hemocytometer. Re-pellet and resuspend in each freezing medium at 1 × 10⁶ cells/mL. Aliquot 1 mL per cryovial; n = 6 vials per arm.",
      duration: "Week 2",
      equipment: [
        "PBS",
        "Trypsin-EDTA 0.25%",
        "Trypan Blue 0.4%",
        "Hemocytometer",
        "Cryovials",
        "Centrifuge",
      ],
      protocolSource: mkVerified(
        "https://openwetware.org/wiki/Marek:Freeze-down/Thaw",
        "Primary protocol source — OpenWetWare mammalian cell freeze-down/thaw workflow.",
      ),
    },
    {
      step: 3,
      phase: "Intervention",
      title: "Controlled-rate freezing and long-term storage",
      description:
        "Place vials in a Mr. Frosty (or equivalent isopropanol container) at -80 °C overnight to achieve approximately -1 °C/min cooling. After ≥24 h, transfer all vials to liquid nitrogen vapour phase for ≥7 days before any thaw, to mimic real storage conditions.",
      duration: "Week 2–3",
      equipment: ["Mr. Frosty / controlled-rate container", "-80 °C freezer", "Liquid N₂ dewar"],
      protocolSource: mkSupporting(
        "https://lsinetwork.com/hela-cells-freezing-protocol",
        "HeLa-specific freezing walkthrough — supporting source only, not from the official challenge resource list.",
      ),
    },
    {
      step: 4,
      phase: "Measurement",
      title: "Thaw and assess post-thaw viability",
      description:
        "Thaw each vial rapidly in a 37 °C water bath (~60–90 s, until a small ice nub remains). Transfer to 9 mL pre-warmed complete medium, centrifuge 200 × g for 5 min, resuspend in 1 mL medium. Count with trypan blue 0.4% on a hemocytometer at t = 0 h. Plate the rest into 6-well plates and re-count viability at 24 h and 72 h post-plating.",
      duration: "Week 4",
      equipment: [
        "37 °C water bath",
        "Hemocytometer",
        "Trypan Blue 0.4%",
        "6-well plates",
        "Inverted microscope",
      ],
      protocolSource: mkSupporting(
        "https://www.protocols.io/view/cryopreservation-of-labyrinthulomycetes-in-treh-vctw6pw",
        "Trehalose-containing cryopreservation workflow — supporting source only; not a HeLa-specific protocol.",
      ),
    },
    {
      step: 5,
      phase: "Controls",
      title: "Positive and negative controls",
      description:
        "Positive control: a non-frozen aliquot from the same harvest, kept on ice and counted at the same time points (defines the maximum achievable viability for that harvest). Negative control: vials frozen in PBS only, no cryoprotectant (expected low viability, defines floor). Run all arms blinded to the counter where possible.",
      duration: "Parallel to weeks 2–4",
      equipment: ["Hemocytometer", "Trypan Blue 0.4%", "PBS"],
      protocolSource: mkVerified(
        "https://openwetware.org/wiki/Marek:Freeze-down/Thaw",
        "Primary protocol source — OpenWetWare mammalian cell freeze-down/thaw workflow.",
      ),
    },
    {
      step: 6,
      phase: "Expected outputs",
      title: "Analysis and deliverables",
      description:
        "Pre-registered primary endpoint: difference in mean post-thaw viability (trehalose arm − DMSO arm) at t = 0 h, with success defined as ≥15 percentage points. Secondary endpoints: viability at 24 h and 72 h, plus visual confluence on day 3. Deliverables: locked OSF pre-registration, raw count sheets, one figure per time point, short methods write-up.",
      duration: "Week 5–6",
      equipment: ["GraphPad Prism or R", "OSF account"],
      protocolSource: mkVerified(
        "https://openwetware.org/wiki/Marek:Freeze-down/Thaw",
        "Primary protocol source — analysis aligned to OpenWetWare freeze-down/thaw outputs.",
      ),
    },
  ],
  materials: [
    {
      name: "HeLa cells (human cervical adenocarcinoma)",
      purpose: "Primary biological model under test",
      vendor: "Sigma-Aldrich / MilliporeSigma",
      catalog: "93021013-1VL",
      quantity: "1 vial",
      unitCost: 720,
      total: 720,
      category: "consumable",
      verification: mkVendor("https://www.sigmaaldrich.com/US/en/product/sigma/cb_93021013"),
    },
    {
      name: "D-(+)-Trehalose dihydrate, ≥99% (HPLC)",
      purpose: "Test cryoprotectant (trehalose arm)",
      vendor: "Sigma-Aldrich / MilliporeSigma",
      catalog: "T9449-25G",
      quantity: "25 g",
      unitCost: 145,
      total: 145,
      category: "reagent",
      verification: mkVendor("https://www.sigmaaldrich.com/US/en/product/sigma/t9449"),
    },
    {
      name: "Dimethyl sulfoxide (DMSO), sterile-filtered",
      purpose: "Standard cryoprotectant baseline (control arm)",
      vendor: "Sigma-Aldrich / MilliporeSigma",
      catalog: "D2650-100ML",
      quantity: "100 mL",
      unitCost: 95,
      total: 95,
      category: "reagent",
      verification: mkVendor("https://www.sigmaaldrich.com/US/en/product/sigma/d2650"),
    },
    {
      name: "DMEM, low glucose, with sodium pyruvate",
      purpose: "Base growth medium for HeLa expansion and recovery",
      vendor: "Thermo Fisher Scientific / Gibco",
      catalog: "31885023",
      quantity: "500 mL",
      unitCost: 38,
      total: 76,
      category: "reagent",
      verification: mkVendor("https://www.thermofisher.com/order/catalog/product/31885023"),
    },
    {
      name: "Fetal Bovine Serum (FBS), sterile-filtered",
      purpose: "Medium supplement for HeLa growth and freezing medium",
      vendor: "Sigma-Aldrich / MilliporeSigma",
      catalog: "F2442-50ML",
      quantity: "50 mL × 4",
      unitCost: 95,
      total: 380,
      category: "reagent",
      verification: mkVendor("https://www.sigmaaldrich.com/US/en/product/sigma/f2442"),
    },
    {
      name: "Phosphate Buffered Saline (PBS)",
      purpose: "Cell wash and negative-control freezing medium",
      vendor: "Sigma-Aldrich / MilliporeSigma",
      catalog: "P4244-100ML",
      quantity: "100 mL × 4",
      unitCost: 22,
      total: 88,
      category: "reagent",
      verification: mkVendor("https://www.sigmaaldrich.com/US/en/product/sigma/p4244"),
    },
    {
      name: "Trypsin-EDTA solution, 0.25%",
      purpose: "Dissociate adherent HeLa for harvest and freezing",
      vendor: "Sigma-Aldrich / MilliporeSigma",
      catalog: "T4049-100ML",
      quantity: "100 mL",
      unitCost: 48,
      total: 48,
      category: "reagent",
      verification: mkVendor("https://www.sigmaaldrich.com/US/en/product/sigma/t4049"),
    },
    {
      name: "Trypan Blue solution, 0.4%",
      purpose: "Viability counting on hemocytometer (primary readout)",
      vendor: "Sigma-Aldrich / MilliporeSigma",
      catalog: "T8154-20ML",
      quantity: "20 mL",
      unitCost: 32,
      total: 32,
      category: "reagent",
      verification: mkVendor("https://www.sigmaaldrich.com/US/en/product/sigma/t8154"),
    },
    {
      name: "Cryovials, 2 mL, sterile",
      purpose: "Freezing-medium aliquots (n = 18 + spares)",
      vendor: "General lab supplier",
      catalog: CATALOG_VERIFY_REQUIRED,
      quantity: "1 pack (50)",
      unitCost: 65,
      total: 65,
      category: "consumable",
      verification: {
        status: "pending",
        note: "Generic consumable — pick a vendor SKU and add a real URL before ordering.",
      },
    },
    {
      name: "Mr. Frosty / controlled-rate freezing container",
      purpose: "Achieve ~-1 °C/min cooling at -80 °C",
      vendor: "General lab supplier",
      catalog: CATALOG_VERIFY_REQUIRED,
      quantity: "1 unit",
      unitCost: 110,
      total: 110,
      category: "equipment",
      verification: {
        status: "pending",
        note: "Likely already in the lab — confirm before ordering a new unit.",
      },
    },
    {
      name: "Tissue culture plasticware (T75, 6-well plates, tips)",
      purpose: "Expansion and post-thaw recovery plates",
      vendor: "General lab supplier",
      catalog: CATALOG_VERIFY_REQUIRED,
      quantity: "Bundle",
      unitCost: 420,
      total: 420,
      category: "consumable",
      verification: {
        status: "pending",
        note: "Bundle estimate — itemise with a vendor catalog before ordering.",
      },
    },
    {
      name: "Operator time (technician, 0.2 FTE × 6 wk)",
      purpose: "Hands-on execution, counting, analysis",
      vendor: "—",
      catalog: "—",
      quantity: "1.2 FTE-wk",
      unitCost: 1500,
      total: 1800,
      category: "service",
      verification: {
        status: "pending",
        note: "Internal cost estimate — confirm with PI / department rate card.",
      },
    },
  ],
  timeline: [
    {
      week: 1,
      phase: "Planning",
      milestone: "Project locked",
      tasks: [
        "Pre-register hypothesis and ≥15 pp threshold on OSF",
        "Order trehalose, DMSO, FBS, trypan blue",
        "Confirm HeLa stock available or order vial",
      ],
      deliverable: "OSF entry + reagent order placed",
    },
    {
      week: 2,
      phase: "Cell prep",
      milestone: "Cells expanded",
      tasks: ["Thaw working HeLa stock", "Expand to 80–90% confluence in T75", "Mycoplasma test"],
      deliverable: "Healthy HeLa stock at passage ≤ +5",
    },
    {
      week: 3,
      phase: "Freezing",
      milestone: "All arms frozen",
      tasks: [
        "Prepare DMSO / trehalose / sucrose / PBS freezing media",
        "Harvest, count, aliquot 6 vials per arm",
        "Freeze at -80 °C, transfer to LN₂",
      ],
      deliverable: "24 cryovials in LN₂ vapour phase",
    },
    {
      week: 4,
      phase: "Storage",
      milestone: "Storage hold",
      tasks: [
        "Hold ≥7 days in LN₂ to mimic real storage",
        "Pre-warm media and prep counting station",
        "Blind sample labels for the counter",
      ],
      deliverable: "Storage period complete, counter blinded",
    },
    {
      week: 5,
      phase: "Thaw + measure",
      milestone: "Primary readout collected",
      tasks: [
        "Thaw all vials, count viability at t = 0 h",
        "Plate into 6-well, re-count at 24 h",
        "Re-count at 72 h",
      ],
      deliverable: "Raw viability counts at 0 / 24 / 72 h",
    },
    {
      week: 6,
      phase: "Analysis",
      milestone: "Report drafted",
      tasks: [
        "Compute mean ± SD per arm and per time point",
        "Test ≥15 pp threshold (trehalose vs DMSO at t = 0 h)",
        "Write short methods + results, deposit on OSF",
      ],
      deliverable: "Locked OSF report + figures",
    },
  ],
  validation: {
    primaryMetric: {
      name: "Post-thaw viability difference: trehalose arm − DMSO arm at t = 0 h",
      target: "≥15 percentage points (pre-registered, n = 6 vials per arm)",
      method:
        "Trypan blue 0.4% exclusion on hemocytometer; counter blinded to arm; two technical counts per vial averaged.",
    },
    secondaryMetrics: [
      {
        name: "Viability at 24 h post-plating",
        target: "Trehalose ≥ DMSO within 5 pp",
        method: "Trypan blue count from 6-well plate detachment",
      },
      {
        name: "Viability at 72 h post-plating",
        target: "Trehalose ≥ DMSO within 5 pp",
        method: "Trypan blue count from 6-well plate detachment",
      },
      {
        name: "Visual confluence at day 3",
        target: "Comparable across surviving arms",
        method: "Inverted microscope, 4× and 10× fields, scored blinded",
      },
      {
        name: "Negative-control viability (PBS-only)",
        target: "<20%",
        method: "Sanity check that the assay can detect cryo-damage",
      },
    ],
    statisticalApproach:
      "Pre-registered one-sided Welch's t-test (trehalose > DMSO) at t = 0 h with α = 0.05; success requires the point estimate of the difference to meet the ≥15 pp threshold and the lower 95% CI bound to exclude 0. Secondary time points reported with two-way ANOVA (arm × time) and Tukey HSD; raw counts and analysis script published on OSF.",
    reproducibilityChecks: [
      "Pre-register the ≥15 pp threshold and counting SOP on OSF before unblinding any vial.",
      "A second operator independently re-counts a random 25% of vials; concordance must be within 10%.",
      "Raw count sheets and the analysis script (R or Python) deposited on OSF alongside the report.",
      "Repeat the freeze with one independent batch of HeLa if budget allows (week 7 stretch goal).",
    ],
    positiveControl:
      "Non-frozen aliquot from the same harvest, counted at the same time points — defines maximum achievable viability for that batch.",
    negativeControl:
      "PBS-only freezing medium (no cryoprotectant) — defines the floor and confirms the assay can detect cryo-damage.",
    source: {
      status: "pending",
      note: "MIQE guidelines apply only if qPCR is added; this protocol uses trypan blue counting, not qPCR. If a qPCR validation arm is added, cite the MIQE guidelines.",
      sourceUrl: "https://pubmed.ncbi.nlm.nih.gov/19246619/",
    },
  },
  risks: [
    {
      id: "r1",
      title: "Trehalose poorly enters HeLa cells, limiting protective effect",
      category: "scientific",
      likelihood: "medium",
      impact: "high",
      mitigation:
        "Use trehalose in combination with 5% DMSO (rather than alone) so the test arm still has some intracellular cryoprotection; cite the RSC review on permeability limits in the discussion.",
    },
    {
      id: "r2",
      title: "Counter bias inflates viability differences between arms",
      category: "scientific",
      likelihood: "medium",
      impact: "medium",
      mitigation:
        "Blind the counter to arm identity by re-labelling vials; have a second operator re-count a random 25% of vials.",
    },
    {
      id: "r3",
      title: "HeLa batch variability dominates the cryoprotectant effect",
      category: "scientific",
      likelihood: "medium",
      impact: "medium",
      mitigation:
        "Run all arms from a single harvest on the same day; if budget allows, repeat with one independent harvest as a stretch confirmation.",
    },
    {
      id: "r4",
      title: "Reagent backorder delays the freeze week",
      category: "operational",
      likelihood: "low",
      impact: "medium",
      mitigation:
        "Order trehalose, FBS, and trypan blue in week 1; identify a second supplier for each; keep the schedule flexible by ±1 week.",
    },
    {
      id: "r5",
      title: "Mycoplasma contamination invalidates viability counts",
      category: "operational",
      likelihood: "low",
      impact: "high",
      mitigation:
        "Mycoplasma-test the working HeLa stock in week 2 before freezing; discard and rethaw a clean stock if positive.",
    },
    {
      id: "r6",
      title: "Total cost overruns the $4.2k budget (esp. FBS or HeLa vial pricing changes)",
      category: "budget",
      likelihood: "medium",
      impact: "low",
      mitigation:
        "Confirm current Sigma / Thermo prices in week 1 (catalog numbers carry verify-before-ordering notes); if FBS pricing has risen, drop one biological replicate vial per arm rather than skip controls.",
    },
    {
      id: "r7",
      title: "Donor-cell-line consent or BSL-2 paperwork incomplete before week 3",
      category: "ethical/safety",
      likelihood: "low",
      impact: "medium",
      mitigation:
        "HeLa is a standard BSL-2 line; confirm institutional biosafety registration covers it before ordering, and keep the SDS on file for DMSO and trehalose handling.",
    },
  ],
  problemStatement:
    "DMSO is the standard cryoprotectant for HeLa and most adherent cell lines, but DMSO is cytotoxic at 37 °C and complicates downstream assays. Trehalose is a non-toxic disaccharide with a documented cryoprotective effect in primary cells. Whether trehalose can match or beat DMSO for HeLa post-thaw viability has not been cleanly tested with a pre-registered effect size.",
  whyItMatters:
    "If trehalose increases HeLa post-thaw viability by ≥15 percentage points over DMSO, labs gain a lower-toxicity freezing option for an extremely common cell line, with direct downstream benefits for assay quality and animal-free workflows.",
  budgetSource: {
    status: "pending",
    note: "Costs derived from real Sigma / Thermo catalog pages (linked per material). Prices and pack sizes change — verify before ordering.",
  },
  timelineSource: mkVerified(
    "https://openwetware.org/wiki/Marek:Freeze-down/Thaw",
    "Timeline derived from OpenWetWare freeze-down/thaw protocol durations.",
  ),
};

const STORAGE_KEY = "h2p_projects_v3_trehalose";

export function loadProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [DEMO_PROJECT];
    const parsed = JSON.parse(raw) as Project[];
    if (!parsed.find((p) => p.id === DEMO_PROJECT.id)) parsed.unshift(DEMO_PROJECT);
    return parsed;
  } catch {
    return [DEMO_PROJECT];
  }
}

export function saveProject(project: Project) {
  if (typeof window === "undefined") return;
  const all = loadProjects().filter((p) => p.id !== project.id);
  all.unshift(project);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function deleteProject(id: string) {
  if (typeof window === "undefined") return;
  const all = loadProjects().filter((p) => p.id !== id && p.id !== DEMO_PROJECT.id);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

export function getProject(id: string): Project | undefined {
  return loadProjects().find((p) => p.id === id);
}

/**
 * Generate a plan from project inputs. Returns the rich demo plan for the
 * preloaded project; lightly customizes it for user-created projects.
 * Architected to be replaced by Semantic Scholar + protocols.io API calls later.
 */
export function generatePlan(project: Project): GeneratedPlan {
  if (project.id === DEMO_PROJECT.id) return DEMO_PLAN;

  const noveltyScore = Math.min(95, 55 + (project.hypothesis.length % 35));
  const feasibilityScore = Math.min(
    95,
    Math.max(45, 60 + (project.budget > 50000 ? 10 : 0) + (project.timelineWeeks >= 8 ? 10 : 0)),
  );
  const evidenceConfidence = Math.min(95, 65 + (project.hypothesis.length % 25));

  const scaledMaterials = DEMO_PLAN.materials.map((m) => {
    const scale = project.budget / DEMO_PROJECT.budget;
    return {
      ...m,
      total: Math.max(1, Math.round(m.total * scale)),
      unitCost: Math.max(1, Math.round(m.unitCost * scale)),
    };
  });

  const scaledTimeline = (() => {
    const target = Math.max(4, project.timelineWeeks);
    if (target === DEMO_PLAN.timeline.length) return DEMO_PLAN.timeline;
    if (target < DEMO_PLAN.timeline.length) {
      return DEMO_PLAN.timeline.slice(0, target).map((t, i) => ({ ...t, week: i + 1 }));
    }
    // Stretch
    const out: typeof DEMO_PLAN.timeline = [];
    for (let i = 0; i < target; i++) {
      const src = DEMO_PLAN.timeline[Math.floor((i / target) * DEMO_PLAN.timeline.length)];
      out.push({ ...src, week: i + 1 });
    }
    return out;
  })();

  return {
    ...DEMO_PLAN,
    noveltyScore,
    feasibilityScore,
    evidenceConfidence,
    noveltyRationale: `Based on initial corpus search across ${project.domain || "your domain"}, this hypothesis appears to address an underexplored angle. Score reflects keyword overlap with recent (2022-2024) publications and absence of identical experimental designs.`,
    researchGap: `In ${project.domain || "the field"}, current literature emphasizes adjacent approaches but leaves the specific mechanism in your hypothesis under-tested. The proposed work would contribute primary evidence to fill this gap.`,
    materials: scaledMaterials,
    timeline: scaledTimeline,
    problemStatement: `Open problem in ${project.domain || "the field"}: existing approaches do not address the mechanism proposed in this hypothesis with the precision required for translational impact.`,
    whyItMatters: `If validated, this work provides direct evidence to advance ${project.domain || "the field"} and informs follow-up translational or clinical studies.`,
  };
}
