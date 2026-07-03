import { google } from '@ai-sdk/google';
import {
  streamText,
  smoothStream,
  tool,
  stepCountIs,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
  type UIMessage,
} from 'ai';
import { z } from 'zod';

// Allow the streamed response to run for up to 30 seconds.
export const maxDuration = 30;

const getWeather = tool({
  description:
    'Get the current weather for a city. Use whenever the user asks about ' +
    'weather, temperature, or what to pack for a trip to a place.',
  inputSchema: z.object({
    city: z.string().describe('City name, e.g. "Krakow" or "Tokyo"'),
  }),
  execute: async ({ city }) => {
    // Step 1 — Geocoding: turn the city name into coordinates.
    const geoRes = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        city,
      )}&count=1&language=en&format=json`,
    );
    const geo = await geoRes.json();

    // The city was not found — return a plain result the model can explain.
    if (!geo.results || geo.results.length === 0) {
      return { found: false, city };
    }

    const { latitude, longitude, name, country } = geo.results[0];

    // Step 2 — Forecast: get current conditions for those coordinates.
    const wRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
        `&current=temperature_2m,apparent_temperature,precipitation,wind_speed_10m`,
    );
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
  },
});

// This function handles POST requests to /api/chat.
// The folder path (app/api/chat/) becomes the URL — no routing config needed.
export async function POST(req: Request) {
  // The browser sends the full conversation so far. Each message is a
  // "UIMessage" (has an id, a role, and a list of parts).
  const { messages }: { messages: UIMessage[] } = await req.json();

  // Ask the model to answer. streamText returns immediately with a handle
  // to a stream — it does NOT wait for the whole answer.
  const result = streamText({
    // gemini-2.5-flash-lite: fast, higher free-tier limits. Accuracy for
    // weather comes from the getWeather tool, not the model's knowledge.
    model: google('gemini-2.5-flash-lite'),
    // The system prompt gives the model its role and tells it when to reach
    // for the weather tool.
    system:
      'You are a friendly travel assistant. When the user asks about the ' +
      'weather, the temperature, or what to pack for a trip, use the ' +
      'getWeather tool to fetch real data instead of guessing. If a city ' +
      'cannot be found, say so plainly. Keep answers concise and helpful.',
    // convertToModelMessages turns the UI-shaped messages into the shape
    // the model expects.
    messages: await convertToModelMessages(messages),
    // Make the weather tool available to the model.
    tools: { getWeather },
    // The agent loop. Without this, streamText stops after 1 step — the model
    // would call the tool but never write the final answer. stepCountIs(5)
    // lets it continue: model -> tool call -> result -> model finishes.
    stopWhen: stepCountIs(5),
    // The model sends text in large chunks. smoothStream re-emits it word by
    // word with a small delay, so the UI feels like a smooth "typewriter"
    // instead of text appearing in blocks.
    experimental_transform: smoothStream({ delayInMs: 30, chunking: 'word' }),
  });

  // Pipe the model's stream back to the browser in a format that the
  // useChat hook on the client understands.
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
