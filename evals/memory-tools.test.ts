import { describe, expect, it } from 'vitest';
import { forgetOutputSchema, rememberOutputSchema, tools as productionTools } from '../lib/tools';
import { createEvalMemory } from './memory-tools';

const OPTIONS = { toolCallId: 'call-1', messages: [], context: {} };

describe('createEvalMemory', () => {
  it('remember writes to the eval memory and returns the production output shape', async () => {
    const { tools, memory } = createEvalMemory();
    const output = await tools.remember.execute!({ category: 'homeCity', value: 'Kraków' }, OPTIONS);
    expect(rememberOutputSchema.safeParse(output).success).toBe(true);
    expect(memory).toEqual({ homeCity: 'Kraków' });
  });

  it('forget removes from the eval memory and returns the production output shape', async () => {
    const { tools, memory } = createEvalMemory({ homeCity: 'Kraków', climate: 'dislikes heat' });
    const output = await tools.forget.execute!({ category: 'homeCity' }, OPTIONS);
    expect(forgetOutputSchema.safeParse(output).success).toBe(true);
    expect(memory).toEqual({ climate: 'dislikes heat' });
  });

  it('copies the initial memory, so one case cannot leak into the next', async () => {
    const initial = { homeCity: 'Kraków' };
    const { tools } = createEvalMemory(initial);
    await tools.remember.execute!({ category: 'homeCity', value: 'Gdańsk' }, OPTIONS);
    expect(initial).toEqual({ homeCity: 'Kraków' });
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
