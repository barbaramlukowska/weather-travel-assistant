import { describe, expect, it } from 'vitest';
import { tripPlanSchema } from '../lib/trip-review';
import { fixtures } from './critic-fixtures';

describe('critic fixtures', () => {
  it('have unique ids', () => {
    const ids = fixtures.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('hold drafts the tool schema would accept', () => {
    for (const f of fixtures) {
      expect(tripPlanSchema.safeParse(f.draft).success, f.id).toBe(true);
    }
  });

  it('cover both labels, with enough of each to beat a constant critic', () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(8);
    expect(fixtures.filter((f) => !f.expectPass).length).toBeGreaterThanOrEqual(4);
    expect(fixtures.filter((f) => f.expectPass).length).toBeGreaterThanOrEqual(3);
  });

  it('give every fixture a forecast with days and a note', () => {
    for (const f of fixtures) {
      expect(f.forecast.days.length, f.id).toBeGreaterThan(0);
      expect(f.note.length, f.id).toBeGreaterThan(0);
    }
  });
});
