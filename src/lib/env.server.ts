// ============================================================
// /lib/env.server.ts
// ------------------------------------------------------------
// Validates and extracts all necessary environment variables,
// ensuring no secrets leak into the client bundle (no VITE_ prefix).
// ============================================================

export type LlmConfig = {
  provider: "openrouter" | "nvidia";
  apiKey: string;
  endpoint: string;
  model: string;
};

export type EnvConfig = {
  LLM_PROVIDER: "auto" | "nvidia" | "openrouter";
  LLM_FALLBACKS_ENABLED: boolean;
  LLM_TIMEOUT_MS: number;
  LLM_JSON_REPAIR_ATTEMPTS: number;

  NVIDIA_API_KEY: string;
  NVIDIA_MODEL: string;
  NVIDIA_BASE_URL: string;

  OPENROUTER_API_KEY: string;
  OPENROUTER_MODEL: string;
  OPENROUTER_BASE_URL: string;
  OPENROUTER_SITE_URL: string;
  OPENROUTER_APP_TITLE: string;
};

export function getEnvConfig(): EnvConfig {
  const rawProvider = (process.env.LLM_PROVIDER ?? "").trim().toLowerCase();
  const provider = rawProvider === "nvidia" || rawProvider === "openrouter" ? rawProvider : "auto";

  return {
    LLM_PROVIDER: provider,
    LLM_FALLBACKS_ENABLED: process.env.LLM_FALLBACKS_ENABLED !== "false",
    LLM_TIMEOUT_MS: process.env.LLM_TIMEOUT_MS ? parseInt(process.env.LLM_TIMEOUT_MS, 10) : 55000,
    LLM_JSON_REPAIR_ATTEMPTS: process.env.LLM_JSON_REPAIR_ATTEMPTS
      ? parseInt(process.env.LLM_JSON_REPAIR_ATTEMPTS, 10)
      : 1,

    NVIDIA_API_KEY: (process.env.NVIDIA_API_KEY || process.env.NVIDIA_NIM_API_KEY || "").trim(),
    NVIDIA_MODEL: process.env.NVIDIA_MODEL || "z-ai/glm-5.1",
    NVIDIA_BASE_URL: (process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(
      /\/$/,
      ""
    ),

    OPENROUTER_API_KEY: (process.env.OPENROUTER_API_KEY || "").trim(),
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free",
    OPENROUTER_BASE_URL:
      process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1/chat/completions",
    OPENROUTER_SITE_URL: process.env.OPENROUTER_SITE_URL || "http://127.0.0.1:5173",
    OPENROUTER_APP_TITLE: process.env.OPENROUTER_APP_TITLE || "Hypothesis to Plan",
  };
}

export function validateRequiredEnv(): string[] {
  const env = getEnvConfig();
  const missing: string[] = [];

  if (!env.NVIDIA_API_KEY && !env.OPENROUTER_API_KEY) {
    missing.push("NVIDIA_API_KEY or OPENROUTER_API_KEY");
  }

  // Add more strict validation if needed, but it shouldn't crash if at least one LLM works.
  return missing;
}

export function buildLlmChain(): LlmConfig[] {
  const env = getEnvConfig();

  const nvidia: LlmConfig = {
    provider: "nvidia",
    apiKey: env.NVIDIA_API_KEY,
    endpoint: `${env.NVIDIA_BASE_URL}/chat/completions`,
    model: env.NVIDIA_MODEL,
  };

  const openrouter: LlmConfig = {
    provider: "openrouter",
    apiKey: env.OPENROUTER_API_KEY,
    endpoint: env.OPENROUTER_BASE_URL,
    model: env.OPENROUTER_MODEL,
  };

  let chain: LlmConfig[] = [];
  if (env.LLM_PROVIDER === "nvidia") {
    chain = [nvidia, openrouter];
  } else if (env.LLM_PROVIDER === "openrouter") {
    chain = [openrouter, nvidia];
  } else {
    // auto: if nvidia key is present, prioritize it
    chain = env.NVIDIA_API_KEY ? [nvidia, openrouter] : [openrouter, nvidia];
  }

  if (!env.LLM_FALLBACKS_ENABLED) {
    chain = chain.slice(0, 1);
  }

  return chain.filter((config) => config.apiKey.length > 0);
}
