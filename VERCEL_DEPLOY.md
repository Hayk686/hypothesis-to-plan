# Vercel Deployment

This project is a TanStack Start app configured for Vercel with Nitro.

## Vercel settings

- Framework preset: TanStack Start, or Other if Vercel does not auto-detect it
- Install command: `npm install`
- Build command: `npm run build`
- Output directory: leave empty; Nitro generates `.output`

## Required environment variables

Set these in Vercel Project Settings -> Environment Variables for Preview and Production.
Do not prefix private keys with `VITE_`.

```txt
SEMANTIC_SCHOLAR_API_KEY=
NCBI_API_KEY=
PROTOCOLS_IO_CLIENT_TOKEN=
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=
OPENROUTER_MODEL=liquid/lfm-2.5-1.2b-instruct:free
OPENROUTER_SITE_URL=https://your-project.vercel.app
OPENROUTER_APP_TITLE=Hypothesis to Plan
```

Optional NVIDIA alternative:

```txt
LLM_PROVIDER=nvidia
NVIDIA_API_KEY=
NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1
NVIDIA_MODEL=openai/gpt-oss-20b
```

## Deploy flow

1. Push the branch to GitHub.
2. Import the repository in Vercel.
3. Add the environment variables above.
4. Deploy.
5. After the first deploy, update `OPENROUTER_SITE_URL` to the final Vercel URL and redeploy.

## Smoke checks after deploy

- Open `/new` and click `Generate example`.
- Run a literature QC for a non-HeLa hypothesis.
- Open a generated project and verify source badges:
  - Semantic Scholar or PubMed for literature
  - protocols.io or explicit curated fallback for protocols
  - OpenRouter/NVIDIA or deterministic fallback for LLM
