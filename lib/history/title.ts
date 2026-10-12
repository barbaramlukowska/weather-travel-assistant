import type { ChatUIMessage } from '../tools';

export const MAX_TITLE_CHARS = 40;
export const FALLBACK_TITLE = 'New chat';

// From the user's own words: free, instant and predictable, unlike a title
// written by a model (a paid call and a new endpoint).
export function titleFrom(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  // Code points, not UTF-16 units: half an emoji is a broken character.
  const chars = Array.from(oneLine);
  if (chars.length <= MAX_TITLE_CHARS) return oneLine;
  return `${chars.slice(0, MAX_TITLE_CHARS).join('').trimEnd()}…`;
}

export function chatTitle(messages: readonly ChatUIMessage[]): string {
  const first = messages.find((message) => message.role === 'user');
  const text = first?.parts.map((part) => (part.type === 'text' ? part.text : '')).join(' ') ?? '';
  return titleFrom(text) || FALLBACK_TITLE;
}
