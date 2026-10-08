import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';

// Env is read per call, like getJudgeModel: CHAT_MODEL lets an eval run
// measure a candidate model (`CHAT_MODEL=gpt-5.4-nano pnpm eval`) with no
// code change, and tests can vary it.
export function getChatModel() {
  const provider = process.env.LLM_PROVIDER ?? 'openai';
  if (provider === 'google') {
    return google(process.env.CHAT_MODEL ?? 'gemini-2.5-flash');
  }
  // default: OpenAI (also covers unknown values). Chosen by eval quality
  // (2026-10-08: 25/25 twice, against 22–23/25 for gpt-4o-mini and
  // gpt-5.4-nano) — memory safety no longer depends on the model.
  return openai(process.env.CHAT_MODEL ?? 'gpt-5.6-luna');
}


// The judge is a measuring instrument, not the product: it gets its own model
// choice because its economics are the opposite of the agent's — tiny prompt,
// run by hand, so it can afford a better model than the agent can.
// It must also differ from the chat model: a model grading its own answers
// is a biased instrument. Terra is a stronger model than the chat model, and
// a judge prompt is so small that its higher per-token price costs cents per
// eval run (11/11 on the judge fixtures, 2026-10-08).
// Env is read per call (not at module load) so tests can vary it.
export function getJudgeModel() {
  const judgeProvider = process.env.JUDGE_PROVIDER ?? 'openai';
  if (judgeProvider === 'google') {
    return google(process.env.JUDGE_MODEL ?? 'gemini-3.6-flash');
  }
  return openai(process.env.JUDGE_MODEL ?? 'gpt-5.6-terra');
}
