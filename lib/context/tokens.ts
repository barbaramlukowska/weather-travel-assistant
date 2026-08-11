import type { ModelMessage } from 'ai';

// Deliberately approximate. A real tokenizer (js-tiktoken) would be exact for
// OpenAI and wrong for Gemini, and this app picks its provider at runtime — so
// the precision would be fake. We need a threshold, not an invoice.
//
// Checked against gpt-4o-mini on a three-exchange history of real tool
// payloads: 568 estimated vs 557 actual input tokens, i.e. 4.08 chars per
// token. Measured as a difference between two histories so the constant
// system-prompt overhead cancels out.
const CHARS_PER_TOKEN = 4;

export function estimateTokens(messages: ModelMessage[]): number {
  if (messages.length === 0) return 0;
  return Math.ceil(JSON.stringify(messages).length / CHARS_PER_TOKEN);
}
