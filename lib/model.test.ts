import { afterEach, describe, expect, it } from 'vitest';
import { getChatModel, getJudgeModel } from './model';

// The provider SDKs need a key only when a request is actually sent, so
// constructing a model in a test is free and offline.
const ENV_KEYS = ['JUDGE_PROVIDER', 'JUDGE_MODEL', 'LLM_PROVIDER', 'CHAT_MODEL'] as const;
const saved = new Map<string, string | undefined>();

afterEach(() => {
  for (const key of ENV_KEYS) {
    const previous = saved.get(key);
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
    saved.delete(key);
  }
});

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined) {
  if (!saved.has(key)) saved.set(key, process.env[key]);
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

describe('getJudgeModel', () => {
  it('defaults to the OpenAI judge model', () => {
    setEnv('JUDGE_PROVIDER', undefined);
    setEnv('JUDGE_MODEL', undefined);
    expect(getJudgeModel().modelId).toBe('gpt-5.6-terra');
  });

  it('honours JUDGE_MODEL for the same provider', () => {
    setEnv('JUDGE_PROVIDER', undefined);
    setEnv('JUDGE_MODEL', 'gpt-5.4-mini');
    expect(getJudgeModel().modelId).toBe('gpt-5.4-mini');
  });

  it('switches provider without a code change', () => {
    setEnv('JUDGE_PROVIDER', 'google');
    setEnv('JUDGE_MODEL', undefined);
    expect(getJudgeModel().modelId).toBe('gemini-3.6-flash');
  });

  // The judge is deliberately independent of LLM_PROVIDER: the agent and the
  // measuring instrument are separate choices (spec, "Dlaczego osobny model").
  it('ignores LLM_PROVIDER', () => {
    setEnv('JUDGE_PROVIDER', undefined);
    setEnv('JUDGE_MODEL', undefined);
    const before = process.env.LLM_PROVIDER;
    process.env.LLM_PROVIDER = 'google';
    try {
      expect(getJudgeModel().modelId).toBe('gpt-5.6-terra');
    } finally {
      if (before === undefined) delete process.env.LLM_PROVIDER;
      else process.env.LLM_PROVIDER = before;
    }
  });
});

describe('getChatModel', () => {
  it('defaults to gpt-5.6-luna', () => {
    setEnv('LLM_PROVIDER', undefined);
    setEnv('CHAT_MODEL', undefined);
    expect(getChatModel().modelId).toBe('gpt-5.6-luna');
  });

  // A model must not grade itself: the default judge (getJudgeModel) has to
  // stay a different model than the default chat model.
  it('is never the default judge', () => {
    for (const key of ENV_KEYS) setEnv(key, undefined);
    expect(getChatModel().modelId).not.toBe(getJudgeModel().modelId);
  });

  // Lets an eval run measure a candidate model without a code change.
  it('honours CHAT_MODEL for the same provider', () => {
    setEnv('LLM_PROVIDER', undefined);
    setEnv('CHAT_MODEL', 'gpt-5.4-nano');
    expect(getChatModel().modelId).toBe('gpt-5.4-nano');
  });

  it('keeps the Gemini default when only the provider changes', () => {
    setEnv('LLM_PROVIDER', 'google');
    setEnv('CHAT_MODEL', undefined);
    expect(getChatModel().modelId).toBe('gemini-2.5-flash');
  });
});
