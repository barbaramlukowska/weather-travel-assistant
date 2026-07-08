import { getChatModel } from '@/lib/model';
import { pruneOldToolResults } from '@/lib/context';
import { tools, type ChatUIMessage } from '@/lib/tools';
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

export const maxDuration = 30;

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
  messages: z.array(z.unknown()).min(1),
});

export async function POST(req: Request) {
  // Parse defensively: a malformed or non-JSON body must not crash the route.
  let body: unknown;
  try {
    body = await req.json();
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

  const result = streamText({
    // Accuracy comes from the getWeather tool, not the model's own knowledge,
    // so a small, fast model is enough for correct weather.
    model: getChatModel(),
    system:
      `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. You are a friendly travel assistant. Use your tools to fetch real ` +
      'data instead of guessing: getWeather for CURRENT conditions, ' +
      'getForecast for FUTURE weather (tomorrow, the weekend, an upcoming ' +
      'trip), and getAirQuality for air quality, smog, or pollution. Combine ' +
      'several tools in one answer when the question needs it. Never present ' +
      'current conditions as a forecast — if the user asks about the future, ' +
      'call getForecast. Each forecast day includes a `weekday` field — use it ' +
      'verbatim; never rename or recompute the day of the week yourself. ' +
      'Always pass city names in English (e.g. ' +
      "'Vienna', not 'Wiedeń') so the geocoder resolves the right place. If " +
      'a city cannot be found, say so plainly. When the user asks to plan a ' +
      'trip, call getForecast first, then planTrip — the card shows the plan, ' +
      'so do not repeat the summary or packing list in your text answer. ' +
      'Keep answers concise and helpful.',
    messages: await convertToModelMessages(pruneOldToolResults(messages)),
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
