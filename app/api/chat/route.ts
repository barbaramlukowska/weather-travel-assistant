import { getChatModel } from '@/lib/model';
import { compactContext } from '@/lib/context';
import { tools, type ChatUIMessage } from '@/lib/tools';
import { buildSystemPrompt } from '@/lib/prompt';
import { memorySchema } from '@/lib/memory';
import { MAX_BODY_CHARS, MAX_MESSAGES } from '@/lib/limits';
import {
  streamText,
  smoothStream,
  stepCountIs,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
} from 'ai';
import { z } from 'zod';
import { isRateLimited, clientKeyFrom } from '@/lib/rate-limit';
import { toClientErrorMessage } from './client-error';

export const maxDuration = 30;

// Consumption caps (OWASP LLM10): the endpoint is public and every request
// spends paid tokens, so both request rate and request size are bounded. The
// limits live in lib/limits.ts, shared with the browser, which warns early —
// but only this check decides.

// Both limits answer 413 with a code: the browser shows "This chat is full"
// for it instead of a generic error.
function chatTooLong() {
  return Response.json(
    { error: 'This chat is too long. Start a new chat to keep going.', code: 'chat_too_long' },
    { status: 413 },
  );
}

// Validate at the trust boundary, but only the contract we depend on — the AI
// SDK owns and validates the messages themselves. `memory` goes straight into
// the system prompt, and anyone can POST here, so it gets the same schema as
// the browser store. Optional: an empty memory and older clients send none.
const requestSchema = z.object({
  messages: z.array(z.unknown()).min(1).max(MAX_MESSAGES),
  memory: memorySchema.optional(),
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
  if (raw.length > MAX_BODY_CHARS) return chatTooLong();

  // Parse defensively: a malformed or non-JSON body must not crash the route.
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Before the schema: 61 messages is a chat that grew too long, not a
  // malformed request, and must not come back as a confusing 400.
  if (
    typeof body === 'object' &&
    body !== null &&
    'messages' in body &&
    Array.isArray(body.messages) &&
    body.messages.length > MAX_MESSAGES
  ) {
    return chatTooLong();
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error:
          'Invalid request: expected a non-empty "messages" array and an optional valid "memory" object',
      },
      { status: 400 },
    );
  }

  const messages = parsed.data.messages as ChatUIMessage[];

  // Compaction runs on ModelMessages — after conversion, right before the
  // model call. That is the layer where tool results carry a `toolName` and
  // may hold plain text, and it is the same shape the eval runner uses.
  // ignoreIncompleteToolCalls: Stop during a tool call leaves its part at
  // input-available, and chats are now saved. Without it every later message
  // of that chat would fail with MissingToolResultsError.
  const modelMessages = await convertToModelMessages(messages, { ignoreIncompleteToolCalls: true });
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
    system: buildSystemPrompt(parsed.data.memory),
    messages: compacted,
    tools,
    // The agent loop: without this the model calls the tool but never writes
    // the final answer.
    stopWhen: stepCountIs(5),
    // Stop in the browser (or closing the tab) closes the request. Without
    // the signal the model would keep generating — and billing — a reply
    // nobody reads. Compaction keeps its own timeout and gets no signal.
    abortSignal: req.signal,
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
