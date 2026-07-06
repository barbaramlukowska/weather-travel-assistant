import { getChatModel } from '@/lib/model';
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
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          city,
        )}&count=1&language=en&format=json`,
      );
      // A failed request is a technical error, not "city not found" —
      // fail loudly so the two aren't confused.
      if (!geoRes.ok) {
        throw new Error(`Geocoding request failed with status ${geoRes.status}`);
      }
      const geo = await geoRes.json();

      // Genuinely not found — a semantic result for the model to explain.
      if (!geo.results || geo.results.length === 0) {
        return { found: false, city };
      }

      const { latitude, longitude, name, country } = geo.results[0];

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

const getCountryInfo = tool({
  description:
    'Get information about a country. Use whenever the user asks about ' +
    'a country, its capital, population, or currency.',
  inputSchema: z.object({
    country: z
      .string()
      .describe('Country name in English, e.g. "Austria", "Japan"'),
  }),
  execute: async ({ country }) => {
    try {
      const res = await fetch(
        `https://restcountries.com/v3.1/name/${encodeURIComponent(country)}?fullText=true`,
      );
      if (!res.ok && res.status === 404) {
        return { found: false, country };
      }
      if (!res.ok) {
        throw new Error(`Country info request failed with status ${res.status}`);
      }
      const data = await res.json();

      const countryData = data[0];
      return {
        found: true,
        name: countryData.name.common,
        capital: countryData.capital ? countryData.capital[0] : 'N/A',
        population: countryData.population,
        currency: countryData.currencies
          ? Object.keys(countryData.currencies)[0]
          : 'N/A',
      };
    } catch (err) {
      console.error('getCountryInfo failed:', err);
      throw new Error('Country info service unavailable');
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
      'You are a friendly travel assistant. When the user asks about the ' +
      'weather, the temperature, or what to pack for a trip, use the ' +
      'getWeather tool to fetch real data instead of guessing. Always pass the ' +
      "city name to getWeather in English (e.g. 'Vienna', not 'Wiedeń') so the " +
      'geocoder resolves the right place. If a city cannot be found, say so ' +
      'plainly. Keep answers concise and helpful.',
    messages: await convertToModelMessages(messages),
    tools: { getWeather, getCountryInfo },
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
