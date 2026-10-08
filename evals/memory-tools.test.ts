import { describe, expect, it, vi } from 'vitest';
import type { Geocode } from '../lib/geocode';
import { forgetOutputSchema, rememberOutputSchema, tools as productionTools } from '../lib/tools';
import { createEvalMemory } from './memory-tools';

const OPTIONS = { toolCallId: 'call-1', messages: [], context: {} };

const geocodeKrakow: Geocode = async () => ({
  found: true,
  latitude: 50.06,
  longitude: 19.94,
  name: 'Kraków',
  country: 'Poland',
});

describe('createEvalMemory', () => {
  it('stores a city under the geocoder’s name, as the browser does', async () => {
    const { tools, memory } = createEvalMemory({}, geocodeKrakow);
    const output = await tools.remember.execute!(
      { category: 'homeCity', value: { city: 'krakow' } },
      OPTIONS,
    );
    expect(rememberOutputSchema.safeParse(output).success).toBe(true);
    expect(memory).toEqual({ homeCity: { name: 'Kraków', country: 'Poland' } });
  });

  it('stores tags without asking the geocoder', async () => {
    const geocode = vi.fn();
    const { tools, memory } = createEvalMemory({}, geocode);
    await tools.remember.execute!({ category: 'interests', value: ['museums'] }, OPTIONS);
    expect(memory).toEqual({ interests: ['museums'] });
    expect(geocode).not.toHaveBeenCalled();
  });

  // A thrown error is what generateText turns into a tool-error for the
  // model — the eval twin of output-error in the app.
  it('fails the call and stores nothing when the city is not found', async () => {
    const { tools, memory } = createEvalMemory({}, async () => ({ found: false }));
    await expect(
      tools.remember.execute!({ category: 'homeCity', value: { city: 'Atlantis' } }, OPTIONS),
    ).rejects.toThrow('City not found: Atlantis');
    expect(memory).toEqual({});
  });

  it('forget removes from the eval memory and returns the production output shape', async () => {
    const { tools, memory } = createEvalMemory({
      homeCity: { name: 'Kraków', country: 'Poland' },
      climate: { maxComfortC: 28 },
    });
    const output = await tools.forget.execute!({ category: 'homeCity' }, OPTIONS);
    expect(forgetOutputSchema.safeParse(output).success).toBe(true);
    expect(memory).toEqual({ climate: { maxComfortC: 28 } });
  });

  it('copies the initial memory, so one case cannot leak into the next', async () => {
    const initial = { interests: ['museums' as const] };
    const { tools } = createEvalMemory(initial);
    await tools.remember.execute!({ category: 'interests', value: ['food'] }, OPTIONS);
    expect(initial).toEqual({ interests: ['museums'] });
  });

  it('adds a note, dropping the oldest at 10/10, as the browser does', async () => {
    const tenNotes = Array.from({ length: 10 }, (_, i) => `note ${i}`);
    const { tools, memory } = createEvalMemory({ notes: tenNotes });
    const output = await tools.remember.execute!(
      { category: 'notes', value: { text: 'newest' } },
      OPTIONS,
    );
    expect(rememberOutputSchema.safeParse(output).success).toBe(true);
    expect(output).toEqual({ saved: true, category: 'notes', value: { text: 'newest' }, dropped: 'note 0' });
    expect(memory.notes).toEqual([...tenNotes.slice(1), 'newest']);
  });

  it('forgets a note and leaves no empty list behind', async () => {
    const { tools, memory } = createEvalMemory({ notes: ['Vegetarian'] });
    const output = await tools.forget.execute!({ category: 'notes', note: 'vegetarian' }, OPTIONS);
    expect(forgetOutputSchema.safeParse(output).success).toBe(true);
    expect(output).toEqual({ removed: true, category: 'notes', note: 'Vegetarian' });
    expect(memory).toEqual({});
  });

  it('fails the call when the note to forget is not saved', async () => {
    const { tools } = createEvalMemory({ notes: ['vegetarian'] });
    await expect(
      tools.forget.execute!({ category: 'notes', note: 'loves steak' }, OPTIONS),
    ).rejects.toThrow('No saved note matches: loves steak');
  });

  // The point of evals is to test the agent users talk to: everything except
  // the two execute functions must be the production definition.
  it('keeps every other tool and the memory tools’ contract untouched', () => {
    const { tools } = createEvalMemory();
    expect(tools.getWeather).toBe(productionTools.getWeather);
    expect(tools.planTrip).toBe(productionTools.planTrip);
    expect(tools.remember.description).toBe(productionTools.remember.description);
    expect(tools.remember.inputSchema).toBe(productionTools.remember.inputSchema);
    expect(tools.forget.inputSchema).toBe(productionTools.forget.inputSchema);
  });
});
