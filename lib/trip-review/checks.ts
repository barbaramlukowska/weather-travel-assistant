import type { ForecastOutput } from '../tools';
import type { ReviewIssue, TripDraft } from './schema';

// Layer 1 of the review: deterministic checks. Code catches what code can
// prove (a number outside the forecast, a repeated item) for free and with few
// false alarms; the LLM critic is left for the judgement calls. Known false
// alarms: relative figures ("3° colder", "feels 2° warmer") and ranges such as
// "Day 3-12°C" are read as absolute temperatures. Its issues go
// to the reviser in the same shape as the critic's.

// How far outside the forecast range a number may be before we call it wrong.
// The model rounds ("around 18°C" for a 17.4 high), and that is not an error.
const TOLERANCE = 1;

// A number followed by `°`, or the first number of a range `a–b°` / `a-b°`.
// Both sides of a range are captured so both get checked. Numbers without `°`
// (days, rain %) are ignored on purpose: they are not temperatures.
// - Minus: models often write U+2212 (`−3°C`), so it counts as a minus sign.
// - Separator: `–` `—` `-` `−` between two numbers is a range ("12−17" is
//   12 to 17, not 12 and -17); the second number may carry its own sign.
// - Unit: the forecast is always Celsius (Open-Meteo), so bare `°` and `°C`
//   are checked and `°F` figures are skipped. Comparing 63°F with 12–17°C
//   would send a correct plan to the reviser.
// "12 to 17°C" checks only 17 by design: a missed error, never a false alarm.
const TEMPERATURE =
  /([-−]?\d+(?:\.\d+)?)(?:\s*[–—−-]\s*([-−]?\d+(?:\.\d+)?))?\s*°(?!\s*F)/g;

const toNumber = (raw: string) => Number(raw.replace('−', '-'));

// Returns the matched figures as written ("18–24°"), each with its numbers,
// so a range is reported whole: "18–24°" is wrong because of the 24, but the
// reviser needs to see the figure it has to replace, not just the bad half.
function temperaturesIn(text: string): { text: string; values: number[] }[] {
  return [...text.matchAll(TEMPERATURE)].map((m) => ({
    text: m[0].replace(/\s+/g, ''),
    values: [toNumber(m[1]), ...(m[2] !== undefined ? [toNumber(m[2])] : [])],
  }));
}

// Case and whitespace must not hide a duplicate ("Sun hat" vs " sun  hat").
const normalize = (item: string) => item.trim().toLowerCase().replace(/\s+/g, ' ');

export function checkDraft(
  draft: TripDraft,
  forecast: Extract<ForecastOutput, { found: true }>,
): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  if (forecast.days.length > 0) {
    const low = Math.min(...forecast.days.map((d) => d.minTemp));
    const high = Math.max(...forecast.days.map((d) => d.maxTemp));
    const outside = temperaturesIn(draft.summary).filter(({ values }) =>
      values.some((t) => t < low - TOLERANCE || t > high + TOLERANCE),
    );
    // One issue per summary, not per figure: the reviser rewrites the whole
    // sentence anyway.
    if (outside.length > 0) {
      issues.push({
        field: 'summary',
        // Capped: ReviewIssue.problem allows 160 chars and a summary can list many figures.
        problem: `Summary says ${outside.map((o) => o.text).join(', ')}, but the forecast range is ${low}–${high}°.`.slice(0, 160),
      });
    }
  }

  const seen = new Set<string>();
  for (const item of draft.packingList) {
    const key = normalize(item);
    if (seen.has(key)) {
      // `item` is the later occurrence: that is the one the reviser removes.
      issues.push({ field: 'packingList', item, problem: 'Duplicate packing item.' });
    } else {
      seen.add(key);
    }
  }

  return issues;
}
