import { describe, expect, it } from 'vitest';
import { MAX_MEMORY_VALUE_LENGTH, MEMORY_CATEGORIES, memorySchema } from './schema';

describe('memorySchema', () => {
  it('has exactly the five categories from the spec, in order', () => {
    expect(MEMORY_CATEGORIES).toEqual(['homeCity', 'climate', 'travelParty', 'interests', 'avoid']);
  });

  it('accepts empty memory and memory with every category', () => {
    expect(memorySchema.safeParse({}).success).toBe(true);
    expect(
      memorySchema.safeParse({
        homeCity: 'Kraków',
        climate: 'dislikes heat above 28°C',
        travelParty: 'travels with a 3-year-old',
        interests: 'museums, street food',
        avoid: 'crowded beaches',
      }).success,
    ).toBe(true);
  });

  it('trims values', () => {
    expect(memorySchema.parse({ homeCity: '  Kraków  ' })).toEqual({ homeCity: 'Kraków' });
  });

  it('rejects a value that is empty after trim', () => {
    expect(memorySchema.safeParse({ climate: '   ' }).success).toBe(false);
  });

  it('caps a value at the length limit', () => {
    expect(memorySchema.safeParse({ avoid: 'x'.repeat(MAX_MEMORY_VALUE_LENGTH) }).success).toBe(true);
    expect(memorySchema.safeParse({ avoid: 'x'.repeat(MAX_MEMORY_VALUE_LENGTH + 1) }).success).toBe(false);
  });

  // A closed set: a key the model or a forged request invents never reaches
  // the prompt.
  it('rejects an unknown category', () => {
    expect(memorySchema.safeParse({ favouriteFood: 'pierogi' }).success).toBe(false);
  });

  it('rejects anything that is not a plain object', () => {
    for (const value of [null, [], 'homeCity: Kraków', 42]) {
      expect(memorySchema.safeParse(value).success).toBe(false);
    }
  });
});
