import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readMemory } from '@/lib/memory';
import { MAX_STEPS_PER_MESSAGE, runForget, runRemember, shouldAutoSend } from './client-tools';
import type { ChatUIMessage } from './types';

type Part = ChatUIMessage['parts'][number];

const stepStart = { type: 'step-start' } as Part;

function rememberPart(id: string, state: 'input-available' | 'output-available'): Part {
  const input = { category: 'travelParty', value: 'travels with a 3-year-old' };
  return (
    state === 'output-available'
      ? { type: 'tool-remember', toolCallId: id, state, input, output: { saved: true, ...input } }
      : { type: 'tool-remember', toolCallId: id, state, input }
  ) as Part;
}

function conversation(assistantParts: Part[]): ChatUIMessage[] {
  return [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'I travel with my kid' }] },
    { id: 'a1', role: 'assistant', parts: assistantParts },
  ];
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runRemember / runForget', () => {
  it('saves the fact and returns the tool output', () => {
    expect(runRemember({ category: 'homeCity', value: 'Kraków' })).toEqual({
      saved: true,
      category: 'homeCity',
      value: 'Kraków',
    });
    expect(readMemory()).toEqual({ homeCity: 'Kraków' });
  });

  it('removes the fact and returns the tool output', () => {
    runRemember({ category: 'homeCity', value: 'Kraków' });
    expect(runForget({ category: 'homeCity' })).toEqual({ removed: true, category: 'homeCity' });
    expect(readMemory()).toEqual({});
  });

  // The model must hear about a failed write, or it tells the user
  // "remembered" about something that is gone after a reload.
  it('returns null when the browser refuses to store it', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(runRemember({ category: 'homeCity', value: 'Kraków' })).toBeNull();
  });
});

describe('shouldAutoSend', () => {
  it('re-sends once the browser has answered the memory call', () => {
    expect(shouldAutoSend({ messages: conversation([stepStart, rememberPart('c1', 'output-available')]) })).toBe(true);
  });

  it('waits while the call has no output yet', () => {
    expect(shouldAutoSend({ messages: conversation([stepStart, rememberPart('c1', 'input-available')]) })).toBe(false);
  });

  it('stops after the model has replied in text', () => {
    const parts = [
      stepStart,
      rememberPart('c1', 'output-available'),
      stepStart,
      { type: 'text', text: 'Got it!' } as Part,
    ];
    expect(shouldAutoSend({ messages: conversation(parts) })).toBe(false);
  });

  // A server tool that ran into stepCountIs(5) also leaves a "complete" last
  // step. Re-sending it would quietly double the server's step cap.
  it('does not re-send after a server-executed tool', () => {
    const weather = {
      type: 'tool-getWeather',
      toolCallId: 'w1',
      state: 'output-available',
      input: { city: 'Rome' },
      output: { found: false, city: 'Rome' },
    } as Part;
    expect(shouldAutoSend({ messages: conversation([stepStart, weather]) })).toBe(false);
  });

  // Review Focus 3: a model that calls remember in every reply.
  it('stops re-sending once the message hits the step cap', () => {
    const parts = Array.from({ length: MAX_STEPS_PER_MESSAGE }, (_, i) => [
      stepStart,
      rememberPart(`c${i}`, 'output-available'),
    ]).flat();
    expect(shouldAutoSend({ messages: conversation(parts) })).toBe(false);
  });
});
