import { getChatModel } from '@/lib/model';
import { compactContext } from '@/lib/context';
import { tools, type ChatUIMessage } from '@/lib/tools';
import { buildSystemPrompt } from '@/lib/prompt';
import {
  streamText,
  smoothStream,
  stepCountIs,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  APICallError,
  RetryError,
} from 'ai';
import { z } from 'zod';
import { RATE_LIMIT_MESSAGE } from '@/lib/errors';
import { isRateLimited, clientKeyFrom } from '@/lib/rate-limit';

export const maxDuration = 30;

// Consumption caps (OWASP LLM10): the endpoint is public and every request
// spends paid tokens, so both request rate and request size are bounded.
const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGES = 60;

// The SDK masks streaming errors as "An error occurred." so internals never
// leak. We override that only for the free-tier daily quota (HTTP 429), which
// is worth explaining. The failing model call is wrapped in retries, so the
// error is usually a RetryError — unwrap it to read the real status code.
function toClientErrorMessage(error: unknown): string {
  const apiError = RetryError.isInstance(error) ? error.lastError : error;

  if (APICallError.isInstance(apiError) && apiError.statusCode === 429) {
    return RATE_LIMIT_MESSAGE;
  }

  console.error('Chat stream error:', error);
  return 'An error occurred.';
}

// Validate at the trust boundary, but only the contract we depend on (a
// non-empty messages array) — the AI SDK owns and validates the rest.
const requestSchema = z.object({
  messages: z.array(z.unknown()).min(1).max(MAX_MESSAGES),
});

export async function POST(req: Request) {
  if (isRateLimited(clientKeyFrom(req))) {
    return Response.json(
      { error: 'Too many requests — please slow down.' },
      { status: 429 },
    );
  }

  // Read as text first so oversized bodies are rejected before JSON.parse.
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ error: 'Request body too large' }, { status: 413 });
  }

  // Parse defensively: a malformed or non-JSON body must not crash the route.
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request: expected a non-empty "messages" array' },
      { status: 400 },
    );
  }

  const messages = parsed.data.messages as ChatUIMessage[];

  // Compaction runs on ModelMessages — after conversion, right before the
  // model call. That is the layer where tool results carry a `toolName` and
  // may hold plain text, and it is the same shape the eval runner uses.
  const modelMessages = await convertToModelMessages(messages);
  const { messages: compacted, stats } = await compactContext(modelMessages);

  // Level 2 costs a model call and up to 8s before the first token, so on
  // production we log every turn that pays for it — including whether the
  // recap was cached, summarised incrementally, or rebuilt from scratch.
  // Turns that only ran level 1 are silent there; in development we log all
  // of them, where the noise is useful and free.
  if (stats.summarized || process.env.NODE_ENV !== 'production') {
    console.log('context compaction:', stats);
  }

  const result = streamText({
    // Accuracy comes from the getWeather tool, not the model's own knowledge,
    // so a small, fast model is enough for correct weather.
    model: getChatModel(),
    system: buildSystemPrompt(),
    messages: compacted,
    tools,
    // The agent loop: without this the model calls the tool but never writes
    // the final answer.
    stopWhen: stepCountIs(5),
    // Re-emit the reply word by word so the UI feels like a smooth typewriter.
    experimental_transform: smoothStream({ delayInMs: 30, chunking: 'word' }),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: toClientErrorMessage,
    }),
  });
}
