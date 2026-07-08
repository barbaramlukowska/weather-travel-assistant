import { getChatModel } from '@/lib/model';
import { pruneOldToolResults } from '@/lib/context';
import {
  streamText,
  smoothStream,
  tool,
  stepCountIs,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  APICallError,
  RetryError,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { RATE_LIMIT_MESSAGE } from '@/lib/errors';

export const maxDuration = 30;

// Shared by every location-based tool (weather, air quality, …) so the
// city-to-coordinates logic lives in exactly one place. A plain function,
// not a tool() — the model never calls it directly.
type GeocodeResult =
  | { found: true; latitude: number; longitude: number; name: string; country: string }
  | { found: false };

async function geocodeCity(city: string): Promise<GeocodeResult> {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      city,
    )}&count=1&language=en&format=json`,
  );
  // A failed request is a technical error, not "city not found" —
  // fail loudly so the two aren't confused. Callers' try/catch handles it.
  if (!res.ok) {
    throw new Error(`Geocoding request failed with status ${res.status}`);
  }
  const geo = await res.json();

  // Genuinely not found — a semantic result for the model to explain.
  if (!geo.results || geo.results.length === 0) {
    return { found: false };
  }

  const { latitude, longitude, name, country } = geo.results[0];
  return { found: true, latitude, longitude, name, country };
}

const getWeather = tool({
  description:
    'Get the current weather for a city. Use whenever the user asks about ' +
    'weather, temperature, or what to pack for a trip to a place.',
  inputSchema: z.object({
    city: z
      .string()
      .describe('City name in English, e.g. "Vienna" (not "Wiedeń"), "Tokyo"'),
  }),
  execute: async ({ city }) => {
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
      .describe('City name in English, e.g. "Vienna" (not "Wiedeń"), "Tokyo"'),
  }),
  execute: async ({ city }) => {
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
      .describe('City name in English, e.g. "Vienna" (not "Wiedeń"), "Tokyo"'),
  }),
  // Always fetch a full week. Letting the model choose how many days meant it
  // asked for too few (e.g. 3) and never reached the weekend it was asked about
  // — a decision a small model gets wrong, so we make it in code instead.
  execute: async ({ city }) => {
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

// The SDK masks streaming errors as "An error occurred." so internals never
// leak. We override that only for the free-tier daily quota (HTTP 429), which
// is worth explaining. The failing model call is wrapped in retries, so the
// error is usually a RetryError — unwrap it to read the real status code.
function toClientErrorMessage(error: unknown): string {
  const apiError = RetryError.isInstance(error) ? error.lastError : error;

  if (APICallError.isInstance(apiError) && apiError.statusCode === 429) {
    return RATE_LIMIT_MESSAGE;
  }

  console.error('Chat stream error:', error);
  return 'An error occurred.';
}

// Validate at the trust boundary, but only the contract we depend on (a
// non-empty messages array) — the AI SDK owns and validates the rest.
const requestSchema = z.object({
  messages: z.array(z.unknown()).min(1),
});

export async function POST(req: Request) {
  // Parse defensively: a malformed or non-JSON body must not crash the route.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Invalid request: expected a non-empty "messages" array' },
      { status: 400 },
    );
  }

  const messages = parsed.data.messages as UIMessage[];

  const result = streamText({
    // Accuracy comes from the getWeather tool, not the model's own knowledge,
    // so a small, fast model is enough for correct weather.
    model: getChatModel(),
    system:
      `Today is ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. You are a friendly travel assistant. Use your tools to fetch real ` +
      'data instead of guessing: getWeather for CURRENT conditions, ' +
      'getForecast for FUTURE weather (tomorrow, the weekend, an upcoming ' +
      'trip), and getAirQuality for air quality, smog, or pollution. Combine ' +
      'several tools in one answer when the question needs it. Never present ' +
      'current conditions as a forecast — if the user asks about the future, ' +
      'call getForecast. Each forecast day includes a `weekday` field — use it ' +
      'verbatim; never rename or recompute the day of the week yourself. ' +
      'Always pass city names in English (e.g. ' +
      "'Vienna', not 'Wiedeń') so the geocoder resolves the right place. If " +
      'a city cannot be found, say so plainly. Keep answers concise and ' +
      'helpful.',
    messages: await convertToModelMessages(pruneOldToolResults(messages)),
    tools: { getWeather, getForecast, getAirQuality },
    // The agent loop: without this the model calls the tool but never writes
    // the final answer.
    stopWhen: stepCountIs(5),
    // Re-emit the reply word by word so the UI feels like a smooth typewriter.
    experimental_transform: smoothStream({ delayInMs: 30, chunking: 'word' }),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: toClientErrorMessage,
    }),
  });
}
