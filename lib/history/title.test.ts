import { describe, expect, it } from 'vitest';
import type { ChatUIMessage } from '../tools';
import { FALLBACK_TITLE, chatTitle, titleFrom } from './title';

describe('titleFrom', () => {
  it('collapses all whitespace into single spaces', () => {
    expect(titleFrom('  Weather\n in   Kraków\t ')).toBe('Weather in Kraków');
  });

  it('keeps a title of 40 characters whole, without an ellipsis', () => {
    expect(titleFrom('a'.repeat(40))).toBe('a'.repeat(40));
  });

  it('cuts a longer title to 40 characters and adds an ellipsis', () => {
    expect(titleFrom('a'.repeat(41))).toBe(`${'a'.repeat(40)}…`);
  });

  it('does not leave a space before the ellipsis', () => {
    expect(titleFrom(`${'a'.repeat(39)} and more`)).toBe(`${'a'.repeat(39)}…`);
  });

  // 🌧 is two UTF-16 units. slice(0, 40) would keep only
  // the first one and show a broken character in the list.
  it('never cuts an emoji in half', () => {
    const title = titleFrom(`${'a'.repeat(39)}🌧 rain all week`);
    expect(title).toBe(`${'a'.repeat(39)}🌧…`);
    expect(title).not.toMatch(/[\uD800-\uDFFF](?![\uDC00-\uDFFF])/u);
  });
});

describe('chatTitle', () => {
  const text = (id: string, role: 'user' | 'assistant', value: string): ChatUIMessage => ({
    id,
    role,
    parts: [{ type: 'text', text: value }],
  });

  it('comes from the first user message', () => {
    expect(chatTitle([text('u1', 'user', 'Trip to Rome?'), text('a1', 'assistant', 'Sure')])).toBe(
      'Trip to Rome?',
    );
  });

  it('falls back to "New chat" when there is no text to use', () => {
    expect(chatTitle([])).toBe(FALLBACK_TITLE);
    expect(chatTitle([text('u1', 'user', '   ')])).toBe(FALLBACK_TITLE);
  });
});
