import { describe, it, expect } from 'vitest';
import type { LanguageModelUsage } from 'ai';
import { costUsd } from './pricing';

function usage(input: number, cached: number, output: number): LanguageModelUsage {
  return {
    inputTokens: input,
    inputTokenDetails: { noCacheTokens: input - cached, cacheReadTokens: cached, cacheWriteTokens: undefined },
    outputTokens: output,
    outputTokenDetails: { textTokens: undefined, reasoningTokens: undefined },
    totalTokens: input + output,
  };
}

describe('costUsd', () => {
  it('prices input and output per million tokens', () => {
    // 1M × $0.20 + 1M × $1.20
    expect(costUsd('gpt-5.6-luna', usage(1_000_000, 0, 1_000_000))).toBeCloseTo(1.4);
  });

  it('bills cached input at the cached rate', () => {
    // 0.5M fresh × $0.20 + 0.5M cached × $0.02
    expect(costUsd('gpt-5.6-luna', usage(1_000_000, 500_000, 0))).toBeCloseTo(0.11);
  });

  it('knows Terra is ten times Luna', () => {
    expect(costUsd('gpt-5.6-terra', usage(1_000_000, 0, 1_000_000))).toBeCloseTo(14);
  });

  it('returns null for a model without a price, not a wrong zero', () => {
    expect(costUsd('gemini-2.5-flash', usage(1000, 0, 1000))).toBeNull();
  });

  it('treats missing token counts as zero', () => {
    const empty: LanguageModelUsage = {
      ...usage(0, 0, 0),
      inputTokens: undefined,
      outputTokens: undefined,
    };
    expect(costUsd('gpt-5.6-luna', empty)).toBe(0);
  });
});
