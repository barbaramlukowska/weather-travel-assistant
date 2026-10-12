import type { Memory } from './memory';
import type { ChatUIMessage } from './tools';

// One source for the route (which decides) and the browser (which warns
// early and closes a full chat), so the two can never drift apart.
export const MAX_MESSAGES = 60;
// string.length of the raw JSON (UTF-16 code units), NOT bytes: the route
// measures `raw.length`, and the browser gets the same number from
// JSON.stringify before it sends anything.
export const MAX_BODY_CHARS = 64 * 1024;
export const MAX_INPUT_CHARS = 2_000;
// Room for one more turn: the question, plus the assistant message the
// browser re-sends automatically after remember/forget (3–5.5K measured).
// Without it a chat near the cap would hit 413 again and again, two paid
// requests per try.
export const TURN_RESERVE_CHARS = 8 * 1024;
export const WARN_RATIO = 0.75;
export const WARN_MESSAGES = 45;

export interface ChatRequestArgs {
  chatId: string;
  messages: ChatUIMessage[];
  memory: Memory;
  trigger?: 'submit-message' | 'regenerate-message';
  messageId?: string;
}

// The only place the request body is built. The transport sends exactly this
// object, so a length computed here is the length the route measures.
export function buildChatRequestBody({ chatId, messages, memory, trigger, messageId }: ChatRequestArgs) {
  return { memory, id: chatId, messages, trigger, messageId };
}

export function requestLength(args: ChatRequestArgs): number {
  return JSON.stringify(buildChatRequestBody(args)).length;
}

export type ChatCapacity =
  | { level: 'ok' }
  | { level: 'warn' | 'full'; reason: 'messages' | 'size' };

export function chatCapacity({
  messageCount,
  requestChars,
}: {
  messageCount: number;
  requestChars: number;
}): ChatCapacity {
  // +2: the next question and its answer. Costs at most one message of slack.
  if (messageCount + 2 > MAX_MESSAGES) return { level: 'full', reason: 'messages' };
  if (requestChars + TURN_RESERVE_CHARS > MAX_BODY_CHARS) return { level: 'full', reason: 'size' };
  if (messageCount >= WARN_MESSAGES) return { level: 'warn', reason: 'messages' };
  if (requestChars >= WARN_RATIO * (MAX_BODY_CHARS - TURN_RESERVE_CHARS)) {
    return { level: 'warn', reason: 'size' };
  }
  return { level: 'ok' };
}
