import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { geocodeCity, type Geocode } from '@/lib/geocode';
import {
  addNote,
  readMemory,
  removeFact,
  removeNote,
  replaceMemory,
  resolveRememberInput,
  saveFact,
} from '@/lib/memory';
import type {
  ChatUIMessage,
  ForgetInput,
  ForgetOutput,
  RememberInput,
  RememberOutput,
} from './types';

// Sent to the model as the tool error, so it tells the user the truth instead
// of claiming a preference was saved that will be gone after a reload.
export const MEMORY_WRITE_ERROR =
  'This browser blocked saving preferences (storage unavailable).';

// useChat awaits onToolCall while it reads the stream, so a hung geocoder
// would freeze the chat on "Remembering…". After this long the request is
// aborted, and the model hears "could not verify the city".
export const GEOCODE_TIMEOUT_MS = 5000;

const geocodeInBrowser: Geocode = (city) =>
  geocodeCity(city, { signal: AbortSignal.timeout(GEOCODE_TIMEOUT_MS) });

export type RememberResult = { ok: true; output: RememberOutput } | { ok: false; error: string };

// The browser-side execute of remember. Async because a city waits for the
// geocoder. Pure apart from the store and the network, so it is tested here
// instead of through a full useChat round-trip.
export async function runRemember(
  input: RememberInput,
  geocode: Geocode = geocodeInBrowser,
): Promise<RememberResult> {
  if (input.category === 'notes') {
    // A fresh read, not a React snapshot: a note another tab saved a moment
    // ago is kept.
    const added = addNote(readMemory(), input.value.text);
    if (!replaceMemory(added.memory)) return { ok: false, error: MEMORY_WRITE_ERROR };
    return {
      ok: true,
      output: { saved: true, category: 'notes', value: { text: added.text }, dropped: added.dropped },
    };
  }
  const resolved = await resolveRememberInput(input, geocode);
  if (!resolved.ok) return resolved;
  if (!saveFact(resolved.fact)) return { ok: false, error: MEMORY_WRITE_ERROR };
  return { ok: true, output: { saved: true, ...resolved.fact } };
}

export type ForgetResult = { ok: true; output: ForgetOutput } | { ok: false; error: string };

// A note can be missing (the model misremembered it), so forget now reports
// an error with its reason, like remember does.
export function runForget(input: ForgetInput): ForgetResult {
  if (input.category === 'notes') {
    const removed = removeNote(readMemory(), input.note);
    if (!removed.ok) return removed;
    if (!replaceMemory(removed.memory)) return { ok: false, error: MEMORY_WRITE_ERROR };
    return { ok: true, output: { removed: true, category: 'notes', note: removed.removed } };
  }
  if (!removeFact(input.category)) return { ok: false, error: MEMORY_WRITE_ERROR };
  return { ok: true, output: { removed: true, category: input.category } };
}

// Steps add up across the automatic round-trips of ONE assistant message.
// Twice the server's per-request stepCountIs(5): room for a full server loop
// plus the reply. Without a cap, a model that calls remember in every reply
// would make the browser re-send forever — each round-trip a paid request.
export const MAX_STEPS_PER_MESSAGE = 10;

// Only a step that ran a browser tool needs the round-trip. The SDK helper
// also says "complete" when the server stopped at stepCountIs(5) right after
// a server tool — re-sending that would quietly lift the server's step cap.
const BROWSER_TOOL_PARTS = new Set(['tool-remember', 'tool-forget']);

export function shouldAutoSend({ messages }: { messages: ChatUIMessage[] }): boolean {
  if (!lastAssistantMessageIsCompleteWithToolCalls({ messages })) return false;
  const last = messages[messages.length - 1];
  const lastStepStart = last.parts.findLastIndex((part) => part.type === 'step-start');
  const lastStep = last.parts.slice(lastStepStart + 1);
  if (!lastStep.some((part) => BROWSER_TOOL_PARTS.has(part.type))) return false;
  const steps = last.parts.filter((part) => part.type === 'step-start').length;
  return steps < MAX_STEPS_PER_MESSAGE;
}
