import type { LanguageModelUsage } from 'ai';

type Price = { input: number; cachedInput: number; output: number };

// USD per 1M tokens, OpenAI standard tier, context ≤ 272K (checked 2026-10-27,
// https://developers.openai.com/api/docs/pricing). Neither the SDK nor the
// provider returns cost, so a price change means editing this table.
const PRICES: Record<string, Price> = {
  'gpt-5.6-luna': { input: 0.2, cachedInput: 0.02, output: 1.2 },
  'gpt-5.6-terra': { input: 2, cachedInput: 0.2, output: 12 },
};

// Float sums leave tails like 0.0008150400000001; 8 places keep a single token.
export const roundUsd = (usd: number) => Math.round(usd * 1e8) / 1e8;

// null, not 0, for an unknown model: a missing price must not look free.
// Reasoning tokens are already inside outputTokens and billed as output.
export function costUsd(modelId: string, usage: LanguageModelUsage): number | null {
  const price = PRICES[modelId];
  if (!price) return null;
  const cached = usage.inputTokenDetails.cacheReadTokens ?? 0;
  const fresh = (usage.inputTokens ?? 0) - cached;
  const output = usage.outputTokens ?? 0;
  return (fresh * price.input + cached * price.cachedInput + output * price.output) / 1_000_000;
}
