import { describe, expect, it } from 'vitest';
import type { UIMessage } from 'ai';
import { pruneOldToolResults } from './context';

function toolMessage(output: unknown): UIMessage {
  return {
    id: crypto.randomUUID(),
    role: 'assistant',
    parts: [{ type: 'tool-getWeather', toolCallId: 't1', state: 'output-available', input: {}, output }] as never,
  };
}

function textMessage(text: string): UIMessage {
  return { id: crypto.randomUUID(), role: 'user', parts: [{ type: 'text', text }] };
}

describe('pruneOldToolResults', () => {
  it('replaces tool output in messages older than keepRecent', () => {
    const messages = [
      toolMessage({ temperature: 20 }),
      toolMessage({ temperature: 21 }),
      toolMessage({ temperature: 22 }),
    ];

    const pruned = pruneOldToolResults(messages, 1);

    expect(pruned[0].parts[0]).toMatchObject({ output: { note: expect.any(String) } });
    expect(pruned[1].parts[0]).toMatchObject({ output: { note: expect.any(String) } });
  });

  it('leaves the last `keepRecent` messages untouched', () => {
    const messages = [
      toolMessage({ temperature: 20 }),
      toolMessage({ temperature: 21 }),
      toolMessage({ temperature: 22 }),
    ];

    const pruned = pruneOldToolResults(messages, 1);

    expect(pruned[2].parts[0]).toMatchObject({ output: { temperature: 22 } });
  });

  it('does not mutate the original messages array', () => {
    const messages = [toolMessage({ temperature: 20 }), toolMessage({ temperature: 21 })];
    const original = JSON.parse(JSON.stringify(messages));

    pruneOldToolResults(messages, 0);

    expect(messages).toEqual(original);
  });

  it('leaves text parts untouched — pruning targets tool outputs only', () => {
    const messages = [textMessage('Lisbon'), toolMessage({ temperature: 20 }), textMessage('thanks')];

    const pruned = pruneOldToolResults(messages, 0);

    expect(pruned[0]).toMatchObject({ parts: [{ type: 'text', text: 'Lisbon' }] });
  });

  it('returns messages unchanged when there are fewer than keepRecent', () => {
    const messages = [toolMessage({ temperature: 20 })];

    const pruned = pruneOldToolResults(messages, 4);

    expect(pruned).toEqual(messages);
  });
});
