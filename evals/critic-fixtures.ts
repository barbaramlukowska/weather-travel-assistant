import type { Memory } from '../lib/memory';
import type { ForecastOutput } from '../lib/tools';
import type { TripDraft } from '../lib/trip-review';

// Hand-written drafts for calibrating the critic. No agent is called: the
// drafts and labels are written by hand, so the only thing measured is the
// critic. `expectPass` is what a correct critic says; the false-rejection
// cases (true) matter as much as the seeded errors (false), because a critic
// that flags everything would look perfect on the errors alone.
export type CriticFixture = {
  id: string;
  draft: TripDraft;
  forecast: Extract<ForecastOutput, { found: true }>;
  memory: Memory;
  expectPass: boolean;
  note: string;
};

const units = { temperature: '°C', precipitationChance: '%', windSpeed: 'km/h' };

type Day = [weekday: string, date: string, min: number, max: number, rain: number, wind: number];
const forecastOf = (location: string, days: Day[]): CriticFixture['forecast'] => ({
  found: true,
  location,
  days: days.map(([weekday, date, minTemp, maxTemp, precipitationChance, maxWindSpeed]) => ({
    weekday,
    date,
    minTemp,
    maxTemp,
    precipitationChance,
    maxWindSpeed,
  })),
  units,
});

// A warm, dry week and a wet, mild weekend, reused across fixtures.
const lisbonDry = forecastOf('Lisbon, Portugal', [
  ['Friday', '2026-11-06', 15, 23, 0, 14],
  ['Saturday', '2026-11-07', 16, 24, 5, 12],
  ['Sunday', '2026-11-08', 15, 22, 10, 16],
]);
const londonWet = forecastOf('London, United Kingdom', [
  ['Friday', '2026-11-06', 7, 11, 55, 22],
  ['Saturday', '2026-11-07', 8, 12, 80, 28],
  ['Sunday', '2026-11-08', 6, 10, 60, 24],
]);
const viennaBorder = forecastOf('Vienna, Austria', [
  ['Friday', '2026-11-06', 6, 13, 40, 15],
  ['Saturday', '2026-11-07', 5, 12, 35, 18],
  ['Sunday', '2026-11-08', 5, 11, 40, 14],
]);

const withDog: Memory = { travelParty: { withPartner: false, childrenAges: [], pets: ['dog'] } };

export const fixtures: CriticFixture[] = [
  {
    id: 'good-plan',
    draft: {
      city: 'Lisbon, Portugal',
      summary: 'Mild and dry, 15-24 °C with almost no rain risk all weekend.',
      packingList: ['sunglasses', 'light jacket', 'comfortable walking shoes'],
    },
    forecast: lisbonDry,
    memory: {},
    expectPass: true,
    note: 'Baseline: every statement matches the forecast.',
  },
  {
    id: 'wrong-temperature',
    draft: {
      city: 'Lisbon, Portugal',
      summary: 'Hot days around 35 °C with no rain in sight.',
      packingList: ['sunglasses', 'light jacket', 'comfortable walking shoes'],
    },
    forecast: lisbonDry,
    memory: {},
    expectPass: false,
    note: 'Summary temperature is 11 degrees above the forecast maximum of 24.',
  },
  {
    id: 'umbrella-in-dry-week',
    draft: {
      city: 'Lisbon, Portugal',
      summary: 'Mild and dry, 15-24 °C with almost no rain risk all weekend.',
      packingList: ['umbrella', 'sunglasses', 'light jacket'],
    },
    forecast: lisbonDry,
    memory: {},
    expectPass: false,
    note: 'Umbrella with 0-10% rain chance on every day.',
  },
  {
    id: 'sunny-weekend-in-rain',
    draft: {
      city: 'London, United Kingdom',
      summary: 'A sunny weekend, 8-12 °C, perfect for walking outdoors.',
      packingList: ['waterproof jacket', 'warm sweater', 'comfortable walking shoes'],
    },
    forecast: londonWet,
    memory: {},
    expectPass: false,
    note: '"Sunny" while Saturday has an 80% rain chance.',
  },
  {
    id: 'dog-lead-with-pet-memory',
    draft: {
      city: 'Lisbon, Portugal',
      summary: 'Mild and dry, 15-24 °C with almost no rain risk all weekend.',
      packingList: ['a dog lead', 'light jacket', 'sunglasses'],
    },
    forecast: lisbonDry,
    memory: withDog,
    expectPass: true,
    note: 'False-rejection probe: the forecast says nothing about a dog, the saved preference does.',
  },
  {
    id: 'light-rain-jacket-at-40',
    draft: {
      city: 'Vienna, Austria',
      summary: 'Cool, 5-13 °C with a moderate chance of showers (35-40%).',
      packingList: ['light rain jacket', 'warm sweater', 'comfortable walking shoes'],
    },
    forecast: viennaBorder,
    memory: {},
    expectPass: true,
    note: 'Borderline: a light rain jacket at 40% rain chance is reasonable.',
  },
  {
    id: 'generic-advice-no-data',
    draft: {
      city: 'Vienna, Austria',
      summary: 'Vienna is a beautiful city full of history, coffee houses and music. Enjoy your visit!',
      packingList: ['warm sweater', 'light rain jacket', 'comfortable walking shoes'],
    },
    forecast: viennaBorder,
    memory: {},
    expectPass: false,
    note: 'Summary has no temperatures and no rain/wind risk: generic travel advice.',
  },
  {
    id: 'wind-claim-matches',
    draft: {
      city: 'London, United Kingdom',
      summary: 'Cold and wet, 6-12 °C, rain likely every day and winds up to 28 km/h on Saturday.',
      packingList: ['waterproof jacket', 'warm sweater', 'comfortable walking shoes'],
    },
    forecast: londonWet,
    memory: {},
    expectPass: true,
    note: 'False-rejection probe: the wind figure is exactly the forecast maximum.',
  },
  {
    // Probe for the "no forecast-based information" rule: rain/wind risk is
    // stated, just without numbers, so the rule must not fire.
    id: 'qualitative-summary',
    draft: {
      city: 'Lisbon, Portugal',
      summary: 'Dry and calm all weekend, ideal for walking around the city.',
      packingList: ['sunglasses', 'light jacket', 'comfortable walking shoes'],
    },
    forecast: lisbonDry,
    memory: {},
    expectPass: true,
    note: 'False-rejection probe: rain and wind risk are described without numbers, and match the forecast.',
  },
  {
    id: 'duplicate-items',
    draft: {
      city: 'London, United Kingdom',
      summary: 'Cold and wet, 6-12 °C, rain likely every day.',
      packingList: ['waterproof jacket', 'rain jacket', 'warm sweater', 'comfortable walking shoes'],
    },
    forecast: londonWet,
    memory: {},
    expectPass: false,
    note: 'Waterproof jacket and rain jacket are the same item twice.',
  },
];
