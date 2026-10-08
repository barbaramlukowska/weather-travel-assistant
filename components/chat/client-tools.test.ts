import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Geocode } from '@/lib/geocode';
import { MEMORY_STORAGE_KEY, readMemory } from '@/lib/memory';
import {
  MAX_STEPS_PER_MESSAGE,
  MEMORY_WRITE_ERROR,
  runForget,
  runRemember,
  shouldAutoSend,
} from './client-tools';
import type { ChatUIMessage } from './types';

type Part = ChatUIMessage['parts'][number];

const stepStart = { type: 'step-start' } as Part;

function rememberPart(id: string, state: 'input-available' | 'output-available'): Part {
  const input = { category: 'interests', value: ['museums'] };
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
  vi.unstubAllGlobals();
});

const geocodeKrakow: Geocode = async () => ({
  found: true,
  latitude: 50.06,
  longitude: 19.94,
  name: 'Kraków',
  country: 'Poland',
});

describe('runRemember / runForget', () => {
  it('saves the geocoder’s city and returns the tool output', async () => {
    await expect(
      runRemember({ category: 'homeCity', value: { city: 'krakow' } }, geocodeKrakow),
    ).resolves.toEqual({
      ok: true,
      output: { saved: true, category: 'homeCity', value: { name: 'Kraków', country: 'Poland' } },
    });
    expect(readMemory()).toEqual({ homeCity: { name: 'Kraków', country: 'Poland' } });
  });

  it('saves tags as they are, without the geocoder', async () => {
    const geocode = vi.fn();
    await runRemember({ category: 'avoid', value: ['crowds', 'heat'] }, geocode);
    expect(readMemory()).toEqual({ avoid: ['crowds', 'heat'] });
    expect(geocode).not.toHaveBeenCalled();
  });

  // The model must hear the truth, or it tells the user "remembered".
  it('saves nothing and reports it when the city is not found', async () => {
    const result = await runRemember(
      { category: 'homeCity', value: { city: 'Atlantis' } },
      async () => ({ found: false }),
    );
    expect(result).toEqual({ ok: false, error: 'City not found: Atlantis' });
    expect(readMemory()).toEqual({});
  });

  it('reports a storage error when the browser refuses to store it', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await expect(runRemember({ category: 'interests', value: ['food'] })).resolves.toEqual({
      ok: false,
      error: MEMORY_WRITE_ERROR,
    });
  });

  // Review Focus 2: onToolCall is awaited by useChat's stream reader, so a
  // hung geocoder would freeze the chat on "Remembering…".
  it('gives the real geocoder a timeout', async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            results: [{ latitude: 50.06, longitude: 19.94, name: 'Kraków', country: 'Poland' }],
          }),
        }) as Response,
    );
    vi.stubGlobal('fetch', fetchMock);
    await runRemember({ category: 'homeCity', value: { city: 'Kraków' } });
    expect(fetchMock.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ signal: expect.anything() }));
  });

  it('removes the fact and returns the tool output', async () => {
    await runRemember({ category: 'interests', value: ['food'] });
    expect(runForget({ category: 'interests' })).toEqual({
      ok: true,
      output: { removed: true, category: 'interests' },
    });
    expect(readMemory()).toEqual({});
  });

  it('saves a note without the geocoder and reports the oldest it dropped', async () => {
    const geocode = vi.fn();
    const tenNotes = Array.from({ length: 10 }, (_, i) => `note ${i}`);
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify({ notes: tenNotes }));
    await expect(
      runRemember({ category: 'notes', value: { text: 'newest' } }, geocode),
    ).resolves.toEqual({
      ok: true,
      output: { saved: true, category: 'notes', value: { text: 'newest' }, dropped: 'note 0' },
    });
    expect(readMemory().notes).toEqual([...tenNotes.slice(1), 'newest']);
    expect(geocode).not.toHaveBeenCalled();
  });

  // Review Focus 2: the write starts from a fresh read, not a React snapshot.
  it('keeps a note another tab saved a moment ago', async () => {
    readMemory(); // warm the cache with "empty", as an open tab would have
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify({ notes: ['vegetarian'] }));
    await runRemember({ category: 'notes', value: { text: 'jazz cafés' } });
    expect(readMemory().notes).toEqual(['vegetarian', 'jazz cafés']);
  });

  it('forgets a note, or tells the model it is not saved', async () => {
    await runRemember({ category: 'notes', value: { text: 'Vegetarian' } });
    expect(runForget({ category: 'notes', note: 'loves steak' })).toEqual({
      ok: false,
      error: 'No saved note matches: loves steak',
    });
    expect(runForget({ category: 'notes', note: 'vegetarian' })).toEqual({
      ok: true,
      output: { removed: true, category: 'notes', note: 'Vegetarian' },
    });
    expect(readMemory()).toEqual({});
  });

  it('reports a storage error when the browser refuses a note', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    await expect(runRemember({ category: 'notes', value: { text: 'vegetarian' } })).resolves.toEqual({
      ok: false,
      error: MEMORY_WRITE_ERROR,
    });
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
