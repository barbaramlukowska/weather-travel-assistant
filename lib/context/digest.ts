import type { ToolResultPart } from 'ai';
import { toolOutputSchemas } from '@/lib/tools';

// Kept for the fallback path: a tool result we cannot summarise safely still
// has to stay paired with its call, so we replace the data and keep the part.
export const PRUNED_OUTPUT = { note: 'Older tool result omitted to save context.' };

// Tools whose output is already small enough to send in full. planTrip is a
// city, one or two sentences and 3-6 packing items — compressing it would save
// a few dozen characters and risk losing a fact the user asks about later.
export const KEEP_RAW: readonly string[] = ['planTrip'];

type Digester = (output: unknown) => string | null;

const digestWeather: Digester = (output) => {
  const parsed = toolOutputSchemas.getWeather.safeParse(output);
  if (!parsed.success) return null;
  const w = parsed.data;
  if (!w.found) return `getWeather: city "${w.city}" not found`;

  return (
    `getWeather ${w.location}: ${w.temperature}${w.units.temperature} ` +
    `(feels ${w.feelsLike}), precip ${w.precipitation}mm, ` +
    `wind ${w.windSpeed}${w.units.windSpeed}`
  );
};

const digestForecast: Digester = (output) => {
  const parsed = toolOutputSchemas.getForecast.safeParse(output);
  if (!parsed.success) return null;
  const f = parsed.data;
  if (!f.found) return `getForecast: city "${f.city}" not found`;

  // Every day survives, and `weekday` is copied verbatim — the system prompt
  // tells the model to reuse that field and never recompute it.
  const days = f.days
    .map(
      (d) =>
        `${d.weekday} ${d.date} ${d.maxTemp}/${d.minTemp} ` +
        `${d.precipitationChance}% ${d.maxWindSpeed}`,
    )
    .join('; ');

  return (
    `getForecast ${f.location} ${f.days.length}-day ` +
    `(${f.units.temperature}, ${f.units.precipitationChance}, ${f.units.windSpeed}): ${days}`
  );
};

const digestAirQuality: Digester = (output) => {
  const parsed = toolOutputSchemas.getAirQuality.safeParse(output);
  if (!parsed.success) return null;
  const a = parsed.data;
  if (!a.found) return `getAirQuality: city "${a.city}" not found`;

  // Raw numbers only: the AQI scale is already described in the tool's
  // description, so labelling it here would duplicate that decision.
  return (
    `getAirQuality ${a.location}: US AQI ${a.usAqi}, ` +
    `PM2.5 ${a.pm25}, PM10 ${a.pm10}, EU AQI ${a.europeanAqi}`
  );
};

export const DIGESTERS: Record<string, Digester> = {
  getWeather: digestWeather,
  getForecast: digestForecast,
  getAirQuality: digestAirQuality,
};

// Replaces a tool result's payload with a one-line factual digest. Returns the
// same reference when nothing changes, so callers can count real edits.
export function digestToolResult(part: ToolResultPart): ToolResultPart {
  if (KEEP_RAW.includes(part.toolName)) return part;
  // error-text, error-json and execution-denied are short and meaningful
  // already — only structured payloads are worth compressing.
  if (part.output.type !== 'json') return part;

  const digester = DIGESTERS[part.toolName];
  const digest = digester ? digester(part.output.value) : null;

  return {
    ...part,
    output:
      digest === null
        ? { type: 'json', value: PRUNED_OUTPUT }
        : { type: 'text', value: digest },
  };
}
