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
  // default: OpenAI (also covers unknown values)
  return openai(process.env.CHAT_MODEL ?? 'gpt-4o-mini');
}


// The judge is a measuring instrument, not the product: it gets its own model
// choice because its economics are the opposite of the agent's — tiny prompt,
// run by hand, so it can afford a better model than the agent can.
// Env is read per call (not at module load) so tests can vary it.
export function getJudgeModel() {
  const judgeProvider = process.env.JUDGE_PROVIDER ?? 'openai';
  if (judgeProvider === 'google') {
    return google(process.env.JUDGE_MODEL ?? 'gemini-3.6-flash');
  }
  return openai(process.env.JUDGE_MODEL ?? 'gpt-5.6-luna');
}
