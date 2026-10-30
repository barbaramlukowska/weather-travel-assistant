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
  in sequence, and synthesizes one answer. Six tools — four grounded in **real data**
  so numbers are never made up, two for memory:
  - `getWeather` — current conditions (Open-Meteo)
  - `getForecast` — 7-day daily forecast
  - `getAirQuality` — US AQI, PM2.5, PM10
  - `planTrip` — a structured trip-plan card, filled from the forecast
  - `remember` / `forget` — lasting user preferences in fixed shapes: home city
    (checked by the geocoder), comfortable temperatures, travel party, interest
    and avoid tags from closed lists, plus up to 10 short notes for anything
    that fits no category (saved automatically; the oldest drops out).
    Executed in the browser.
- **Preference memory** — saved in `localStorage`, sent with each request and
  injected into the system prompt as a tagged data block; a header panel lists
  everything stored and deletes one fact or all of them.
- **Chat history** — up to 30 conversations saved in `localStorage`, with a
  sidebar (a drawer on phones) to reopen, start or delete them; the last open
  chat comes back after a reload. A long chat gets a warning, then closes
  cleanly before the server's size cap, and the common storage problems (full
  or blocked storage, a chat that can't be opened) are explained in the UI.
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
- **LLM (provider-agnostic)** — **OpenAI** `gpt-5.6-luna` by default via `@ai-sdk/openai`,
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
    → streamText() calls the LLM with all six tools available
      → model plans and calls the tool(s) it needs → e.g. getForecast({ city })
        → our code fetches Open-Meteo (geocoding → data)
      → real data returns to the model (agent loop, capped at 5 steps)
    → model streams the final answer / renders a tool card
  → useChat renders it live in the browser (components/chat/chat-session.tsx)
```

The key idea: **accuracy comes from grounding the model with tools**, not from the
model's own knowledge. That's why a small, fast model is enough — and where the model
is unreliable (date math, AQI scales), the code decides and hands it the result.

## Run it locally

```bash
# 1. Install dependencies
pnpm install

# 2. Add an API key for your chosen provider (see below)
echo "OPENAI_API_KEY=your-key-here" > .env.local

# 3. Start the dev server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and ask, e.g., _"What's the
weather in Kraków?"_

### Choosing a provider

The provider is selected at runtime by the `LLM_PROVIDER` env var:

| `LLM_PROVIDER` | Model | Required key |
| --- | --- | --- |
| _(unset)_ / `openai` | `gpt-5.6-luna` | `OPENAI_API_KEY` |
| `google` | `gemini-2.5-flash` | `GOOGLE_GENERATIVE_AI_API_KEY` |

Default is **OpenAI pay-as-you-go** — a multi-step agent can make several model
calls per question, which the free Gemini tier (~20 requests/day) couldn't sustain.
Gemini remains a drop-in fallback: set `LLM_PROVIDER=google` and provide its key.

The eval judge picks its model independently, via `JUDGE_PROVIDER` (default `openai`)
and `JUDGE_MODEL` (default `gpt-5.6-terra`) — the agent and the instrument that
measures it are separate choices, so swapping one never silently swaps the other,
and the judge is never the same model as the chat.

> **Note:** if the free Gemini tier hits its daily cap, the app surfaces a friendly
> message (HTTP 429) instead of a generic error, and the quota resets within 24 hours.

## Testing & quality

```bash
pnpm test                   # Vitest — component + unit tests (gate the CI pipeline)
pnpm eval                   # agent evals — 29 cases against a real LLM (run manually)
pnpm eval --no-judge        # same, deterministic assertions only (cheaper)
pnpm eval --update-baseline # record turn time and cost of a full, all-green run
pnpm eval:judge             # calibrate the LLM judge against hand-labelled fixtures
pnpm eval:critic            # calibrate the trip-plan critic against 10 fixtures
pnpm lint                   # eslint
```

- **Component/unit tests** run in CI (GitHub Actions), ahead of the build step, so a red test blocks the pipeline. They are deliberately *not* part of `pnpm build` itself — Vercel runs that script in a production environment where the React test bundle is unavailable.
- **Evals** (`evals/`) check agent *behaviour* — which tools fire, tool inputs, and
  the final text — including adversarial prompt-injection cases. They hit a real LLM
  (non-deterministic, paid), so they run on demand, not in CI.
- **LLM-as-judge** adds a second layer on six of those cases: a separate model rules
  on closed criteria a regex cannot express ("does the answer actually recommend
  whether to go for a run, and justify it with the reported value?"). It runs only
  after the deterministic assertions pass, and its verdicts join the same failure
  list. The judge itself is calibrated first: `pnpm eval:judge` scores it against
  9 hand-labelled fixtures (11 labels, 5 pass / 6 fail) and prints the result next to
  an always-pass/always-fail baseline, so a judge that answers the same way every
  time is visibly worse than a real one.
- **Performance gate** — every eval run also prints p50/p95 turn time and the
  agent's cost next to a committed baseline (`evals/perf-baseline.json`), and fails
  when time grows past 1.3× or cost per turn past 1.15×. The thresholds come from
  measured run-to-run noise (p95 ±11%, cost ±3%). The gate was tested by adding a
  5-second delay to one tool: all 29 cases still passed, and the run went red on p95.
  Only a full run on the baseline's model is compared; anything else just prints.

## Observability

Every chat turn writes one JSON line to the server log — numbers and tool names
only, never prompts, replies or memory:

```
chat turn: {"status":"done","model":"gpt-5.6-luna","steps":3,"ttftMs":1388,"ms":5868,
  "tokens":{"input":6830,"cached":6184,"output":182,"reasoning":24},"costUsd":0.00047128,
  "tools":[{"name":"getForecast","ms":296},{"name":"planTrip","ms":1}]}
```

- **Built on AI SDK 7 lifecycle callbacks** (`onEnd`, `onAbort`): the SDK already
  measures time to first token and the time of each tool call, so nothing is timed
  by hand. Cost is tokens × a price table (`lib/pricing.ts`), with cached input and
  reasoning tokens counted separately. A model without a price logs `null`, not
  `0`, so a missing price never looks free. Turns stopped by the user are logged
  too, because their finished steps were billed.
- **What the numbers showed:** a trip-plan turn costs about $0.0005–0.0008, and
  50–90% of its input is served from the provider's cache. One round of the
  trip-plan critic costs about $0.006 — 12× the whole chat turn — and adds about
  5 s. The critic logs its own cost (`trip review:`), and it ships switched off.
- **Local deep-dive:** `AI_DEVTOOLS=1 pnpm dev` plus `pnpm devtools` opens the
  [AI SDK DevTools](https://ai-sdk.dev/docs/ai-sdk-core/devtools) viewer on
  `localhost:4983` with every step, prompt and tool call as a tree; the critic's
  call nests under the chat step that ran it. It stores full prompts as plain
  text in `.devtools/` (gitignored), so it is opt-in and absent from production builds.
- **No hosted tracing yet** (Langfuse, OpenTelemetry): the log line adds no new
  third party that sees user data.

## Security

Threat-modelled against the current OWASP lists — Top 10 for Agentic Applications
2026 (ASI), Top 10 for LLM Applications 2025, and the classic web Top 10 — with the
full mapping (risk → applies? → mitigation → test) in [docs/THREAT-MODEL.md](./docs/THREAT-MODEL.md).
Highlights: prompt-injection defence (data-vs-instructions rule + adversarial evals),
per-IP rate limiting and request-size caps (consumption/cost), server tools that
only read (the memory tools write only the user's own browser storage), secrets
kept server-side, and security response headers.

## Project structure

```
app/
  api/chat/route.ts   # backend: streamText agent loop + request guards
  page.tsx            # renders <Chat /> from components/chat/
  layout.tsx          # fonts, metadata, no-flash theme script
  globals.css         # Tailwind v4 theme tokens (light + dark)
lib/
  model.ts            # provider-agnostic model selection (LLM_PROVIDER)
  tools.ts            # the six tools + Zod schemas + inferred UI types
  prompt.ts           # single source of truth for the system prompt
  context/            # two-level context compaction (digest, tokens, summarize, compact)
  geocode.ts          # city → coordinates + canonical name (server tools and the browser)
  memory/             # preference memory: fixed-shape schema, formatter, resolver, localStorage store
  history/            # chat history: list, one key per chat, active chat, quota handling
  trip-review/        # trip-plan critic: code checks, critic model, reviser, review loop (off by default)
  limits.ts           # request limits shared by the route and the browser
  rate-limit.ts       # per-IP sliding-window rate limiter
  pricing.ts          # price table and token → USD cost
  turn-log.ts         # one log line per chat turn: tokens, cost, time to first token, tool times
components/chat/      # frame + history sidebar/drawer, chat session (useChat), per-tool cards (with tests)
evals/                # agent behaviour + adversarial eval suite, plus the LLM judge
                      # (judge.ts calls the model; prompt/verdict/score logic is pure)
                      # and the performance gate (perf.ts, perf-baseline.json)
docs/THREAT-MODEL.md  # OWASP threat model & mitigations
instrumentation.ts    # opt-in AI SDK DevTools for local development
next.config.ts        # security response headers (CSP report-only, HSTS, …)
```
