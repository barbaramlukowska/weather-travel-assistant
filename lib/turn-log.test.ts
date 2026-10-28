import { describe, it, expect } from 'vitest';
import type { LanguageModelUsage } from 'ai';
import { summarizeTurn, type TurnStep } from './turn-log';

function step(opts: {
  model?: string;
  input?: number;
  cached?: number;
  output?: number;
  reasoning?: number;
  ttft?: number;
  ms?: number;
  tools?: { id: string; name: string; ms: number }[];
}): TurnStep {
  const { input = 1000, cached = 0, output = 100, reasoning = 0, tools = [] } = opts;
  const usage: LanguageModelUsage = {
    inputTokens: input,
    inputTokenDetails: { noCacheTokens: input - cached, cacheReadTokens: cached, cacheWriteTokens: undefined },
    outputTokens: output,
    outputTokenDetails: { textTokens: output - reasoning, reasoningTokens: reasoning },
    totalTokens: input + output,
  };
  return {
    model: { provider: 'openai.responses', modelId: opts.model ?? 'gpt-5.6-luna' },
    usage,
    toolCalls: tools.map((t) => ({ toolCallId: t.id, toolName: t.name })),
    performance: {
      timeToFirstOutputMs: opts.ttft,
      stepTimeMs: opts.ms ?? 500,
      toolExecutionMs: Object.fromEntries(tools.map((t) => [t.id, t.ms])),
    },
  } as unknown as TurnStep;
}

describe('summarizeTurn', () => {
  it('sums tokens, time and cost across the steps of the agent loop', () => {
    const log = summarizeTurn(
      [
        step({ input: 3000, cached: 2000, output: 200, reasoning: 150, ttft: 800, ms: 1500,
          tools: [{ id: 'c1', name: 'getForecast', ms: 400 }] }),
        step({ input: 3500, cached: 3000, output: 300, reasoning: 50, ttft: 600, ms: 2000 }),
      ],
      'done',
    );

    expect(log).toMatchObject({
      status: 'done',
      model: 'gpt-5.6-luna',
      steps: 2,
      ttftMs: 800, // the first step is what the user waits for
      ms: 3500,
      tokens: { input: 6500, cached: 5000, output: 500, reasoning: 200 },
      tools: [{ name: 'getForecast', ms: 400 }],
    });
    // (1500 fresh × $0.20 + 5000 cached × $0.02 + 500 out × $1.20) / 1M
    expect(log.costUsd).toBeCloseTo(0.0003 + 0.0001 + 0.0006, 6);
  });

  // The numbers from a real dev log line.
  it('rounds times to whole ms and cost to 8 places', () => {
    const log = summarizeTurn(
      [step({ ttft: 2262.8314390000887, ms: 7845.137568000238,
        tools: [{ id: 'c1', name: 'getForecast', ms: 357.91374799981713 }] })],
      'done',
    );
    expect(log).toMatchObject({ ttftMs: 2263, ms: 7845, tools: [{ name: 'getForecast', ms: 358 }] });
    expect(String(log.costUsd).length).toBeLessThanOrEqual(10);
  });

  it('has no cost when a step runs on a model without a price', () => {
    const log = summarizeTurn([step({}), step({ model: 'gemini-2.5-flash' })], 'done');
    expect(log.costUsd).toBeNull();
  });

  it('handles a turn aborted before the first step finished', () => {
    expect(summarizeTurn([], 'aborted')).toEqual({
      status: 'aborted',
      model: null,
      steps: 0,
      ttftMs: null,
      ms: 0,
      tokens: { input: 0, cached: 0, output: 0, reasoning: 0 },
      costUsd: 0,
      tools: [],
    });
  });
});
