import { describe, expect, it } from 'vitest';
import { countSavedItems, formatFact, memoryFacts } from './format';
import type { MemoryFact } from './schema';

describe('formatFact', () => {
  const cases: [MemoryFact, string][] = [
    [{ category: 'homeCity', value: { name: 'Kraków', country: 'Poland' } }, 'Kraków, Poland'],
    [{ category: 'climate', value: { maxComfortC: 28 } }, 'comfortable up to 28 °C'],
    [{ category: 'climate', value: { minComfortC: 10 } }, 'comfortable from 10 °C'],
    [{ category: 'climate', value: { minComfortC: 10, maxComfortC: 28 } }, 'comfortable between 10 and 28 °C'],
    [
      { category: 'travelParty', value: { withPartner: true, childrenAges: [3, 7], pets: ['dog'] } },
      'with a partner; children aged 3, 7; pets: dog',
    ],
    [{ category: 'travelParty', value: { withPartner: false, childrenAges: [3], pets: [] } }, 'children aged 3'],
    [{ category: 'travelParty', value: { withPartner: false, childrenAges: [], pets: ['dog', 'cat'] } }, 'pets: dog, cat'],
    [{ category: 'travelParty', value: { withPartner: false, childrenAges: [], pets: [] } }, 'travels solo'],
    [{ category: 'interests', value: ['museums', 'food'] }, 'museums, food'],
    [{ category: 'avoid', value: ['crowds', 'long-walks'] }, 'crowds, long walks'],
  ];

  it.each(cases)('%j → %s', (fact, text) => {
    expect(formatFact(fact)).toBe(text);
  });
});

describe('memoryFacts', () => {
  it('lists facts in category order, whatever order they were saved in', () => {
    const facts = memoryFacts({
      avoid: ['crowds'],
      homeCity: { name: 'Kraków', country: 'Poland' },
    });
    expect(facts.map((fact) => fact.category)).toEqual(['homeCity', 'avoid']);
  });

  it('returns nothing for empty memory', () => {
    expect(memoryFacts({})).toEqual([]);
  });
});

describe('countSavedItems', () => {
  // The header badge: a note is an item of its own, not one "notes" category.
  it('counts each filled category and each note', () => {
    expect(countSavedItems({})).toBe(0);
    expect(countSavedItems({ climate: { maxComfortC: 28 }, notes: ['vegetarian', 'jazz cafés'] })).toBe(3);
  });
});
