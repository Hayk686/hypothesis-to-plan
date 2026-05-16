export type ExampleProjectDraft = {
  title: string;
  hypothesis: string;
  domain: string;
  organism: string;
  budget: number;
  timelineWeeks: number;
  resources: string;
  constraints: string;
  generatedBy: "llm" | "fallback";
};

type ExampleTheme = Omit<ExampleProjectDraft, "generatedBy">;

const FALLBACK_EXAMPLES: ExampleTheme[] = [
  {
    title: "RAG Benchmark for Legal Document Triage",
    hypothesis:
      "A retrieval-augmented classifier will improve legal document triage macro-F1 by at least 8 percentage points over a fine-tuned baseline on a frozen open benchmark dataset.",
    domain: "Computational Biology",
    organism: "Frozen benchmark dataset and evaluation script",
    budget: 15000,
    timelineWeeks: 6,
    resources: "Python, GitHub repository, GPU or cloud compute credits, benchmark dataset access",
    constraints: "Use open datasets only; freeze train/validation/test splits before tuning.",
  },
  {
    title: "Graphene Coating for Battery Electrode Stability",
    hypothesis:
      "A thin graphene coating will improve lithium battery electrode capacity retention by at least 10 percentage points after 100 charge cycles compared with an uncoated electrode.",
    domain: "Materials Science",
    organism: "Lithium battery electrode",
    budget: 35000,
    timelineWeeks: 8,
    resources:
      "Electrochemical workstation, microscopy access, graphene-coated and uncoated electrodes",
    constraints:
      "Use non-destructive characterization where possible; include uncoated electrode controls.",
  },
  {
    title: "Soil Moisture Sensor Calibration for Field Plots",
    hypothesis:
      "A site-specific calibration curve will reduce soil moisture sensor absolute error by at least 20% compared with the manufacturer default calibration across field crop plots.",
    domain: "Climate Science",
    organism: "Field soil moisture sensor network",
    budget: 12000,
    timelineWeeks: 5,
    resources: "Soil moisture sensors, gravimetric sampling supplies, field plot access",
    constraints: "Collect duplicate samples and record weather metadata for every field visit.",
  },
  {
    title: "Low-Cost Sensor Drift Compensation",
    hypothesis:
      "Temperature-aware drift compensation will reduce low-cost air-quality sensor PM2.5 error by at least 15% compared with an uncompensated baseline during outdoor deployment.",
    domain: "Other",
    organism: "Low-cost PM2.5 sensor array",
    budget: 18000,
    timelineWeeks: 6,
    resources:
      "Sensor array, reference monitor access, weather station data, Python analysis pipeline",
    constraints:
      "Calibrate against a reference monitor and report uncertainty across deployment days.",
  },
  {
    title: "Trehalose Blend for Post-Thaw Viability",
    hypothesis:
      "A reduced-DMSO freezing medium supplemented with trehalose will increase post-thaw mammalian cell viability by at least 12 percentage points compared with standard 10% DMSO medium.",
    domain: "Cell biology / Cryopreservation",
    organism: "Mammalian adherent cell culture",
    budget: 9000,
    timelineWeeks: 6,
    resources:
      "BSL-2 tissue culture hood, controlled-rate freezing container, viability assay supplies",
    constraints: "Use non-clinical cell lines only; include standard DMSO and vehicle controls.",
  },
];

function providerConfig() {
  const requested = (process.env.LLM_PROVIDER ?? "").trim().toLowerCase();
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  const nvidiaKey = process.env.NVIDIA_API_KEY ?? process.env.NVIDIA_NIM_API_KEY;

  if ((requested === "openrouter" || !requested) && openRouterKey) {
    return {
      provider: "openrouter" as const,
      apiKey: openRouterKey,
      endpoint: process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1/chat/completions",
      model: process.env.OPENROUTER_MODEL ?? "liquid/lfm-2.5-1.2b-instruct:free",
    };
  }
  if ((requested === "nvidia" || !requested) && nvidiaKey) {
    return {
      provider: "nvidia" as const,
      apiKey: nvidiaKey,
      endpoint: `${(process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1").replace(/\/$/, "")}/chat/completions`,
      model: process.env.NVIDIA_MODEL ?? "openai/gpt-oss-20b",
    };
  }
  return null;
}

function fallbackExample(): ExampleProjectDraft {
  const seed = Math.floor(Math.random() * FALLBACK_EXAMPLES.length);
  return { ...FALLBACK_EXAMPLES[seed], generatedBy: "fallback" };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
    throw new Error("Example generator response did not contain JSON.");
  }
}

function normalizeExample(raw: unknown): ExampleProjectDraft {
  if (!raw || typeof raw !== "object") throw new Error("Example JSON root must be an object.");
  const obj = raw as Record<string, unknown>;
  const fallback = fallbackExample();
  const text = (key: keyof ExampleTheme, fallbackValue: string) =>
    typeof obj[key] === "string" && obj[key].trim() ? (obj[key] as string).trim() : fallbackValue;
  const number = (key: keyof ExampleTheme, fallbackValue: number, min: number, max: number) => {
    const v = obj[key];
    return typeof v === "number" && Number.isFinite(v)
      ? Math.max(min, Math.min(max, Math.round(v)))
      : fallbackValue;
  };

  return {
    title: text("title", fallback.title).slice(0, 120),
    hypothesis: text("hypothesis", fallback.hypothesis).slice(0, 700),
    domain: text("domain", fallback.domain),
    organism: text("organism", fallback.organism).slice(0, 160),
    budget: number("budget", fallback.budget, 5000, 500000),
    timelineWeeks: number("timelineWeeks", fallback.timelineWeeks, 4, 52),
    resources: text("resources", fallback.resources).slice(0, 400),
    constraints: text("constraints", fallback.constraints).slice(0, 400),
    generatedBy: "llm",
  };
}

export async function generateExampleProject(): Promise<ExampleProjectDraft> {
  const config = providerConfig();
  if (!config) return fallbackExample();

  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (config.provider === "openrouter") {
    headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL ?? "http://localhost:5173";
    headers["X-Title"] = process.env.OPENROUTER_APP_TITLE ?? "Hypothesis to Plan";
  }

  const prompt = {
    task: "Generate one plausible, falsifiable research project input for a universal research planning agent. Return only JSON. Do not reuse HeLa/trehalose unless the domain naturally requires it. Vary across life science, materials, climate/environment, engineering, and computational projects.",
    required_shape: {
      title: "short project title",
      hypothesis:
        "specific falsifiable hypothesis with mechanism/system/comparator/expected measurable effect",
      domain:
        "one of: Cell biology / Cryopreservation, Neuroscience / Gene Therapy, Oncology, Microbiology, Immunology, Materials Science, Climate Science, Computational Biology, Other",
      organism: "target organism, system, material, dataset, device, or field setting",
      budget: "number in USD between 5000 and 500000",
      timelineWeeks: "integer between 4 and 52",
      resources: "available resources as a short sentence",
      constraints: "practical constraints as a short sentence",
    },
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    const res = await fetch(config.endpoint, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content:
              "You generate realistic research project inputs for a source-grounded planning app. Return only valid JSON.",
          },
          { role: "user", content: JSON.stringify(prompt) },
        ],
        temperature: 0.8,
        max_tokens: 900,
        response_format: { type: "json_object" },
      }),
    });
    clearTimeout(timeoutId);
    if (!res.ok) return fallbackExample();
    const json = (await res.json()) as { choices?: { message?: { content?: string | null } }[] };
    const content = json.choices?.[0]?.message?.content;
    if (!content) return fallbackExample();
    return normalizeExample(parseJson(content));
  } catch {
    return fallbackExample();
  }
}
