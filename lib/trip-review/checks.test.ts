import { describe, expect, it } from 'vitest';
import type { ForecastOutput } from '../tools';
import { checkDraft } from './checks';
import type { TripDraft } from './schema';

const day = (minTemp: number, maxTemp: number) => ({
  date: '2026-08-03',
  weekday: 'Monday',
  minTemp,
  maxTemp,
  precipitationChance: 10,
  maxWindSpeed: 12,
});

// Overall range across the days: 12–17.
const forecast: Extract<ForecastOutput, { found: true }> = {
  found: true,
  location: 'Lisbon, Portugal',
  days: [day(12, 15), day(13, 16), day(14, 17)],
  units: { temperature: '°C', precipitationChance: '%', windSpeed: 'km/h' },
};

const draft = (over: Partial<TripDraft> = {}): TripDraft => ({
  city: 'Lisbon, Portugal',
  summary: 'Expect 12–17°C and dry days.',
  packingList: ['umbrella', 'hat', 'sunscreen'],
  ...over,
});

describe('checkDraft', () => {
  it('accepts a summary inside the forecast range', () => {
    expect(checkDraft(draft(), forecast)).toEqual([]);
  });

  it('flags a range outside the forecast with one issue', () => {
    const issues = checkDraft(
      draft({ summary: 'Temperatures of 18–24°C.' }),
      forecast,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe('summary');
    expect(issues[0].problem).toContain('18');
    expect(issues[0].problem).toContain('12–17');
  });

  it('tolerates 1 degree outside the range', () => {
    expect(checkDraft(draft({ summary: 'Around 18°C.' }), forecast)).toEqual([]);
  });

  it('parses negative numbers', () => {
    const issues = checkDraft(draft({ summary: 'Down to -3°C at night.' }), forecast);
    expect(issues).toHaveLength(1);
    expect(issues[0].problem).toContain('-3');
  });

  it('accepts a hyphen range inside the forecast', () => {
    expect(checkDraft(draft({ summary: 'Highs of 13-16°C.' }), forecast)).toEqual([]);
  });

  it('ignores numbers that are not temperatures', () => {
    expect(
      checkDraft(draft({ summary: 'Pack for 3 days, 40% rain, 12–17°C.' }), forecast),
    ).toEqual([]);
  });

  it('skips Fahrenheit figures next to Celsius ones', () => {
    expect(
      checkDraft(draft({ summary: 'Expect 12–17°C (54–63°F).' }), forecast),
    ).toEqual([]);
    expect(checkDraft(draft({ summary: 'Expect 12–17°C (63° F).' }), forecast)).toEqual([]);
  });

  it('parses the Unicode minus sign', () => {
    const issues = checkDraft(draft({ summary: 'Down to \u22123°C.' }), forecast);
    expect(issues).toHaveLength(1);
    expect(issues[0].problem).toContain('\u22123');
  });

  it('handles negative ranges with Unicode minus and dash separators', () => {
    const cold = {
      ...forecast,
      days: [day(-5, 0), day(-3, 2)],
    };
    for (const summary of ['Expect \u22125–2°C.', 'Expect -5-2°C.', 'Expect \u22125\u22122°C.']) {
      expect(checkDraft(draft({ summary }), cold)).toEqual([]);
    }
    expect(checkDraft(draft({ summary: 'Expect 12\u221217°C.' }), forecast)).toEqual([]);
  });

  it('flags a duplicate packing item ignoring case and whitespace', () => {
    const issues = checkDraft(
      draft({ packingList: ['Umbrella', 'umbrella', 'hat'] }),
      forecast,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ field: 'packingList', item: 'umbrella' });

    expect(
      checkDraft(draft({ packingList: ['sun hat', ' Sun  Hat ', 'x'] }), forecast),
    ).toHaveLength(1);
  });
});
