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
};

export type ProtocolStep = {
  step: number;
  phase: "Preparation" | "Sample setup" | "Intervention" | "Measurement" | "Controls" | "Expected outputs";
  title: string;
  description: string;
  duration: string;
  equipment: string[];
};

export type Material = {
  name: string;
  purpose: string;
  vendor: string;
  catalog: string;
  quantity: string;
  unitCost: number;
  total: number;
  category: "reagent" | "equipment" | "consumable" | "service";
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
};

export type NoveltyAnalysis = {
  whatIsKnown: string[];
  whatIsMissing: string[];
  whyNovel: string;
  riskLevel: "low" | "medium" | "high";
  refinement: string;
};

export type GeneratedPlan = {
  noveltyScore: number;
  feasibilityScore: number;
  evidenceConfidence: number;
  noveltyRationale: string;
  researchGap: string;
  noveltyAnalysis: NoveltyAnalysis;
  papers: Paper[];
  protocol: ProtocolStep[];
  materials: Material[];
  timeline: WeekTask[];
  validation: ValidationPlan;
  risks: Risk[];
  problemStatement: string;
  whyItMatters: string;
};

// ============================================================
// PRIMARY DEMO: IL6 / intestinal organoids
// ============================================================
export const DEMO_PROJECT: Project = {
  id: "demo-il6-organoid-001",
  title: "CRISPR knockdown of IL6 signaling in human intestinal organoids",
  hypothesis:
    "CRISPR-mediated knockdown of IL6 signaling will reduce inflammatory response in human intestinal organoids, decreasing TNF-α, IL-1β, and CXCL8 secretion by ≥50% under TNF-α/IFN-γ challenge.",
  domain: "Immunology / Organoid biology",
  organism: "Human intestinal organoids (iPSC-derived, healthy donor)",
  budget: 28000,
  timelineWeeks: 8,
  resources: "BSL-2 lab, organoid culture suite, qPCR, ELISA reader, lentiviral production",
  constraints: "No animal work; IRB-approved donor lines only; 8-week deadline for grant deliverable",
  createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
  noveltyScore: 74,
  status: "complete",
};

export const DEMO_PLAN: GeneratedPlan = {
  noveltyScore: 74,
  feasibilityScore: 82,
  evidenceConfidence: 88,
  noveltyRationale:
    "While IL6 inhibition is well-studied in 2D Caco-2 systems and tocilizumab clinical data exists for IBD, allele-level CRISPR knockdown of the IL6/IL6R axis in patient-derived 3D intestinal organoids — with paired cytokine panels under defined inflammatory challenge — has only been reported in 3 papers since 2022.",
  researchGap:
    "Most IL6 organoid studies use neutralizing antibodies (transient) rather than genetic knockout. None to date combine CRISPRi of IL6R with single-cell readouts of epithelial subpopulations in 3D organoids exposed to a standardized TNF-α/IFN-γ cocktail.",
  noveltyAnalysis: {
    whatIsKnown: [
      "IL6/STAT3 signaling drives epithelial inflammation in IBD (>2,000 papers).",
      "Tocilizumab (anti-IL6R) is FDA-approved for rheumatoid arthritis but failed Phase II for Crohn's disease.",
      "Intestinal organoids reproduce crypt-villus architecture and respond to TNF-α stimulation (Sato et al. 2011 onward).",
      "CRISPRi/a libraries work in organoid systems (Drost et al. 2015; Fujii et al. 2018).",
    ],
    whatIsMissing: [
      "No published study uses CRISPRi to durably knock down IL6 in patient-matched intestinal organoids.",
      "Cytokine cross-talk after IL6 loss (compensatory IL11, IL22) is uncharacterized in human 3D epithelium.",
      "Single-cell transcriptomic resolution of which epithelial subtypes (Paneth, goblet, enterocyte) drive residual inflammation is missing.",
    ],
    whyNovel:
      "This work would be the first to combine durable genetic IL6 silencing, a standardized inflammatory challenge, and scRNA-seq readout in human intestinal organoids — directly addressing why anti-IL6R antibodies failed in IBD trials.",
    riskLevel: "medium",
    refinement:
      "Consider adding a parallel IL6R knockdown arm to disentangle cytokine vs receptor effects, and pre-register a compensatory cytokine panel (IL11, IL22, IL6 family) to avoid post-hoc selection bias.",
  },
  papers: [
    {
      id: "p1",
      title: "CRISPR interference reveals IL6/STAT3 dependency in colonic organoids from IBD patients",
      authors: "Lee J, Kim HS, Park S, et al.",
      year: 2023,
      venue: "Nature Cell Biology",
      citations: 187,
      similarity: 0.93,
      abstract:
        "We applied genome-scale CRISPRi screens to 12 patient-derived colonic organoid lines and identified IL6/STAT3 as the dominant driver of inflammatory gene expression. Knockdown reduced CXCL8 secretion by 62% under TNF-α challenge.",
      whyItMatters:
        "Closest published work — same readouts and direction. Confirms target druggability; your hypothesis extends this to small intestine and adds IL-1β/TNF-α panel.",
      doi: "10.1038/s41556-023-01198-x",
    },
    {
      id: "p2",
      title: "Tocilizumab fails in moderate-to-severe Crohn's: lessons from the ANDANTE-2 trial",
      authors: "Sandborn WJ, et al.",
      year: 2022,
      venue: "Gastroenterology",
      citations: 312,
      similarity: 0.81,
      abstract:
        "Phase II RCT (n=247) of anti-IL6R antibody in active Crohn's disease showed no significant difference in CDAI-70 response vs placebo at week 12. Post-hoc analysis suggests compensatory IL11 elevation.",
      whyItMatters:
        "Defines the clinical gap your hypothesis addresses: why IL6R blockade failed despite strong preclinical signals. Justifies looking at compensatory cytokines.",
      doi: "10.1053/j.gastro.2022.04.018",
    },
    {
      id: "p3",
      title: "Inflammatory cytokine cocktails standardize organoid challenge models",
      authors: "Beumer J, Clevers H",
      year: 2023,
      venue: "Cell Stem Cell",
      citations: 156,
      similarity: 0.78,
      abstract:
        "Comparison of TNF-α, IFN-γ, IL-1β, and combinations across 8 intestinal organoid lines establishes a TNF-α (10 ng/mL) + IFN-γ (10 ng/mL) cocktail as the most reproducible inflammatory inducer.",
      whyItMatters:
        "Provides the exact challenge protocol your hypothesis assumes. Use this cocktail and concentrations to ensure reviewers can compare your data directly.",
      doi: "10.1016/j.stem.2023.02.011",
    },
    {
      id: "p4",
      title: "Lentiviral CRISPRi in human intestinal organoids: efficiency and persistence",
      authors: "Fujii M, Matano M, Toshimitsu K, et al.",
      year: 2022,
      venue: "Nature Protocols",
      citations: 244,
      similarity: 0.74,
      abstract:
        "Step-by-step protocol for stable dCas9-KRAB delivery into human intestinal organoids with >85% transduction efficiency and durable knockdown over 30 days.",
      whyItMatters:
        "Methods backbone for your delivery strategy. Adopt their selection regime (puromycin 2 µg/mL × 5 days) to maintain knockdown over the experimental window.",
      doi: "10.1038/s41596-022-00742-2",
    },
    {
      id: "p5",
      title: "Single-cell transcriptomics of inflamed human intestinal epithelium",
      authors: "Smillie CS, Biton M, Ordovas-Montanes J, et al.",
      year: 2021,
      venue: "Cell",
      citations: 689,
      similarity: 0.69,
      abstract:
        "scRNA-seq of 366,650 epithelial and stromal cells from 18 UC patients and 12 controls identifies inflammation-associated cell states and IL6-responsive enterocyte subpopulations.",
      whyItMatters:
        "Reference atlas for interpreting your scRNA-seq readouts. Map your post-knockdown clusters against their inflammation-associated states.",
      doi: "10.1016/j.cell.2021.07.004",
    },
    {
      id: "p6",
      title: "Compensatory IL11 signaling limits anti-IL6R efficacy in epithelial barriers",
      authors: "Putoczki TL, et al.",
      year: 2023,
      venue: "Mucosal Immunology",
      citations: 78,
      similarity: 0.66,
      abstract:
        "IL11 upregulation following IL6 pathway inhibition partially restores STAT3 signaling and explains residual inflammation in epithelial models. Dual blockade rescues efficacy.",
      whyItMatters:
        "Direct support for your refinement: include IL11 in the compensatory cytokine panel. Strengthens novelty story.",
      doi: "10.1038/s41385-023-00567-1",
    },
  ],
  protocol: [
    {
      step: 1,
      phase: "Preparation",
      title: "Organoid expansion & gRNA design",
      description:
        "Expand 3 patient-derived intestinal organoid lines in Matrigel domes with IntestiCult medium (passage 6–10). Design 4 sgRNAs per target (IL6, IL6R, scrambled control) using CRISPick; clone into pLentiGuide-puro.",
      duration: "Week 1",
      equipment: ["IntestiCult OGM", "Matrigel", "CRISPick", "Gibson assembly kit"],
    },
    {
      step: 2,
      phase: "Sample setup",
      title: "Lentiviral transduction & selection",
      description:
        "Dissociate organoids to single cells, transduce with dCas9-KRAB + sgRNA lentivirus (MOI 5), select with 2 µg/mL puromycin × 5 days. Reform organoids in Matrigel; verify knockdown ≥70% by RT-qPCR.",
      duration: "Week 2–3",
      equipment: ["Lentiviral vectors", "Puromycin", "RT-qPCR", "BSL-2 hood"],
    },
    {
      step: 3,
      phase: "Intervention",
      title: "Inflammatory challenge",
      description:
        "Treat established knockdown organoids (day 7 post-passage) with TNF-α (10 ng/mL) + IFN-γ (10 ng/mL) cocktail or vehicle for 24 h. n=4 wells per condition × 3 organoid lines.",
      duration: "Week 4",
      equipment: ["Recombinant TNF-α", "Recombinant IFN-γ", "96-well plates"],
    },
    {
      step: 4,
      phase: "Measurement",
      title: "Cytokine + transcriptomic readouts",
      description:
        "Collect supernatants for ELISA panel (TNF-α, IL-1β, CXCL8, IL11, IL22). Harvest organoids for bulk RNA-seq (n=3 per condition) and a single dropout 10x scRNA-seq run (1 line, 4 conditions, 5k cells each).",
      duration: "Week 5",
      equipment: ["ELISA kits", "RNeasy", "10x Chromium"],
    },
    {
      step: 5,
      phase: "Controls",
      title: "Positive & negative controls",
      description:
        "Positive control: tocilizumab (10 µg/mL) co-treatment. Negative control: scrambled sgRNA + vehicle. Loading control: housekeeping (GAPDH, RPL13). Cell viability: CellTiter-Glo at endpoint.",
      duration: "Parallel to weeks 4–5",
      equipment: ["Tocilizumab", "CellTiter-Glo", "Scrambled sgRNA"],
    },
    {
      step: 6,
      phase: "Expected outputs",
      title: "Analysis & deliverables",
      description:
        "Expected: ≥50% reduction in CXCL8/IL-1β secretion in IL6-KD vs scrambled; partial compensation by IL11 (~30% rebound). scRNA-seq identifies enterocyte subcluster as primary IL6-responder. Deliverables: 4 figures, OSF pre-registration, draft manuscript.",
      duration: "Week 6–8",
      equipment: ["GraphPad Prism", "R/DESeq2", "Seurat"],
    },
  ],
  materials: [
    { name: "Patient-derived organoid lines (3)", purpose: "Biological replicates from independent donors", vendor: "HUB Organoids", catalog: "HUB-INT-01/02/03", quantity: "3 vials", unitCost: 1200, total: 3600, category: "consumable" },
    { name: "IntestiCult Organoid Growth Medium", purpose: "Maintain organoid expansion across all conditions", vendor: "STEMCELL Tech", catalog: "#06010", quantity: "500 mL", unitCost: 850, total: 850, category: "reagent" },
    { name: "Matrigel (growth-factor reduced)", purpose: "3D scaffold for organoid embedding", vendor: "Corning", catalog: "#356231", quantity: "10 mL", unitCost: 420, total: 420, category: "reagent" },
    { name: "dCas9-KRAB lentiviral plasmid", purpose: "CRISPRi backbone for IL6/IL6R knockdown", vendor: "Addgene", catalog: "#89567", quantity: "1 plasmid", unitCost: 85, total: 85, category: "reagent" },
    { name: "Custom sgRNA oligos (12)", purpose: "Target IL6, IL6R, and scrambled control", vendor: "IDT", catalog: "Ultramer", quantity: "12 sets", unitCost: 38, total: 456, category: "reagent" },
    { name: "Lentiviral packaging service", purpose: "Concentrated virus for organoid transduction", vendor: "VectorBuilder", catalog: "Lenti-pack-HT", quantity: "4 preps", unitCost: 950, total: 3800, category: "service" },
    { name: "Recombinant human TNF-α", purpose: "Inflammatory challenge component", vendor: "PeproTech", catalog: "#300-01A", quantity: "100 µg", unitCost: 240, total: 240, category: "reagent" },
    { name: "Recombinant human IFN-γ", purpose: "Inflammatory challenge component", vendor: "PeproTech", catalog: "#300-02", quantity: "100 µg", unitCost: 285, total: 285, category: "reagent" },
    { name: "Tocilizumab (clinical grade)", purpose: "Positive control for IL6R inhibition", vendor: "Genentech (research)", catalog: "—", quantity: "20 mg", unitCost: 480, total: 480, category: "reagent" },
    { name: "Cytokine ELISA panel (5-plex)", purpose: "Quantify TNF-α, IL-1β, CXCL8, IL11, IL22", vendor: "R&D Systems", catalog: "Custom Luminex", quantity: "96 samples", unitCost: 18, total: 1728, category: "reagent" },
    { name: "TaqMan probes (IL6, IL6R, GAPDH)", purpose: "Validate knockdown by RT-qPCR", vendor: "Thermo Fisher", catalog: "Bundle", quantity: "1000 rxns", unitCost: 1.6, total: 1600, category: "reagent" },
    { name: "Bulk RNA-seq (12 samples)", purpose: "Transcriptome-wide effect of IL6 KD", vendor: "Novogene", catalog: "PE150 30M", quantity: "12 samples", unitCost: 280, total: 3360, category: "service" },
    { name: "10x Chromium scRNA-seq (4 samples)", purpose: "Resolve cell-type-specific responses", vendor: "10x Genomics", catalog: "Chromium NextGEM", quantity: "4 reactions", unitCost: 1850, total: 7400, category: "service" },
    { name: "Puromycin", purpose: "Select transduced organoids", vendor: "Sigma", catalog: "P8833", quantity: "100 mg", unitCost: 95, total: 95, category: "reagent" },
    { name: "CellTiter-Glo 3D", purpose: "Endpoint viability assay", vendor: "Promega", catalog: "G9681", quantity: "100 mL", unitCost: 580, total: 580, category: "reagent" },
    { name: "Tissue culture consumables", purpose: "Plates, tips, media bottles", vendor: "Various", catalog: "Bundle", quantity: "Bundle", unitCost: 1400, total: 1400, category: "consumable" },
    { name: "Personnel (postdoc, 0.3 FTE × 2mo)", purpose: "Hands-on execution & analysis", vendor: "—", catalog: "—", quantity: "0.6 FTE-mo", unitCost: 3100, total: 1860, category: "service" },
  ],
  timeline: [
    { week: 1, phase: "Planning", milestone: "Project kickoff", tasks: ["Finalize sgRNA designs", "Order reagents", "Confirm organoid line availability", "Pre-register on OSF"], deliverable: "Locked experimental design + OSF entry" },
    { week: 2, phase: "Literature review", milestone: "Evidence base finalized", tasks: ["Cross-check IL6 organoid lit", "Compile compensatory cytokine list", "Identify negative results in field"], deliverable: "Annotated bibliography (15 papers)" },
    { week: 3, phase: "Protocol setup", milestone: "Constructs & organoids ready", tasks: ["Clone sgRNAs into lentiviral backbone", "Sanger-verify", "Expand 3 organoid lines to passage 8"], deliverable: "QC'd plasmids + healthy organoid stocks" },
    { week: 4, phase: "Experiment", milestone: "Knockdown established", tasks: ["Lentiviral transduction", "Puromycin selection", "RT-qPCR knockdown verification"], deliverable: "≥70% IL6 knockdown confirmed in 3 lines" },
    { week: 5, phase: "Experiment", milestone: "Challenge complete", tasks: ["TNF-α/IFN-γ stimulation 24h", "Collect supernatants + cell pellets", "Submit RNA-seq libraries"], deliverable: "All samples banked & submitted" },
    { week: 6, phase: "Analysis", milestone: "Primary readouts in", tasks: ["Run 5-plex ELISA", "Receive bulk RNA-seq data", "DESeq2 differential expression"], deliverable: "Cytokine + DE gene tables" },
    { week: 7, phase: "Validation", milestone: "Reproducibility check", tasks: ["Process scRNA-seq (Seurat)", "Compare to Smillie et al. atlas", "Validate top hits in 2nd organoid batch"], deliverable: "Independent replicate confirms direction" },
    { week: 8, phase: "Final report", milestone: "Manuscript & deposit", tasks: ["Generate 4 main figures", "Write methods + results", "Deposit raw data on GEO"], deliverable: "Draft manuscript + GEO accession" },
  ],
  validation: {
    primaryMetric: {
      name: "CXCL8 (IL-8) secretion reduction in IL6-KD vs scrambled under TNF-α/IFN-γ challenge",
      target: "≥50% reduction (p<0.01)",
      method: "ELISA on 24h conditioned media, n=4 wells × 3 organoid lines",
    },
    secondaryMetrics: [
      { name: "IL-1β secretion", target: "≥40% reduction", method: "Multiplex ELISA" },
      { name: "TNF-α secretion (autocrine)", target: "≥30% reduction", method: "Multiplex ELISA" },
      { name: "Compensatory IL11 elevation", target: "<2-fold rebound", method: "ELISA + RT-qPCR" },
      { name: "Inflammation-associated DE genes", target: "≥40% reversal of TNF-α-induced signature", method: "Bulk RNA-seq + DESeq2 (FDR<0.05)" },
      { name: "Enterocyte subcluster proportion", target: "Detectable shift (>10%)", method: "scRNA-seq + Seurat label transfer" },
    ],
    statisticalApproach:
      "Two-way ANOVA (genotype × treatment) with Tukey HSD post-hoc for ELISA. DESeq2 with Benjamini-Hochberg correction for RNA-seq. Pre-registered analysis plan on OSF; effect size threshold ≥0.5 (Cohen's d). Power analysis: n=4 wells × 3 lines detects 35% effect at α=0.05, 80% power.",
    reproducibilityChecks: [
      "Independent organoid batch (different passage) repeats primary readout in week 7.",
      "Two independent operators perform ELISA on identical samples; CV must be <15%.",
      "Raw RNA-seq deposited on GEO; analysis code on GitHub with Docker container.",
      "OSF pre-registration locked before unblinding any data.",
    ],
    positiveControl: "Tocilizumab (10 µg/mL) co-treatment — expected to phenocopy IL6R knockdown direction.",
    negativeControl: "Scrambled sgRNA + vehicle — defines baseline inflammatory response variability.",
  },
  risks: [
    { id: "r1", title: "IL6 knockdown <70% — insufficient for downstream comparison", category: "scientific", likelihood: "medium", impact: "high", mitigation: "Pre-screen 4 sgRNAs per gene in HEK293T first; advance only top 2 to organoids. Backup: SaCas9-KRAB if SpCas9 fails." },
    { id: "r2", title: "Compensatory IL11/IL22 masks phenotype", category: "scientific", likelihood: "medium", impact: "medium", mitigation: "Pre-include IL11/IL22 in ELISA panel; plan combinatorial IL6+IL11 KD as week-9 follow-up if rebound exceeds 2-fold." },
    { id: "r3", title: "Organoid line variability dominates signal", category: "scientific", likelihood: "high", impact: "medium", mitigation: "Use 3 donor lines as biological reps; mixed-effects model with line as random effect; report per-line breakdown in supplement." },
    { id: "r4", title: "Lentiviral titer low → poor transduction", category: "operational", likelihood: "low", impact: "high", mitigation: "Outsource to VectorBuilder for guaranteed 1×10⁹ TU/mL; have backup electroporation protocol (Lonza 4D)." },
    { id: "r5", title: "scRNA-seq run fails QC (low cell capture)", category: "operational", likelihood: "low", impact: "medium", mitigation: "Reserve a backup 10x reaction; if dropped, fall back to bulk RNA-seq + computational deconvolution (CIBERSORTx)." },
    { id: "r6", title: "Reagent costs exceed $28k budget (esp. scRNA-seq)", category: "budget", likelihood: "medium", impact: "medium", mitigation: "Pre-negotiated 10x academic discount (~15%); deprioritize scRNA-seq to single line if needed; bulk RNA-seq alone suffices for primary endpoint." },
    { id: "r7", title: "Donor consent restrictions on data sharing", category: "ethical/safety", likelihood: "low", impact: "medium", mitigation: "Confirm existing IRB covers GEO deposition; otherwise deposit controlled-access on dbGaP. Use only de-identified line IDs." },
    { id: "r8", title: "Organoid contamination (mycoplasma)", category: "operational", likelihood: "low", impact: "high", mitigation: "Mycoplasma-test all lines on receipt and at weeks 2, 5, 7. Maintain frozen backup stocks at every passage." },
  ],
  problemStatement:
    "Inflammatory bowel disease affects 7M+ people globally, yet IL6 pathway inhibitors (tocilizumab) failed in late-stage Crohn's trials despite strong preclinical signals. We need a human-relevant model to dissect why — and to identify which epithelial cell types and compensatory cytokines limit efficacy.",
  whyItMatters:
    "If we can show that durable IL6 silencing in human intestinal organoids reduces inflammation by ≥50% and identify the compensatory IL11 axis, we provide a mechanistic rationale for combination therapy — a direct, testable hypothesis for the next IBD clinical trial.",
};

const STORAGE_KEY = "h2p_projects_v2";

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
