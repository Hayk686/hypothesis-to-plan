export type AgentDomainKind =
  | "life_science"
  | "materials_science"
  | "computational"
  | "climate_environment"
  | "engineering"
  | "general";

export type AgentProfileInput = {
  hypothesis?: unknown;
  domain?: unknown;
  organism_or_system?: unknown;
  constraints?: unknown;
  method_keywords?: unknown;
};

export type AgentTimelinePhase = {
  phase: string;
  milestone: string;
  tasks: string[];
  deliverable: string;
};

export type AgentValidationDefaults = {
  primaryMetricName: string;
  primaryMetricTarget: string;
  primaryMetricMethod: string;
  secondaryMetrics: { name: string; target: string; method: string }[];
  statisticalApproach: string;
  reproducibilityChecks: string[];
  positiveControl: string;
  negativeControl: string;
};

export type AgentRiskTemplate = {
  id: string;
  title: string;
  category: string;
  likelihood: string;
  impact: string;
  mitigation: string;
};

export type AgentProfile = {
  kind: AgentDomainKind;
  label: string;
  literatureQueries: string[];
  protocolQueries: string[];
  defaultMaterials: string[];
  timelinePhases: AgentTimelinePhase[];
  validation: AgentValidationDefaults;
  risks: AgentRiskTemplate[];
  supplierUrlPattern: RegExp;
  reviewQuestions: string[];
};

const TRUSTED_SUPPLIER_URL =
  /sigmaaldrich\.com|thermofisher\.com|fishersci\.com|gibco|milliporesigma|neb\.com|bio-rad|abcam|qiagen|agilent|keysight|mcmaster\.com|digikey\.com|mouser\.com|matweb\.com|nist\.gov|aws\.amazon\.com|cloud\.google\.com|azure\.microsoft\.com|github\.com|zenodo\.org|kaggle\.com/i;

function safeText(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function methodText(v: unknown): string {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string").join(" ");
  return safeText(v);
}

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items.map((x) => x.trim()).filter(Boolean)) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function classifyAgentDomain(input: AgentProfileInput): AgentDomainKind {
  const text = [
    safeText(input.hypothesis),
    safeText(input.domain),
    safeText(input.organism_or_system),
    safeText(input.constraints),
    methodText(input.method_keywords),
  ]
    .join(" ")
    .toLowerCase();

  if (
    /cell|hela|culture|assay|protein|dna|rna|gene|bacteria|yeast|mouse|mice|organoid|enzyme|antibody|virus|bio|neuro|plant|clinical|patient|tissue|cryo|dmso|trehalose/.test(
      text,
    )
  ) {
    return "life_science";
  }
  if (
    /material|polymer|alloy|composite|nanoparticle|graphene|perovskite|catalyst|battery|electrode|film|coating|membrane|semiconductor|synthesis|xrd|sem|tem|spectroscopy/.test(
      text,
    )
  ) {
    return "materials_science";
  }
  if (
    /algorithm|model|dataset|software|simulation|machine learning|deep learning|neural|llm|benchmark|code|python|gpu|compute|classification|prediction|optimization|database|api/.test(
      text,
    )
  ) {
    return "computational";
  }
  if (
    /climate|soil|water|air|pollution|carbon|emission|ecosystem|environment|weather|hydrology|geospatial|satellite|remote sensing|agriculture|crop/.test(
      text,
    )
  ) {
    return "climate_environment";
  }
  if (
    /robot|sensor|device|circuit|mechanical|fluid|thermal|prototype|manufacturing|control system|actuator|embedded|iot|hardware|engineering/.test(
      text,
    )
  ) {
    return "engineering";
  }
  return "general";
}

function baseQueries(input: AgentProfileInput): string[] {
  const pieces = [
    safeText(input.hypothesis),
    safeText(input.domain),
    safeText(input.organism_or_system),
    methodText(input.method_keywords),
  ]
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return pieces ? [pieces.slice(0, 220)] : [];
}

export function buildAgentProfile(input: AgentProfileInput): AgentProfile {
  const kind = classifyAgentDomain(input);
  const seed = baseQueries(input);

  const sharedReview = [
    "Does the selected primary metric directly test the hypothesis?",
    "Which assumption would invalidate the result if it is wrong?",
    "What minimum evidence threshold should stop or continue the project?",
  ];

  if (kind === "life_science") {
    return {
      kind,
      label: "Life science experimental agent",
      literatureQueries: unique([
        ...seed,
        "controlled experimental design biological assay reproducibility",
        "cell culture assay validation controls reproducibility",
        "biological experiment statistical power controls",
      ]),
      protocolQueries: unique([
        ...seed,
        "biological assay protocol controls",
        "cell culture protocol",
        "cell viability assay",
      ]),
      defaultMaterials: ["Assay reagents", "Control samples", "Sample containers"],
      timelinePhases: [
        {
          phase: "Planning",
          milestone: "Hypothesis and endpoint locked",
          tasks: ["Pre-register endpoint", "Confirm controls", "Review biosafety requirements"],
          deliverable: "Registered experimental design",
        },
        {
          phase: "Preparation",
          milestone: "System ready",
          tasks: ["Prepare biological system", "Confirm quality checks", "Blind sample labels"],
          deliverable: "Ready-to-test samples",
        },
        {
          phase: "Intervention",
          milestone: "Intervention complete",
          tasks: ["Apply treatment arms", "Track deviations", "Capture intermediate readouts"],
          deliverable: "Completed intervention log",
        },
        {
          phase: "Measurement",
          milestone: "Primary readout collected",
          tasks: ["Collect primary endpoint", "Collect secondary endpoints", "Archive raw files"],
          deliverable: "Raw assay dataset",
        },
        {
          phase: "Analysis",
          milestone: "Report drafted",
          tasks: ["Run pre-registered analysis", "Check reproducibility", "Write results"],
          deliverable: "Locked analysis report",
        },
      ],
      validation: {
        primaryMetricName: "Pre-registered biological endpoint",
        primaryMetricTarget: "Defined effect size versus control",
        primaryMetricMethod: "Validated assay matched to the hypothesis",
        secondaryMetrics: [
          {
            name: "Quality-control readout",
            target: "Within acceptable baseline range",
            method: "Independent QC assay or inspection",
          },
        ],
        statisticalApproach:
          "Pre-register the comparison, report effect size and 95% confidence interval, and use a power plan appropriate for the assay.",
        reproducibilityChecks: [
          "Blind sample labels before measurement",
          "Repeat with independent preparation or batch",
          "Publish raw readouts and analysis script",
        ],
        positiveControl: "Known active or benchmark condition for the assay",
        negativeControl: "Vehicle-only, untreated, or assay-floor condition",
      },
      risks: [
        {
          id: "r1",
          title: "Biological variability masks the effect",
          category: "scientific",
          likelihood: "medium",
          impact: "medium",
          mitigation: "Use independent replicates, pre-power the study, and track batch metadata.",
        },
        {
          id: "r2",
          title: "Assay or operator bias",
          category: "scientific",
          likelihood: "medium",
          impact: "medium",
          mitigation: "Blind labels and have a second reviewer audit a subset of readouts.",
        },
      ],
      supplierUrlPattern: TRUSTED_SUPPLIER_URL,
      reviewQuestions: [
        "Are the positive and negative controls strong enough for this assay?",
        ...sharedReview,
      ],
    };
  }

  if (kind === "materials_science") {
    return {
      kind,
      label: "Materials science agent",
      literatureQueries: unique([
        ...seed,
        "materials synthesis characterization reproducibility protocol",
        "materials property measurement benchmark characterization",
        "materials science experimental design controls",
      ]),
      protocolQueries: unique([
        ...seed,
        "materials synthesis protocol characterization",
        "thin film characterization protocol",
        "sample preparation microscopy spectroscopy protocol",
      ]),
      defaultMaterials: [
        "Target material precursor",
        "Substrate or sample holder",
        "Characterization instrument access",
      ],
      timelinePhases: [
        {
          phase: "Design",
          milestone: "Recipe and characterization plan locked",
          tasks: [
            "Define synthesis variables",
            "Choose benchmark material",
            "Confirm instrument access",
          ],
          deliverable: "Synthesis and characterization matrix",
        },
        {
          phase: "Synthesis",
          milestone: "Samples fabricated",
          tasks: ["Prepare precursor batch", "Fabricate sample set", "Record process parameters"],
          deliverable: "Traceable sample set",
        },
        {
          phase: "Characterization",
          milestone: "Primary property measured",
          tasks: [
            "Run structural characterization",
            "Run property measurement",
            "Archive raw spectra/images",
          ],
          deliverable: "Characterization dataset",
        },
        {
          phase: "Analysis",
          milestone: "Structure-property result reviewed",
          tasks: ["Compare against benchmark", "Estimate uncertainty", "Document failure modes"],
          deliverable: "Materials performance report",
        },
      ],
      validation: {
        primaryMetricName: "Target material property",
        primaryMetricTarget: "Improvement over benchmark with uncertainty bounds",
        primaryMetricMethod: "Calibrated characterization method",
        secondaryMetrics: [
          {
            name: "Structural or compositional confirmation",
            target: "Consistent with intended material phase/composition",
            method: "XRD, microscopy, spectroscopy, or equivalent characterization",
          },
        ],
        statisticalApproach:
          "Report sample count, measurement uncertainty, calibration method, and benchmark comparison.",
        reproducibilityChecks: [
          "Repeat synthesis on an independent batch",
          "Calibrate characterization instrument",
          "Preserve raw spectra/images and processing parameters",
        ],
        positiveControl: "Published benchmark material or internal reference sample",
        negativeControl: "Blank substrate, baseline material, or no-additive formulation",
      },
      risks: [
        {
          id: "r1",
          title: "Synthesis route is not reproducible",
          category: "scientific",
          likelihood: "medium",
          impact: "high",
          mitigation: "Track all process parameters and repeat an independent batch before claims.",
        },
        {
          id: "r2",
          title: "Characterization artifact is mistaken for a real effect",
          category: "scientific",
          likelihood: "medium",
          impact: "high",
          mitigation: "Use calibrated instruments and confirm with an orthogonal measurement.",
        },
      ],
      supplierUrlPattern: TRUSTED_SUPPLIER_URL,
      reviewQuestions: [
        "Is the benchmark material the right comparator for the claimed improvement?",
        ...sharedReview,
      ],
    };
  }

  if (kind === "computational") {
    return {
      kind,
      label: "Computational research agent",
      literatureQueries: unique([
        ...seed,
        "algorithm benchmark reproducibility dataset evaluation",
        "machine learning benchmark ablation reproducibility",
        "software experiment design statistical evaluation",
      ]),
      protocolQueries: unique([
        ...seed,
        "computational experiment reproducibility protocol",
        "benchmark evaluation protocol machine learning",
        "data preprocessing validation protocol",
      ]),
      defaultMaterials: [
        "Version-controlled code repository",
        "Benchmark dataset access",
        "Compute environment",
      ],
      timelinePhases: [
        {
          phase: "Specification",
          milestone: "Benchmark locked",
          tasks: ["Define metric", "Freeze dataset split", "Create reproducible environment"],
          deliverable: "Experiment spec and environment file",
        },
        {
          phase: "Implementation",
          milestone: "Baseline running",
          tasks: ["Implement baseline", "Add logging", "Write smoke tests"],
          deliverable: "Runnable baseline pipeline",
        },
        {
          phase: "Evaluation",
          milestone: "Primary metric computed",
          tasks: ["Run benchmark", "Run ablations", "Track seeds and configs"],
          deliverable: "Benchmark result table",
        },
        {
          phase: "Analysis",
          milestone: "Reproducibility pack ready",
          tasks: ["Estimate variance", "Compare to baselines", "Package code and data card"],
          deliverable: "Reproducibility report",
        },
      ],
      validation: {
        primaryMetricName: "Pre-registered benchmark metric",
        primaryMetricTarget: "Improvement over baseline with confidence interval",
        primaryMetricMethod: "Frozen evaluation script and dataset split",
        secondaryMetrics: [
          {
            name: "Robustness or ablation metric",
            target: "Consistent improvement across seeds or subsets",
            method: "Multiple-seed ablation and sensitivity analysis",
          },
        ],
        statisticalApproach:
          "Run multiple seeds where stochastic, report confidence intervals, and compare against a locked baseline.",
        reproducibilityChecks: [
          "Pin dependencies and random seeds",
          "Publish configs, logs, and evaluation script",
          "Run a clean-environment reproduction",
        ],
        positiveControl: "Known baseline or published reference implementation",
        negativeControl: "Naive baseline, shuffled labels, or disabled intervention",
      },
      risks: [
        {
          id: "r1",
          title: "Data leakage inflates the result",
          category: "scientific",
          likelihood: "medium",
          impact: "high",
          mitigation: "Freeze train/validation/test splits and audit preprocessing boundaries.",
        },
        {
          id: "r2",
          title: "Result depends on an untracked environment detail",
          category: "operational",
          likelihood: "medium",
          impact: "medium",
          mitigation: "Pin dependencies, hardware notes, seeds, and all config files.",
        },
      ],
      supplierUrlPattern: TRUSTED_SUPPLIER_URL,
      reviewQuestions: ["Is the benchmark split frozen before tuning starts?", ...sharedReview],
    };
  }

  if (kind === "climate_environment") {
    return {
      kind,
      label: "Climate and environmental research agent",
      literatureQueries: unique([
        ...seed,
        "environmental field study sampling protocol validation",
        "climate environmental measurement uncertainty reproducibility",
        "remote sensing environmental monitoring validation",
      ]),
      protocolQueries: unique([
        ...seed,
        "environmental sampling protocol",
        "water soil air sampling protocol",
        "field measurement quality assurance protocol",
      ]),
      defaultMaterials: ["Sampling containers", "Field sensor access", "Calibration standard"],
      timelinePhases: [
        {
          phase: "Study Design",
          milestone: "Sampling plan approved",
          tasks: ["Define sites", "Define sampling cadence", "Confirm permits and safety"],
          deliverable: "Field sampling plan",
        },
        {
          phase: "Calibration",
          milestone: "Instruments calibrated",
          tasks: ["Calibrate sensors", "Prepare blanks/standards", "Train sampling team"],
          deliverable: "Calibration and QA log",
        },
        {
          phase: "Collection",
          milestone: "Field data collected",
          tasks: ["Collect samples", "Record metadata", "Preserve chain of custody"],
          deliverable: "Field dataset and samples",
        },
        {
          phase: "Analysis",
          milestone: "Validated result produced",
          tasks: ["Analyze samples/data", "Estimate uncertainty", "Compare to baseline"],
          deliverable: "Environmental analysis report",
        },
      ],
      validation: {
        primaryMetricName: "Environmental outcome measure",
        primaryMetricTarget: "Difference from baseline or threshold with uncertainty",
        primaryMetricMethod: "Calibrated field, laboratory, or remote-sensing measurement",
        secondaryMetrics: [
          {
            name: "Quality assurance metric",
            target: "Blank/duplicate results within acceptance criteria",
            method: "Field blanks, duplicates, or independent sensor cross-check",
          },
        ],
        statisticalApproach:
          "Account for spatial/temporal autocorrelation, report uncertainty, and compare against baseline.",
        reproducibilityChecks: [
          "Use field blanks and duplicate samples",
          "Log location, time, weather, and instrument metadata",
          "Archive raw measurements and processing scripts",
        ],
        positiveControl: "Known reference site, calibration standard, or historical event",
        negativeControl: "Blank sample, control site, or pre-intervention baseline",
      },
      risks: [
        {
          id: "r1",
          title: "Sampling bias confounds the result",
          category: "scientific",
          likelihood: "medium",
          impact: "high",
          mitigation: "Predefine site selection and include spatial/temporal controls.",
        },
        {
          id: "r2",
          title: "Instrument drift changes measurements",
          category: "operational",
          likelihood: "medium",
          impact: "medium",
          mitigation: "Calibrate before and after sampling and include duplicate measurements.",
        },
      ],
      supplierUrlPattern: TRUSTED_SUPPLIER_URL,
      reviewQuestions: [
        "Does the sampling design separate the hypothesis from seasonal or location effects?",
        ...sharedReview,
      ],
    };
  }

  if (kind === "engineering") {
    return {
      kind,
      label: "Engineering prototype agent",
      literatureQueries: unique([
        ...seed,
        "engineering prototype validation testing protocol",
        "sensor device benchmark reliability experiment",
        "hardware prototype design validation risk",
      ]),
      protocolQueries: unique([
        ...seed,
        "prototype testing protocol",
        "sensor calibration protocol",
        "engineering validation test protocol",
      ]),
      defaultMaterials: ["Prototype components", "Measurement instrument access", "Test fixture"],
      timelinePhases: [
        {
          phase: "Requirements",
          milestone: "Test requirements locked",
          tasks: ["Define acceptance criteria", "Identify constraints", "Choose baseline design"],
          deliverable: "Requirements and test matrix",
        },
        {
          phase: "Build",
          milestone: "Prototype assembled",
          tasks: ["Procure components", "Assemble prototype", "Run safety checks"],
          deliverable: "Testable prototype",
        },
        {
          phase: "Test",
          milestone: "Primary performance test complete",
          tasks: ["Calibrate instruments", "Run stress tests", "Record failure modes"],
          deliverable: "Test dataset",
        },
        {
          phase: "Iteration",
          milestone: "Design decision made",
          tasks: ["Compare to acceptance criteria", "Analyze failure modes", "Prioritize redesign"],
          deliverable: "Validation and redesign report",
        },
      ],
      validation: {
        primaryMetricName: "Prototype performance metric",
        primaryMetricTarget: "Meets pre-defined acceptance threshold",
        primaryMetricMethod: "Calibrated bench or field test",
        secondaryMetrics: [
          {
            name: "Reliability or safety metric",
            target: "No critical failure under defined test conditions",
            method: "Stress, repeatability, or safety test",
          },
        ],
        statisticalApproach:
          "Run repeated trials, report measurement uncertainty, and compare against baseline design.",
        reproducibilityChecks: [
          "Calibrate measurement equipment",
          "Repeat tests across operating conditions",
          "Archive build files, firmware, and test logs",
        ],
        positiveControl: "Commercial benchmark or known-good reference design",
        negativeControl: "Baseline design, disabled module, or no-load condition",
      },
      risks: [
        {
          id: "r1",
          title: "Prototype fails under real operating conditions",
          category: "scientific",
          likelihood: "medium",
          impact: "high",
          mitigation: "Define stress tests and acceptance criteria before iteration.",
        },
        {
          id: "r2",
          title: "Measurement setup dominates the observed effect",
          category: "operational",
          likelihood: "medium",
          impact: "medium",
          mitigation: "Calibrate instruments and test a known-good reference design.",
        },
      ],
      supplierUrlPattern: TRUSTED_SUPPLIER_URL,
      reviewQuestions: [
        "Are acceptance criteria measurable with the available equipment?",
        ...sharedReview,
      ],
    };
  }

  return {
    kind,
    label: "General research planning agent",
    literatureQueries: unique([
      ...seed,
      "research hypothesis validation experimental design reproducibility",
      "study design protocol validation controls",
      "evidence synthesis research protocol",
    ]),
    protocolQueries: unique([
      ...seed,
      "research protocol validation",
      "experimental design protocol controls",
      "study reproducibility protocol",
    ]),
    defaultMaterials: [
      "Required domain resources",
      "Measurement access",
      "Data recording template",
    ],
    timelinePhases: [
      {
        phase: "Scope",
        milestone: "Question and metric locked",
        tasks: ["Define hypothesis", "Define primary metric", "Identify constraints"],
        deliverable: "Research specification",
      },
      {
        phase: "Preparation",
        milestone: "Resources ready",
        tasks: ["Confirm data/materials", "Choose protocol", "Define controls"],
        deliverable: "Execution checklist",
      },
      {
        phase: "Execution",
        milestone: "Primary observation collected",
        tasks: ["Run planned procedure", "Track deviations", "Archive raw evidence"],
        deliverable: "Raw evidence package",
      },
      {
        phase: "Analysis",
        milestone: "Decision-ready result",
        tasks: ["Analyze against threshold", "Review limitations", "Write next-step decision"],
        deliverable: "Decision report",
      },
    ],
    validation: {
      primaryMetricName: "Pre-registered primary metric",
      primaryMetricTarget: "Decision threshold defined before execution",
      primaryMetricMethod: "Domain-appropriate direct measurement",
      secondaryMetrics: [
        {
          name: "Robustness check",
          target: "Consistent with primary conclusion",
          method: "Independent measurement, repeat, or sensitivity analysis",
        },
      ],
      statisticalApproach:
        "Predefine the decision rule, report uncertainty, and preserve raw evidence for audit.",
      reproducibilityChecks: [
        "Pre-register hypothesis, metric, and decision threshold",
        "Repeat or independently audit the key measurement",
        "Archive raw evidence and analysis steps",
      ],
      positiveControl: "Known-good reference, benchmark, or expected-positive condition",
      negativeControl: "No-intervention, blank, baseline, or expected-null condition",
    },
    risks: [
      {
        id: "r1",
        title: "Primary metric does not actually test the hypothesis",
        category: "scientific",
        likelihood: "medium",
        impact: "high",
        mitigation: "Have a domain expert review the metric before execution.",
      },
      {
        id: "r2",
        title: "Evidence source coverage is too thin",
        category: "scientific",
        likelihood: "medium",
        impact: "medium",
        mitigation:
          "Broaden literature/protocol search and mark unsupported assumptions explicitly.",
      },
    ],
    supplierUrlPattern: TRUSTED_SUPPLIER_URL,
    reviewQuestions: sharedReview,
  };
}
