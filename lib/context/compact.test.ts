import { describe, expect, it } from 'vitest';
import type { ModelMessage, ToolResultPart } from 'ai';
import { compactContext } from './compact';
import { PRUNED_OUTPUT } from './digest';
import { SUMMARY_PREFIX } from './summarize';

const WEATHER = {
  found: true,
  location: 'Kraków, Poland',
  temperature: 18.3,
  feelsLike: 16.1,
  precipitation: 0,
  windSpeed: 12.4,
  units: { temperature: '°C', windSpeed: 'km/h' },
};

function userMessage(text: string): ModelMessage {
  return { role: 'user', content: text };
}

function assistantText(text: string): ModelMessage {
  return { role: 'assistant', content: text };
}

function assistantToolCall(toolName: string, toolCallId: string): ModelMessage {
  return {
    role: 'assistant',
    content: [{ type: 'tool-call', toolCallId, toolName, input: { city: 'Kraków' } }],
  };
}

function toolResult(toolName: string, toolCallId: string, value: unknown): ModelMessage {
  return {
    role: 'tool',
    content: [{ type: 'tool-result', toolCallId, toolName, output: { type: 'json', value: value as never } }],
  };
}

// One full exchange: question, tool call, tool result, answer.
function exchange(n: number, value: unknown = WEATHER): ModelMessage[] {
  return [
    userMessage(`question ${n}`),
    assistantToolCall('getWeather', `call-${n}`),
    toolResult('getWeather', `call-${n}`, value),
    assistantText(`answer ${n}`),
  ];
}

function toolResultOutputs(messages: ModelMessage[]) {
  return messages
    .filter((m) => m.role === 'tool')
    .flatMap((m) => (m.content as ToolResultPart[]).map((p) => p.output));
}

function collectToolCallIds(messages: ModelMessage[]) {
  const calls: string[] = [];
  const results: string[] = [];

  for (const message of messages) {
    if (typeof message.content === 'string') continue;
    for (const part of message.content) {
      if (part.type === 'tool-call') calls.push(part.toolCallId);
      if (part.type === 'tool-result') results.push(part.toolCallId);
    }
  }

  return { calls, results };
}

describe('compactContext — level 1', () => {
  it('leaves the last two tool results in full', async () => {
    const messages = [...exchange(1), ...exchange(2), ...exchange(3)];

    const { messages: compacted } = await compactContext(messages);
    const outputs = toolResultOutputs(compacted);

    expect(outputs[1]).toEqual({ type: 'json', value: WEATHER });
    expect(outputs[2]).toEqual({ type: 'json', value: WEATHER });
  });

  it('digests tool results older than the last two', async () => {
    const messages = [...exchange(1), ...exchange(2), ...exchange(3)];

    const { messages: compacted } = await compactContext(messages);
    const [oldest] = toolResultOutputs(compacted);

    expect(oldest.type).toBe('text');
    expect(oldest.type === 'text' && oldest.value).toContain('Kraków, Poland');
  });

  it('counts tool results across the whole history, not per message', async () => {
    const messages = [...exchange(1), ...exchange(2), ...exchange(3), ...exchange(4)];

    const { stats } = await compactContext(messages);

    expect(stats.toolResultsDigested).toBe(2);
  });

  it('honours keepRecentToolResults', async () => {
    const messages = [...exchange(1), ...exchange(2), ...exchange(3)];

    const { messages: compacted } = await compactContext(messages, { keepRecentToolResults: 0 });

    for (const output of toolResultOutputs(compacted)) {
      expect(output.type).toBe('text');
    }
  });

  it('does not mutate the input', async () => {
    const messages = [...exchange(1), ...exchange(2), ...exchange(3)];
    const before = JSON.parse(JSON.stringify(messages));

    await compactContext(messages);

    expect(messages).toEqual(before);
  });

  it('preserves message order and roles', async () => {
    const messages = [...exchange(1), ...exchange(2)];

    const { messages: compacted } = await compactContext(messages);

    expect(compacted.map((m) => m.role)).toEqual(messages.map((m) => m.role));
  });

  it('keeps every tool call paired with its result', async () => {
    const messages = [...exchange(1), ...exchange(2), ...exchange(3)];

    const { messages: compacted } = await compactContext(messages);
    const { calls, results } = collectToolCallIds(compacted);

    expect([...results].sort()).toEqual([...calls].sort());
  });

  it('falls back to the placeholder for an unparseable old result', async () => {
    const messages = [...exchange(1, { nonsense: true }), ...exchange(2), ...exchange(3)];

    const { messages: compacted } = await compactContext(messages);
    const [oldest] = toolResultOutputs(compacted);

    expect(oldest).toEqual({ type: 'json', value: PRUNED_OUTPUT });
  });

  it('reports sizes before and after', async () => {
    const messages = [...exchange(1), ...exchange(2), ...exchange(3)];

    const { stats } = await compactContext(messages);

    expect(stats.tokensBefore).toBeGreaterThan(stats.tokensAfterDigest);
    expect(stats.tokensAfter).toBe(stats.tokensAfterDigest);
    expect(stats.summarized).toBe(false);
  });

  it('returns short histories untouched', async () => {
    const messages = [...exchange(1)];

    const { messages: compacted, stats } = await compactContext(messages);

    expect(compacted).toEqual(messages);
    expect(stats.toolResultsDigested).toBe(0);
  });
});

function longHistory(): ModelMessage[] {
  // Six exchanges with full forecast-sized payloads: comfortably over any
  // budget we set in these tests.
  return Array.from({ length: 6 }, (_, i) => exchange(i + 1)).flat();
}

describe('compactContext — level 2', () => {
  it('does not summarise when the history fits the budget', async () => {
    let calls = 0;
    const summarize = async () => {
      calls++;
      return { text: 'unused', source: 'full' as const };
    };

    const { stats } = await compactContext([...exchange(1), ...exchange(2)], {
      tokenBudget: 100_000,
      summarize,
    });

    expect(calls).toBe(0);
    expect(stats.summarized).toBe(false);
  });

  it('summarises once and injects the result as framed user data', async () => {
    let calls = 0;
    const summarize = async () => {
      calls++;
      return { text: 'Talked about Kraków air quality and Lisbon weather.', source: 'full' as const };
    };

    const { messages: compacted, stats } = await compactContext(longHistory(), {
      tokenBudget: 10,
      summarize,
    });

    expect(calls).toBe(1);
    expect(stats.summarized).toBe(true);

    const first = compacted[0];
    expect(first.role).toBe('user');
    expect(first.content).toContain(SUMMARY_PREFIX);
    expect(first.content).toContain('Kraków air quality');
  });

  it('shrinks the history', async () => {
    const history = longHistory();

    const { messages: compacted, stats } = await compactContext(history, {
      tokenBudget: 10,
      summarize: async () => ({ text: 'short recap', source: 'full' as const }),
    });

    expect(compacted.length).toBeLessThan(history.length);
    expect(stats.tokensAfter).toBeLessThan(stats.tokensAfterDigest);
  });

  it('cuts only at a user boundary, so tool calls stay paired', async () => {
    const { messages: compacted } = await compactContext(longHistory(), {
      tokenBudget: 10,
      summarize: async () => ({ text: 'short recap', source: 'full' as const }),
    });

    const { calls, results } = collectToolCallIds(compacted);

    expect([...results].sort()).toEqual([...calls].sort());
  });

  it('keeps the recent messages after the summary', async () => {
    const { messages: compacted } = await compactContext(longHistory(), {
      tokenBudget: 10,
      keepRecentMessages: 4,
      summarize: async () => ({ text: 'short recap', source: 'full' as const }),
    });

    expect(compacted.at(-1)).toEqual({ role: 'assistant', content: 'answer 6' });
  });

  // Without this in the stats, a cache that never hits looks exactly like one
  // that always does — which is how the growing-slice bug stayed invisible.
  it('reports where the summary came from', async () => {
    const { stats } = await compactContext(longHistory(), {
      tokenBudget: 10,
      summarize: async () => ({ text: 'short recap', source: 'incremental' as const }),
    });

    expect(stats.summarySource).toBe('incremental');
  });

  it('reports no summary source when level 2 never runs', async () => {
    const { stats } = await compactContext([...exchange(1), ...exchange(2)], {
      tokenBudget: 100_000,
    });

    expect(stats.summarySource).toBeNull();
  });

  it('degrades to level 1 when the summariser throws', async () => {
    const { messages: compacted, stats } = await compactContext(longHistory(), {
      tokenBudget: 10,
      summarize: async () => {
        throw new Error('provider exploded');
      },
    });

    expect(stats.summarized).toBe(false);
    expect(compacted).toHaveLength(longHistory().length);
  });

  it('degrades to level 1 when the summariser returns null', async () => {
    const { stats } = await compactContext(longHistory(), {
      tokenBudget: 10,
      summarize: async () => null,
    });

    expect(stats.summarized).toBe(false);
  });

  it('skips level 2 when there is nothing worth summarising', async () => {
    let calls = 0;
    const summarize = async () => {
      calls++;
      return { text: 'unused', source: 'full' as const };
    };

    // A single exchange: no user boundary far enough back to cut at.
    const { stats } = await compactContext(exchange(1), { tokenBudget: 10, summarize });

    expect(calls).toBe(0);
    expect(stats.summarized).toBe(false);
  });
});
