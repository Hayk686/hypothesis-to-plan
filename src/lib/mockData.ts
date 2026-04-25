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
  doi: string;
};

export type ProtocolStep = {
  step: number;
  phase: string;
  title: string;
  description: string;
  duration: string;
  equipment: string[];
};

export type Material = {
  name: string;
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
  category: "technical" | "biological" | "logistical" | "ethical";
  likelihood: "low" | "medium" | "high";
  impact: "low" | "medium" | "high";
  mitigation: string;
};

export type ValidationCheck = {
  category: string;
  metric: string;
  target: string;
  method: string;
  passCriteria: string;
};

export type GeneratedPlan = {
  noveltyScore: number;
  noveltyRationale: string;
  researchGap: string;
  papers: Paper[];
  protocol: ProtocolStep[];
  materials: Material[];
  timeline: WeekTask[];
  validation: ValidationCheck[];
  risks: Risk[];
};

export const DEMO_PROJECT: Project = {
  id: "demo-crispr-001",
  title: "CRISPR-Cas13 RNA editing for Huntington's disease",
  hypothesis:
    "CRISPR-Cas13d targeting mutant HTT mRNA in striatal neurons will reduce mutant huntingtin protein by ≥70% without affecting wild-type allele expression in HD mouse model.",
  domain: "Neuroscience / Gene Therapy",
  organism: "R6/2 transgenic mouse (Mus musculus)",
  budget: 85000,
  timelineWeeks: 16,
  resources: "BSL-2 lab, confocal microscope, qPCR, AAV production facility, R6/2 mouse colony",
  constraints: "IACUC approval pending; no clinical samples; AAV9 only",
  createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  noveltyScore: 78,
  status: "complete",
};

export const DEMO_PLAN: GeneratedPlan = {
  noveltyScore: 78,
  noveltyRationale:
    "Allele-selective Cas13d targeting in vivo for HD remains underexplored. While Cas9-based DNA editing dominates the literature, RNA-level intervention preserves genomic integrity and offers reversibility — a meaningful gap.",
  researchGap:
    "Existing HD gene therapy literature focuses on ASOs (tominersen) and Cas9 DNA editing. Only 4 papers since 2021 explore Cas13 for HTT, none with allele-selectivity using SNP-anchored guides delivered via AAV9 to striatum in vivo.",
  papers: [
    {
      id: "p1",
      title: "RNA-targeting CRISPR-Cas13d represses mutant HTT in patient-derived neurons",
      authors: "Morelli K, et al.",
      year: 2023,
      venue: "Nature Neuroscience",
      citations: 142,
      similarity: 0.91,
      abstract:
        "We demonstrate Cas13d-mediated knockdown of HTT mRNA in iPSC-derived striatal neurons, achieving 65% reduction with minimal off-target effects.",
      doi: "10.1038/s41593-023-01234-x",
    },
    {
      id: "p2",
      title: "AAV-delivered Cas13 variants for neurodegenerative disease",
      authors: "Zhang L, Hsu PD",
      year: 2022,
      venue: "Cell",
      citations: 287,
      similarity: 0.84,
      abstract:
        "Comprehensive evaluation of Cas13a/b/d variants packaged in AAV9 for CNS delivery, comparing knockdown efficiency and immunogenicity profiles.",
      doi: "10.1016/j.cell.2022.04.012",
    },
    {
      id: "p3",
      title: "Allele-selective silencing in Huntington's disease: a SNP-targeting approach",
      authors: "Carroll JB, et al.",
      year: 2021,
      venue: "Molecular Therapy",
      citations: 96,
      similarity: 0.79,
      abstract:
        "Heterozygous SNPs linked to the CAG expansion enable selective targeting of the mutant allele while preserving wild-type HTT expression.",
      doi: "10.1016/j.ymthe.2021.07.008",
    },
    {
      id: "p4",
      title: "R6/2 mouse model: striatal pathology and behavioral readouts",
      authors: "Mangiarini L, Bates GP",
      year: 2020,
      venue: "Journal of Neuroscience",
      citations: 412,
      similarity: 0.71,
      abstract:
        "Updated phenotyping protocols for the R6/2 transgenic mouse model of HD, including rotarod, open field, and stereological neuron counts.",
      doi: "10.1523/JNEUROSCI.2020.0142",
    },
    {
      id: "p5",
      title: "Off-target profiling of Cas13 in mammalian transcriptomes",
      authors: "Wessels HH, Sanjana NE",
      year: 2022,
      venue: "Nature Biotechnology",
      citations: 198,
      similarity: 0.68,
      abstract:
        "Genome-wide RNA-seq reveals collateral cleavage events and design rules to minimize bystander effects in therapeutic Cas13 applications.",
      doi: "10.1038/s41587-022-01345-7",
    },
  ],
  protocol: [
    {
      step: 1,
      phase: "Design",
      title: "Guide RNA design & in silico screening",
      description:
        "Design 12 candidate gRNAs spanning SNPs rs362307 and rs362331 on the mutant HTT allele. Screen for off-targets using CRISPRitz against GRCm38.",
      duration: "1 week",
      equipment: ["CHOPCHOP", "CRISPRitz", "RNAfold"],
    },
    {
      step: 2,
      phase: "Cloning",
      title: "AAV vector cloning",
      description:
        "Clone top 4 gRNAs into pAAV-EFS-Cas13d-WPRE backbone. Verify by Sanger sequencing. Prepare endotoxin-free maxipreps.",
      duration: "2 weeks",
      equipment: ["Gibson assembly kit", "Sanger sequencer", "EndoFree maxiprep"],
    },
    {
      step: 3,
      phase: "In vitro",
      title: "HEK293T validation",
      description:
        "Co-transfect mutant HTT-expressing HEK293T with each gRNA construct. Quantify knockdown by RT-qPCR and Western blot at 72h.",
      duration: "2 weeks",
      equipment: ["HEK293T cells", "Lipofectamine 3000", "qPCR", "Western blot rig"],
    },
    {
      step: 4,
      phase: "AAV production",
      title: "AAV9 packaging & titration",
      description:
        "Triple-transfect HEK293T with rep/cap, helper, and ITR plasmids. Purify by iodixanol gradient. Titer by ddPCR.",
      duration: "3 weeks",
      equipment: ["HEK293T flasks", "Ultracentrifuge", "ddPCR"],
    },
    {
      step: 5,
      phase: "In vivo",
      title: "Stereotaxic striatal injection",
      description:
        "Inject 2µL of 1×10¹³ vg/mL AAV9 bilaterally into striatum of P21 R6/2 mice (n=8/group: vehicle, scrambled, gRNA-1, gRNA-2).",
      duration: "1 week",
      equipment: ["Stereotaxic frame", "Hamilton syringe", "Anesthesia rig"],
    },
    {
      step: 6,
      phase: "Analysis",
      title: "Behavioral & molecular endpoints",
      description:
        "Rotarod (weeks 4, 8, 12 post-injection), then sacrifice. Striatal RNA-seq, mHTT immunostaining, stereological counts.",
      duration: "6 weeks",
      equipment: ["Rotarod", "Confocal microscope", "Illumina NovaSeq access"],
    },
    {
      step: 7,
      phase: "Statistics",
      title: "Data analysis & reporting",
      description:
        "Two-way ANOVA with Tukey post-hoc. Pre-register analysis plan on OSF. Power analysis: n=8 detects 30% effect at α=0.05, 80% power.",
      duration: "1 week",
      equipment: ["GraphPad Prism", "R/DESeq2"],
    },
  ],
  materials: [
    { name: "pAAV-EFS-Cas13d backbone", vendor: "Addgene", catalog: "#138147", quantity: "1 plasmid", unitCost: 85, total: 85, category: "reagent" },
    { name: "Custom gRNA oligos (12)", vendor: "IDT", catalog: "Ultramer", quantity: "12 sets", unitCost: 45, total: 540, category: "reagent" },
    { name: "AAV9 packaging service", vendor: "VectorBuilder", catalog: "AAV9-custom", quantity: "4 preps", unitCost: 4200, total: 16800, category: "service" },
    { name: "R6/2 mice (B6CBA-Tg)", vendor: "JAX Labs", catalog: "#006494", quantity: "40 mice", unitCost: 285, total: 11400, category: "consumable" },
    { name: "Mouse housing & care (16wk)", vendor: "Institutional vivarium", catalog: "—", quantity: "640 cage-days", unitCost: 4.5, total: 2880, category: "service" },
    { name: "Lipofectamine 3000", vendor: "Thermo Fisher", catalog: "L3000015", quantity: "1.5 mL", unitCost: 620, total: 620, category: "reagent" },
    { name: "TaqMan HTT probe + qPCR mix", vendor: "Thermo Fisher", catalog: "Hs00918176_m1", quantity: "1000 rxns", unitCost: 1.8, total: 1800, category: "reagent" },
    { name: "anti-mHTT antibody (MW1)", vendor: "DSHB", catalog: "MW1", quantity: "200 µg", unitCost: 75, total: 75, category: "reagent" },
    { name: "Hamilton 10µL syringes", vendor: "Hamilton", catalog: "#7635-01", quantity: "4 units", unitCost: 195, total: 780, category: "equipment" },
    { name: "RNA-seq library prep + sequencing", vendor: "Novogene", catalog: "Bulk RNA-seq", quantity: "32 samples", unitCost: 380, total: 12160, category: "service" },
    { name: "Histology consumables", vendor: "VWR", catalog: "Bundle", quantity: "Bundle", unitCost: 1850, total: 1850, category: "consumable" },
    { name: "Iodixanol (OptiPrep)", vendor: "Sigma", catalog: "D1556", quantity: "500 mL", unitCost: 480, total: 480, category: "reagent" },
    { name: "Misc. tissue culture & buffers", vendor: "Various", catalog: "—", quantity: "Bundle", unitCost: 3200, total: 3200, category: "consumable" },
    { name: "Personnel (postdoc, 0.25 FTE × 4mo)", vendor: "—", catalog: "—", quantity: "1 FTE-month", unitCost: 9500, total: 9500, category: "service" },
  ],
  timeline: [
    { week: 1, phase: "Design", milestone: "Guide RNAs designed", tasks: ["SNP analysis", "gRNA in silico screen", "Off-target prediction"], deliverable: "12 gRNA candidates ranked" },
    { week: 2, phase: "Cloning", milestone: "Constructs in hand", tasks: ["Gibson assembly", "Transformation"], deliverable: "Ligated plasmids" },
    { week: 3, phase: "Cloning", milestone: "Constructs validated", tasks: ["Sanger sequencing", "Maxipreps"], deliverable: "4 endo-free plasmids" },
    { week: 4, phase: "In vitro", milestone: "Transfections complete", tasks: ["HEK293T culture", "Co-transfection"], deliverable: "Cell pellets harvested" },
    { week: 5, phase: "In vitro", milestone: "Knockdown quantified", tasks: ["RT-qPCR", "Western blot"], deliverable: "Lead gRNA selected" },
    { week: 6, phase: "AAV", milestone: "AAV production started", tasks: ["Triple transfection", "Cell harvest"], deliverable: "Crude AAV lysate" },
    { week: 7, phase: "AAV", milestone: "AAV purified", tasks: ["Iodixanol gradient", "Buffer exchange"], deliverable: "Concentrated AAV" },
    { week: 8, phase: "AAV", milestone: "AAV titered", tasks: ["ddPCR titration", "Sterility check"], deliverable: "QC'd viral stock" },
    { week: 9, phase: "In vivo", milestone: "Mice injected", tasks: ["Cohort assignment", "Stereotaxic surgery"], deliverable: "32 injected mice" },
    { week: 10, phase: "In vivo", milestone: "Recovery + baseline", tasks: ["Post-op care", "Baseline rotarod"], deliverable: "Baseline data" },
    { week: 11, phase: "In vivo", milestone: "Week 4 behavior", tasks: ["Rotarod", "Open field"], deliverable: "Behavioral dataset 1" },
    { week: 12, phase: "In vivo", milestone: "Mid-study check", tasks: ["Health monitoring", "Interim analysis"], deliverable: "Interim report" },
    { week: 13, phase: "In vivo", milestone: "Week 8 behavior", tasks: ["Rotarod", "Grip strength"], deliverable: "Behavioral dataset 2" },
    { week: 14, phase: "Endpoint", milestone: "Sacrifice & tissue", tasks: ["Perfusion", "Brain dissection"], deliverable: "Frozen + fixed tissue" },
    { week: 15, phase: "Analysis", milestone: "Molecular readouts", tasks: ["RNA-seq", "Immunostaining"], deliverable: "Sequencing data + images" },
    { week: 16, phase: "Analysis", milestone: "Manuscript draft", tasks: ["Statistics", "Figure prep", "Writing"], deliverable: "Draft manuscript + OSF deposit" },
  ],
  validation: [
    { category: "Knockdown efficacy", metric: "mHTT mRNA reduction", target: "≥70%", method: "RT-qPCR with allele-specific probes", passCriteria: "p<0.01 vs scrambled, n=8" },
    { category: "Allele selectivity", metric: "WT HTT preservation", target: "≥85% of baseline", method: "RT-qPCR + Western", passCriteria: "Not significantly different from vehicle" },
    { category: "Off-target", metric: "Transcriptome-wide collateral", target: "<50 DE genes", method: "Bulk RNA-seq, DESeq2", passCriteria: "FDR<0.05, |log2FC|>1" },
    { category: "Behavioral", metric: "Rotarod latency", target: "+25% vs vehicle", method: "Accelerating rotarod, weeks 4/8/12", passCriteria: "Two-way ANOVA p<0.05" },
    { category: "Histology", metric: "Striatal neuron count", target: "Preserved vs vehicle", method: "Stereology (NeuN+)", passCriteria: "No significant loss" },
    { category: "Safety", metric: "Microglial activation", target: "No elevation", method: "Iba1 immunostaining", passCriteria: "Comparable to scrambled control" },
    { category: "Reproducibility", metric: "Inter-cohort consistency", target: "CV < 20%", method: "Two independent cohorts", passCriteria: "Effect replicated" },
  ],
  risks: [
    { id: "r1", title: "AAV9 fails to transduce sufficient striatal neurons", category: "technical", likelihood: "medium", impact: "high", mitigation: "Pilot transduction study with AAV9-GFP first; switch to AAV-PHP.eB if <40% coverage." },
    { id: "r2", title: "Cas13 collateral activity damages bystander RNAs", category: "biological", likelihood: "medium", impact: "high", mitigation: "Use high-fidelity Cas13d variant (dCas13d-RfxCas13d); validate with paired RNA-seq before scaling." },
    { id: "r3", title: "R6/2 mice show high mortality before week 12", category: "biological", likelihood: "high", impact: "medium", mitigation: "Order 25% extra mice; supplement with wet food; pre-register attrition handling in SAP." },
    { id: "r4", title: "IACUC approval delayed beyond week 4", category: "ethical", likelihood: "low", impact: "high", mitigation: "Submit protocol parallel to in vitro work; have backup zQ175 colony available via collaborator." },
    { id: "r5", title: "AAV titer below 1×10¹³ vg/mL", category: "technical", likelihood: "medium", impact: "medium", mitigation: "Outsource production to VectorBuilder if in-house yield insufficient." },
    { id: "r6", title: "Behavioral effect smaller than powered for", category: "biological", likelihood: "medium", impact: "medium", mitigation: "Add molecular endpoints as primary; pre-register secondary behavioral analyses." },
    { id: "r7", title: "Sequencing turnaround exceeds budget timeline", category: "logistical", likelihood: "low", impact: "low", mitigation: "Reserve Novogene rapid lane in week 13; in-house Nextera backup." },
  ],
};

const STORAGE_KEY = "h2p_projects";

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
 * Generate a plan from project inputs. Currently returns deterministic mock data
 * derived from the demo plan but lightly customized. Architected to be replaced
 * by Semantic Scholar + protocols.io API calls later.
 */
export function generatePlan(project: Project): GeneratedPlan {
  if (project.id === DEMO_PROJECT.id) return DEMO_PLAN;

  // Lightly customize so user-created projects don't look identical
  const noveltyScore = Math.min(95, 55 + (project.hypothesis.length % 35));
  return {
    ...DEMO_PLAN,
    noveltyScore,
    noveltyRationale: `Based on initial corpus search across ${project.domain || "your domain"}, this hypothesis appears to address an underexplored angle. Score reflects keyword overlap with recent (2022-2024) publications and absence of identical experimental designs.`,
    researchGap: `In ${project.domain || "the field"}, current literature emphasizes adjacent approaches but leaves the specific mechanism in your hypothesis under-tested. The proposed work would contribute primary evidence to fill this gap.`,
    materials: DEMO_PLAN.materials.map((m) => ({
      ...m,
      total: Math.round((m.total * project.budget) / 85000),
      unitCost: Math.round((m.unitCost * project.budget) / 85000),
    })),
    timeline: DEMO_PLAN.timeline
      .slice(0, project.timelineWeeks)
      .map((t) => ({ ...t, week: Math.min(t.week, project.timelineWeeks) })),
  };
}
