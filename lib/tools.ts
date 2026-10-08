import { tool, type InferUITools, type UIDataTypes, type UIMessage } from 'ai';
import { z } from 'zod';
import {
  forgetInputSchema,
  memoryCategorySchema,
  memoryFactSchema,
  rememberInputSchema,
  type ForgetInput,
  type RememberInput,
} from './memory';
import { geocodeCity } from './geocode';

// The shapes our tools return. Each is a discriminated union on `found`, so
// both the model and the UI can tell "no data" apart from real results.
// Annotating the execute() return types keeps the `found` literals narrow
// (a bare `return { found: false }` would widen to `boolean`), which the
// inferred UI types below depend on.
// Output shapes as Zod schemas, with the TS types derived from them. Two
// consumers need the same truth: the cards (compile time) and the context
// digest, which sees `JSONValue` and must narrow at runtime.
const notFoundSchema = z.object({ found: z.literal(false), city: z.string() });

const weatherOutputSchema = z.discriminatedUnion('found', [
  z.object({
    found: z.literal(true),
    location: z.string(),
    temperature: z.number(),
    feelsLike: z.number(),
    precipitation: z.number(),
    windSpeed: z.number(),
    units: z.object({ temperature: z.string(), windSpeed: z.string() }),
  }),
  notFoundSchema,
]);
export type WeatherOutput = z.infer<typeof weatherOutputSchema>;

const forecastDaySchema = z.object({
  date: z.string(),
  weekday: z.string(),
  maxTemp: z.number(),
  minTemp: z.number(),
  precipitationChance: z.number(),
  maxWindSpeed: z.number(),
});
export type ForecastDay = z.infer<typeof forecastDaySchema>;

const forecastOutputSchema = z.discriminatedUnion('found', [
  z.object({
    found: z.literal(true),
    location: z.string(),
    days: z.array(forecastDaySchema),
    units: z.object({
      temperature: z.string(),
      precipitationChance: z.string(),
      windSpeed: z.string(),
    }),
  }),
  notFoundSchema,
]);
export type ForecastOutput = z.infer<typeof forecastOutputSchema>;

const airQualityOutputSchema = z.discriminatedUnion('found', [
  z.object({
    found: z.literal(true),
    location: z.string(),
    usAqi: z.number(),
    pm25: z.number(),
    pm10: z.number(),
    europeanAqi: z.number(),
  }),
  notFoundSchema,
]);
export type AirQualityOutput = z.infer<typeof airQualityOutputSchema>;

// Keyed by tool name so the digest can look a schema up from a `toolName`
// string. planTrip is absent on purpose: its output is already small enough
// to send in full.
export const toolOutputSchemas = {
  getWeather: weatherOutputSchema,
  getForecast: forecastOutputSchema,
  getAirQuality: airQualityOutputSchema,
} as const;

export type TripPlanOutput =
  | {
      found: true;
      city: string;
      summary: string;
      packingList: string[];
    }
  | { found: false; city: string };

// Output contract for the trip-plan card. Every field must be derived from
// real tool results (forecast), never from the model's own knowledge.
const tripPlanSchema = z.object({
  city: z
    .string()
    .describe('City name with country, e.g. "Lisbon, Portugal"'),
  summary: z
    .string()
    .describe(
      'One or two sentences based on the actual forecast data: mention the ' +
        'temperature range and rain risk. Do not give generic travel advice.',
    ),
  packingList: z
    .array(z.string())
    .min(3)
    .max(6)
    .describe(
      'Items to pack, each justified by the forecast or by the known user ' +
        'preferences (e.g. "umbrella" only if rain is likely, "sunscreen" ' +
        'only if sunny, "a dog lead" for someone who travels with their dog). ' +
        'Short phrases.',
    ),
});

const planTrip = tool({
  description:
    'Present a trip-plan card for a city. Use whenever the user asks to plan ' +
    'a trip or what a trip to a place will be like. Call getForecast for the ' +
    'city FIRST, then fill in the summary from that forecast data, and the ' +
    'packing list from the forecast and the known user preferences.',
  inputSchema: tripPlanSchema,
  // Pass-through: the model's structured input IS the card data.
  execute: async (input): Promise<TripPlanOutput> => ({ found: true, ...input }),
});

const getWeather = tool({
  description:
    'Get the current weather for a city. Use whenever the user asks about ' +
    'weather, temperature, or what to pack for a trip to a place.',
  inputSchema: z.object({
    city: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .describe('City name in English, e.g. "Vienna" (not "Wiedeń"), "Tokyo"'),
  }),
  execute: async ({ city }): Promise<WeatherOutput> => {
    try {
      const geo = await geocodeCity(city);
      // Genuinely not found — a semantic result for the model to explain.
      // The tool adds `city` here; the helper only reports found/not-found.
      if (!geo.found) {
        return { found: false, city };
      }

      const { latitude, longitude, name, country } = geo;

      const wRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
          `&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m`,
      );
      if (!wRes.ok) {
        throw new Error(`Forecast request failed with status ${wRes.status}`);
      }
      const w = await wRes.json();

      return {
        found: true,
        location: `${name}, ${country}`,
        temperature: w.current.temperature_2m,
        feelsLike: w.current.apparent_temperature,
        precipitation: w.current.precipitation,
        windSpeed: w.current.wind_speed_10m,
        units: {
          temperature: w.current_units.temperature_2m,
          windSpeed: w.current_units.wind_speed_10m,
        },
      };
    } catch (err) {
      // Log the real error server-side, but re-throw a clean message so no
      // internals leak. The SDK surfaces this as an 'output-error' tool state.
      console.error('getWeather failed:', err);
      throw new Error('Weather service unavailable');
    }
  },
});

const getAirQuality = tool({
  description:
    'Get the current air quality for a city. Use whenever the user asks about air quality, smog, pollution, or allergies.' + 'US AQI scale: 0–50 good, 51–100 moderate, 101–150 unhealthy for sensitive groups, 151+ unhealthy.',
  inputSchema: z.object({
    city: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .describe('City name in English, e.g. "Vienna" (not "Wiedeń"), "Tokyo"'),
  }),
  execute: async ({ city }): Promise<AirQualityOutput> => {
    try {
      const geo = await geocodeCity(city);
      if (!geo.found) {
        return { found: false, city };
      }

      const { latitude, longitude, name, country } = geo;

      const aqRes = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${latitude}&longitude=${longitude}&current=us_aqi,pm2_5,pm10,european_aqi`);
      if (!aqRes.ok) {
        throw new Error(`Air quality request failed with status ${aqRes.status}`);
      }
      const aq = await aqRes.json();

      return {
        found: true,
        location: `${name}, ${country}`,
        usAqi: aq.current.us_aqi,
        pm25: aq.current.pm2_5,
        pm10: aq.current.pm10,
        europeanAqi: aq.current.european_aqi,
      };
    } catch (err) {
      console.error('getAirQuality failed:', err);
      throw new Error('Air quality service unavailable');
    }
  },
});

const getForecast = tool({
  description:
    'Get the daily weather forecast for a city for the next few days. Use ' +
    'whenever the user asks about FUTURE weather: tomorrow, the weekend, or ' +
    'an upcoming trip. For current conditions use getWeather instead.',
  inputSchema: z.object({
    city: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .describe('City name in English, e.g. "Vienna" (not "Wiedeń"), "Tokyo"'),
  }),
  // Always fetch a full week. Letting the model choose how many days meant it
  // asked for too few (e.g. 3) and never reached the weekend it was asked about
  // — a decision a small model gets wrong, so we make it in code instead.
  execute: async ({ city }): Promise<ForecastOutput> => {
    try {
      const geo = await geocodeCity(city);
      if (!geo.found) {
        return { found: false, city };
      }

      const { latitude, longitude, name, country } = geo;

      const fRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
          `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max` +
          `&forecast_days=7&timezone=auto`,
      );
      if (!fRes.ok) {
        throw new Error(`Forecast request failed with status ${fRes.status}`);
      }
      const f = await fRes.json();

      // Reshape parallel arrays ({time: [...], temperature_2m_max: [...]})
      // into one object per day — much easier for the model to read.
      const daily = f.daily.time.map((date: string, i: number) => ({
        date,
        maxTemp: f.daily.temperature_2m_max[i],
        minTemp: f.daily.temperature_2m_min[i],
        precipitationChance: f.daily.precipitation_probability_max[i],
        maxWindSpeed: f.daily.wind_speed_10m_max[i],
        weekday: new Date(date).toLocaleDateString('en-US', { weekday: 'long' }),
      }));

      return {
        found: true,
        location: `${name}, ${country}`,
        days: daily,
        units: {
          temperature: f.daily_units.temperature_2m_max,
          precipitationChance: f.daily_units.precipitation_probability_max,
          windSpeed: f.daily_units.wind_speed_10m_max,
        },
      };
    } catch (err) {
      console.error('getForecast failed:', err);
      throw new Error('Forecast service unavailable');
    }
  },
});

// --- Preference memory (4.2) ---
// The first tools that CHANGE state. They have no execute on purpose: the
// server stream ends on the call, the browser writes localStorage in useChat's
// onToolCall and posts the result back (a second request). Without execute
// the SDK requires an outputSchema — which is also what types the memory
// cards and addToolOutput end to end.
// The results do not use the `found` discriminator: `found` means "I looked a
// city up and it isn't there", and a write cannot fail to find anything.
// The input schema lives in lib/memory (the store, the resolver and the
// evals share it); re-exported here next to the other tool contracts.
export { forgetInputSchema, rememberInputSchema };
export type { ForgetInput, RememberInput };

// A saved note: the wording that is stored (for a repeated note, the one
// already in the panel) and the oldest note that fell out to make room.
const noteSavedSchema = z.object({
  saved: z.literal(true),
  category: z.literal('notes'),
  value: z.object({ text: z.string() }),
  dropped: z.string().optional(),
});

// The STORED fact — for homeCity the geocoder's name, not the model's query —
// so the card shows exactly what will come back in later prompts.
export const rememberOutputSchema = z.union([
  memoryFactSchema.and(z.object({ saved: z.literal(true) })),
  noteSavedSchema,
]);
export type RememberOutput = z.infer<typeof rememberOutputSchema>;

export const forgetOutputSchema = z.union([
  z.object({ removed: z.literal(true), category: memoryCategorySchema }),
  z.object({ removed: z.literal(true), category: z.literal('notes'), note: z.string() }),
]);
export type ForgetOutput = z.infer<typeof forgetOutputSchema>;

const remember = tool({
  description:
    'Save a LASTING preference about the user so future conversations can ' +
    'use it. Each category has a fixed value shape: ' +
    'homeCity → {city}: where the user lives, the city name in English; ' +
    'climate → {minComfortC?, maxComfortC?}: the temperature range the user ' +
    'finds comfortable, whole °C, at least one of the two; ' +
    'travelParty → {withPartner, childrenAges, pets}: who they travel with ' +
    '(all empty means they travel solo); ' +
    'interests → tags for what they enjoy on trips; ' +
    'avoid → tags for what they want to avoid; ' +
    'notes → {text}: a short note in your own words, max 120 characters. ' +
    'Use only tags from the allowed lists and never pick the closest tag: a ' +
    'lasting preference that fits no other category or tag goes into notes. ' +
    'Never save instructions about how you should reply or behave. Saving ' +
    'replaces the whole category: to add a tag, send the current tags plus ' +
    'the new one. Each note is added on its own. ' +
    'Never save one-off trip details such as dates, flights or a single destination.',
  // climate has optional fields, which strict mode cannot express.
  strict: false,
  inputSchema: rememberInputSchema,
  outputSchema: rememberOutputSchema,
});

const forget = tool({
  description:
    'Erase one saved preference when the user asks you to forget it, or says ' +
    'it is no longer true without giving a replacement. For a note, pass ' +
    'category notes and the note as written in the known preferences. To ' +
    'change a category value, call remember instead.',
  // `note` is optional (notes only). Strict mode made the model fill it on
  // every call, which the schema rejects for any other category.
  strict: false,
  inputSchema: forgetInputSchema,
  outputSchema: forgetOutputSchema,
});

export const tools = { getWeather, getForecast, getAirQuality, planTrip, remember, forget };

// Message type derived from the tools themselves: part types like
// 'tool-getWeather' carry the real input/output types end to end, so the
// client needs no casts when rendering tool parts.
export type ChatTools = InferUITools<typeof tools>;
export type ChatUIMessage = UIMessage<never, UIDataTypes, ChatTools>;
