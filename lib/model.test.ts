import { afterEach, describe, expect, it } from 'vitest';
import { getJudgeModel } from './model';

// The provider SDKs need a key only when a request is actually sent, so
// constructing a model in a test is free and offline.
const ENV_KEYS = ['JUDGE_PROVIDER', 'JUDGE_MODEL'] as const;
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
    expect(getJudgeModel().modelId).toBe('gpt-5.6-luna');
  });

  it('honours JUDGE_MODEL for the same provider', () => {
    setEnv('JUDGE_PROVIDER', undefined);
    setEnv('JUDGE_MODEL', 'gpt-5.6-terra');
    expect(getJudgeModel().modelId).toBe('gpt-5.6-terra');
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
      expect(getJudgeModel().modelId).toBe('gpt-5.6-luna');
    } finally {
      if (before === undefined) delete process.env.LLM_PROVIDER;
      else process.env.LLM_PROVIDER = before;
    }
  });
});
