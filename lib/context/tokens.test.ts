import { describe, expect, it } from 'vitest';
import type { ModelMessage } from 'ai';
import { estimateTokens } from './tokens';

function userMessage(text: string): ModelMessage {
  return { role: 'user', content: text };
}

describe('estimateTokens', () => {
  it('returns 0 for an empty history', () => {
    expect(estimateTokens([])).toBe(0);
  });

  it('grows with the size of the history', () => {
    const short = [userMessage('hi')];
    const long = [userMessage('hi'), userMessage('x'.repeat(500))];

    expect(estimateTokens(long)).toBeGreaterThan(estimateTokens(short));
  });

  it('lands in a sane order of magnitude', () => {
    // ~400 characters of content; at roughly 4 characters per token that is
    // around 100 tokens. Wide bounds on purpose — this is an estimate.
    const messages = [userMessage('x'.repeat(400))];

    const estimate = estimateTokens(messages);

    expect(estimate).toBeGreaterThan(50);
    expect(estimate).toBeLessThan(250);
  });
});
