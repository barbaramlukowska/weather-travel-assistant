import { APICallError } from 'ai';

export type ChatErrorDescription = { kind: 'chat_full' } | { kind: 'message'; text: string };

// What useChat reports, turned into something to show. A 413 means the chat
// grew too long (by size or by message count) and becomes "This chat is
// full" — recognised by status code, not by reading the text.
export function describeChatError(error: Error): ChatErrorDescription {
  if (APICallError.isInstance(error) && error.statusCode === 413) return { kind: 'chat_full' };
  // Other HTTP errors carry the raw response body as the message: the
  // route's {"error":"…"}.
  try {
    const body: unknown = JSON.parse(error.message);
    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
      return { kind: 'message', text: body.error };
    }
  } catch {
    // Plain text: an error from the stream, or the daily-quota message.
  }
  return { kind: 'message', text: error.message };
}
