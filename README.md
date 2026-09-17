# Aura Travel — AI Weather & Travel Assistant

A conversational travel **agent** that **streams** its answers token-by-token and
plans over **multiple live tools** — current weather, multi-day forecast, air
quality, and trip planning — to answer questions about anywhere in the world.
Built to explore real LLM engineering: streaming, multi-step tool use, context
management, structured/generative UI, evals, and application security.

**🔗 Live demo:** https://weather-travel-assistant.vercel.app/

## What it does

- **Streaming chat** — the model's reply appears gradually, word by word, instead
  of all at once.
- **Multi-step agent (tool use)** — the model plans which tools it needs, calls them
  in sequence, and synthesizes one answer. Four tools, all grounded in **real data**
  so numbers are never made up:
  - `getWeather` — current conditions (Open-Meteo)
  - `getForecast` — 7-day daily forecast
  - `getAirQuality` — US AQI, PM2.5, PM10
  - `planTrip` — a structured trip-plan card, filled from the forecast
- **Generative UI** — each tool renders its own React card (weather, forecast strip,
  colour-coded AQI, trip plan) via a typed state machine (loading → card → not-found → error).
- **Context management** — old tool results are pruned from what's sent to the model
  to keep the context lean over a long conversation (facts kept, bulky data dropped).
- **Provider-agnostic** — one env var switches the LLM provider without touching chat logic.
- **Polished UX** — light/dark mode, a stop button to interrupt generation, a
  "thinking" indicator, graceful error handling with retry, and auto-scroll.

## Tech stack

- **[Next.js](https://nextjs.org) (App Router)** + **TypeScript**
- **[Vercel AI SDK](https://ai-sdk.dev)** — `streamText`, `useChat`, multi-step tool calling
- **LLM (provider-agnostic)** — **OpenAI** `gpt-4o-mini` by default via `@ai-sdk/openai`,
  **Google Gemini** `gemini-2.5-flash` as a fallback via `@ai-sdk/google`; selected at
  runtime by `LLM_PROVIDER`
- **[Open-Meteo](https://open-meteo.com)** — free weather, forecast, air-quality + geocoding APIs (no key)
- **[Tailwind CSS](https://tailwindcss.com) v4** + **[lucide-react](https://lucide.dev)** icons
- **[Zod](https://zod.dev)** — tool input/output schemas (single source of truth for types)
- **[Vitest](https://vitest.dev) + React Testing Library** — component & unit tests; GitHub Actions CI

## How it works

The browser never talks to the model directly — an API route acts as a secure proxy
so the API key stays on the server.

```
User types a message
  → POST /api/chat  (app/api/chat/route.ts)   ← rate limit + size + schema checks
    → streamText() calls the LLM with all four tools available
      → model plans and calls the tool(s) it needs → e.g. getForecast({ city })
        → our code fetches Open-Meteo (geocoding → data)
      → real data returns to the model (agent loop, capped at 5 steps)
    → model streams the final answer / renders a tool card
  → useChat renders it live in the browser (app/page.tsx)
```

The key idea: **accuracy comes from grounding the model with tools**, not from the
model's own knowledge. That's why a small, fast model is enough — and where the model
is unreliable (date math, AQI scales), the code decides and hands it the result.

## Run it locally

```bash
# 1. Install dependencies
npm install

# 2. Add an API key for your chosen provider (see below)
echo "OPENAI_API_KEY=your-key-here" > .env.local

# 3. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and ask, e.g., _"What's the
weather in Kraków?"_

### Choosing a provider

The provider is selected at runtime by the `LLM_PROVIDER` env var:

| `LLM_PROVIDER` | Model | Required key |
| --- | --- | --- |
| _(unset)_ / `openai` | `gpt-4o-mini` | `OPENAI_API_KEY` |
| `google` | `gemini-2.5-flash` | `GOOGLE_GENERATIVE_AI_API_KEY` |

Default is **OpenAI pay-as-you-go** — a multi-step agent can make several model
calls per question, which the free Gemini tier (~20 requests/day) couldn't sustain.
Gemini remains a drop-in fallback: set `LLM_PROVIDER=google` and provide its key.

The eval judge picks its model independently, via `JUDGE_PROVIDER` (default `openai`)
and `JUDGE_MODEL` — the agent and the instrument that measures it are separate
choices, so swapping one never silently swaps the other.

> **Note:** if the free Gemini tier hits its daily cap, the app surfaces a friendly
> message (HTTP 429) instead of a generic error, and the quota resets within 24 hours.

## Testing & quality

```bash
npm run test               # Vitest — component + unit tests (gate the CI pipeline)
npm run eval               # agent evals — 17 cases against a real LLM (run manually)
npm run eval -- --no-judge # same, deterministic assertions only (cheaper)
npm run eval:judge         # calibrate the LLM judge against hand-labelled fixtures
npm run lint               # eslint
```

- **Component/unit tests** run in CI (GitHub Actions), ahead of the build step, so a red test blocks the pipeline. They are deliberately *not* part of `npm run build` itself — Vercel runs that script in a production environment where the React test bundle is unavailable.
- **Evals** (`evals/`) check agent *behaviour* — which tools fire, tool inputs, and
  the final text — including adversarial prompt-injection cases. They hit a real LLM
  (non-deterministic, paid), so they run on demand, not in CI.
- **LLM-as-judge** adds a second layer on six of those cases: a separate model rules
  on closed criteria a regex cannot express ("does the answer actually recommend
  whether to go for a run, and justify it with the reported value?"). It runs only
  after the deterministic assertions pass, and its verdicts join the same failure
  list. The judge itself is calibrated first: `npm run eval:judge` scores it against
  9 hand-labelled fixtures (11 labels, 5 pass / 6 fail) and prints the result next to
  an always-pass/always-fail baseline, so a judge that answers the same way every
  time is visibly worse than a real one.

## Security

Threat-modelled against the current OWASP lists — Top 10 for Agentic Applications
2026 (ASI), Top 10 for LLM Applications 2025, and the classic web Top 10 — with the
full mapping (risk → applies? → mitigation → test) in [docs/THREAT-MODEL.md](./docs/THREAT-MODEL.md).
Highlights: prompt-injection defence (data-vs-instructions rule + adversarial evals),
per-IP rate limiting and request-size caps (consumption/cost), read-only tools by
design, secrets kept server-side, and security response headers.

## Project structure

```
app/
  api/chat/route.ts   # backend: streamText agent loop + request guards
  page.tsx            # frontend: useChat, message list, theme toggle
  layout.tsx          # fonts, metadata, no-flash theme script
  globals.css         # Tailwind v4 theme tokens (light + dark)
lib/
  model.ts            # provider-agnostic model selection (LLM_PROVIDER)
  tools.ts            # the four tools + Zod schemas + inferred UI types
  prompt.ts           # single source of truth for the system prompt
  context/            # two-level context compaction (digest, tokens, summarize, compact)
  rate-limit.ts       # per-IP sliding-window rate limiter
components/chat/      # streamed message list + per-tool cards (with tests)
evals/                # agent behaviour + adversarial eval suite, plus the LLM judge
                      # (judge.ts calls the model; prompt/verdict/score logic is pure)
docs/THREAT-MODEL.md  # OWASP threat model & mitigations
next.config.ts        # security response headers (CSP report-only, HSTS, …)
```
