import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';

const provider = process.env.LLM_PROVIDER ?? 'openai';

export function getChatModel() {
  if (provider === 'google') {
    return google('gemini-2.5-flash');
  }
  return openai('gpt-4o-mini'); // default: OpenAI (also covers unknown values)
}

