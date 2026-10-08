import { lastAssistantMessageIsCompleteWithToolCalls } from 'ai';
import { removeFact, saveFact } from '@/lib/memory';
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

// The browser-side execute of the memory tools. Pure apart from the store, so
// it is tested here instead of through a full useChat round-trip.
export function runRemember({ category, value }: RememberInput): RememberOutput | null {
  return saveFact(category, value) ? { saved: true, category, value } : null;
}

export function runForget({ category }: ForgetInput): ForgetOutput | null {
  return removeFact(category) ? { removed: true, category } : null;
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
