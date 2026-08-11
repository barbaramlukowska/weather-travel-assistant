import { describe, expect, it, vi } from 'vitest';
import type { ModelMessage } from 'ai';
import {
  MAX_SUMMARY_CHARS,
  type TextGenerator,
  createCachedSummarizer,
  summarizeMessages,
  toTranscript,
} from './summarize';

describe('toTranscript', () => {
  it('flattens string content with its role', () => {
    const messages: ModelMessage[] = [
      { role: 'user', content: 'What about Lisbon?' },
      { role: 'assistant', content: 'It is 22°C there.' },
    ];

    expect(toTranscript(messages)).toBe('user: What about Lisbon?\nassistant: It is 22°C there.');
  });

  it('names tool calls and keeps text tool results', () => {
    const messages: ModelMessage[] = [
      {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'getWeather', input: {} }],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'getWeather',
            output: { type: 'text', value: 'getWeather Kraków: 18°C' },
          },
        ],
      },
    ];

    const transcript = toTranscript(messages);

    expect(transcript).toContain('[called getWeather]');
    expect(transcript).toContain('getWeather Kraków: 18°C');
  });

  it('survives a tool result with no value field', () => {
    const messages: ModelMessage[] = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'getWeather',
            output: { type: 'execution-denied' },
          },
        ],
      },
    ];

    expect(() => toTranscript(messages)).not.toThrow();
    expect(toTranscript(messages)).toContain('execution-denied');
  });
});

describe('summarizeMessages', () => {
  const history: ModelMessage[] = [{ role: 'user', content: 'What is the weather in Kraków?' }];

  it('sends the transcript to the model as framed data', async () => {
    const generate = vi.fn<TextGenerator>(async () => 'recap');

    await summarizeMessages(history, undefined, generate);

    const request = generate.mock.calls[0]![0];
    expect(request.prompt).toContain('<conversation>');
    expect(request.prompt).toContain('user: What is the weather in Kraków?');
  });

  it('caps the recap at MAX_SUMMARY_CHARS', async () => {
    const generate = async () => 'x'.repeat(MAX_SUMMARY_CHARS + 500);

    const summary = await summarizeMessages(history, undefined, generate);

    expect(summary).toHaveLength(MAX_SUMMARY_CHARS);
  });

  it('returns null for a blank recap', async () => {
    const generate = async () => '   \n  ';

    expect(await summarizeMessages(history, undefined, generate)).toBeNull();
  });

  it('returns null instead of throwing when the model call fails', async () => {
    const generate = async () => {
      throw new Error('provider exploded');
    };
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await summarizeMessages(history, undefined, generate)).toBeNull();

    consoleError.mockRestore();
  });

  it('carries a previous recap into the prompt as data, not instructions', async () => {
    const generate = vi.fn<TextGenerator>(async () => 'merged recap');

    await summarizeMessages(history, 'Earlier: the user asked about Lisbon.', generate);

    const request = generate.mock.calls[0]![0];
    expect(request.prompt).toContain('<previous_recap>');
    expect(request.prompt).toContain('the user asked about Lisbon');
  });

  it('leaves the previous recap out of the prompt when there is none', async () => {
    const generate = vi.fn<TextGenerator>(async () => 'recap');

    await summarizeMessages(history, undefined, generate);

    expect(generate.mock.calls[0]![0].prompt).not.toContain('<previous_recap>');
  });
});

function turn(text: string): ModelMessage {
  return { role: 'user', content: text };
}

describe('createCachedSummarizer', () => {
  it('returns the cached recap without calling the summariser again', async () => {
    let calls = 0;
    const cached = createCachedSummarizer(async () => {
      calls++;
      return 'recap';
    });
    const history = [turn('a'), turn('b')];

    await cached(history);

    expect(await cached(history)).toEqual({ text: 'recap', source: 'cache' });
    expect(calls).toBe(1);
  });

  // The regression that matters: a real conversation never asks for the same
  // slice twice — it asks for a longer one. Without incremental summarisation
  // every turn re-summarises a prefix that keeps growing.
  it('summarises only the new messages when the conversation grows', async () => {
    const seen: { count: number; previous?: string }[] = [];
    const cached = createCachedSummarizer(async (messages, previous) => {
      seen.push({ count: messages.length, previous });
      return `recap ${seen.length}`;
    });

    const first = [turn('a'), turn('b'), turn('c')];
    await cached(first);
    const second = await cached([...first, turn('d'), turn('e')]);

    expect(seen).toEqual([
      { count: 3, previous: undefined },
      { count: 2, previous: 'recap 1' },
    ]);
    expect(second).toEqual({ text: 'recap 2', source: 'incremental' });
  });

  it('keeps the summariser input from growing across many turns', async () => {
    const sizes: number[] = [];
    const cached = createCachedSummarizer(async (messages) => {
      sizes.push(messages.length);
      return 'recap';
    });

    const history: ModelMessage[] = [turn('a'), turn('b')];
    await cached(history);
    for (let i = 0; i < 5; i++) {
      history.push(turn(`extra ${i}`));
      await cached([...history]);
    }

    expect(sizes).toEqual([2, 1, 1, 1, 1, 1]);
  });

  // Each incremental step re-compresses an already-compressed recap, so facts
  // drift. Recomputing from the full slice periodically resets that drift.
  it('recomputes from scratch once the incremental chain gets too long', async () => {
    const seen: number[] = [];
    const cached = createCachedSummarizer(
      async (messages) => {
        seen.push(messages.length);
        return 'recap';
      },
      { maxIncrementalSteps: 2 },
    );

    const history: ModelMessage[] = [turn('a')];
    const sources: string[] = [];
    for (let i = 0; i < 4; i++) {
      history.push(turn(`extra ${i}`));
      const result = await cached([...history]);
      sources.push(result!.source);
    }

    expect(sources).toEqual(['full', 'incremental', 'incremental', 'full']);
    expect(seen).toEqual([2, 1, 1, 5]);
  });

  it('recomputes from scratch when the history is not an extension of a known prefix', async () => {
    const seen: number[] = [];
    const cached = createCachedSummarizer(async (messages) => {
      seen.push(messages.length);
      return 'recap';
    });

    await cached([turn('a'), turn('b')]);
    const result = await cached([turn('x'), turn('y'), turn('z')]);

    expect(seen).toEqual([2, 3]);
    expect(result).toEqual({ text: 'recap', source: 'full' });
  });

  it('does not cache failures', async () => {
    let calls = 0;
    const cached = createCachedSummarizer(async () => {
      calls++;
      return null;
    });
    const history = [turn('a')];

    expect(await cached(history)).toBeNull();
    await cached(history);

    expect(calls).toBe(2);
  });

  it('evicts the oldest entry past the limit', async () => {
    const seen: number[] = [];
    const cached = createCachedSummarizer(
      async (messages) => {
        seen.push(messages.length);
        return 'recap';
      },
      { limit: 2 },
    );

    await cached([turn('a')]);
    await cached([turn('b'), turn('b')]);
    await cached([turn('c'), turn('c'), turn('c')]);
    await cached([turn('a')]); // evicted, so this is a miss and a full recompute

    expect(seen).toEqual([1, 2, 3, 1]);
  });
});
