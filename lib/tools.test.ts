import { describe, expect, it } from 'vitest';
import { forgetInputSchema, rememberInputSchema, toolOutputSchemas, tools } from './tools';

describe('toolOutputSchemas', () => {
  it('accepts a real getWeather result', () => {
    const output = {
      found: true,
      location: 'Kraków, Poland',
      temperature: 18.3,
      feelsLike: 16.1,
      precipitation: 0,
      windSpeed: 12.4,
      units: { temperature: '°C', windSpeed: 'km/h' },
    };

    expect(toolOutputSchemas.getWeather.safeParse(output).success).toBe(true);
  });

  it('accepts a real getForecast result', () => {
    const output = {
      found: true,
      location: 'Rome, Italy',
      days: [
        {
          date: '2026-08-03',
          weekday: 'Monday',
          maxTemp: 28,
          minTemp: 17,
          precipitationChance: 10,
          maxWindSpeed: 12,
        },
      ],
      units: { temperature: '°C', precipitationChance: '%', windSpeed: 'km/h' },
    };

    expect(toolOutputSchemas.getForecast.safeParse(output).success).toBe(true);
  });

  it('accepts a real getAirQuality result', () => {
    const output = {
      found: true,
      location: 'Kraków, Poland',
      usAqi: 42,
      pm25: 9.8,
      pm10: 14.2,
      europeanAqi: 38,
    };

    expect(toolOutputSchemas.getAirQuality.safeParse(output).success).toBe(true);
  });

  it('accepts the not-found variant for every tool', () => {
    const notFound = { found: false, city: 'Xyzzyville' };

    expect(toolOutputSchemas.getWeather.safeParse(notFound).success).toBe(true);
    expect(toolOutputSchemas.getForecast.safeParse(notFound).success).toBe(true);
    expect(toolOutputSchemas.getAirQuality.safeParse(notFound).success).toBe(true);
  });

  it('rejects a shape that is not a tool output at all', () => {
    expect(toolOutputSchemas.getWeather.safeParse({ foo: 1 }).success).toBe(false);
  });
});

describe('memory tools', () => {
  // No execute = the server stream ends on the call and the browser runs it
  // (useChat onToolCall). A server-side execute here would silently move the
  // write to the server, where localStorage does not exist.
  it('have no server-side execute', () => {
    expect(tools.remember.execute).toBeUndefined();
    expect(tools.forget.execute).toBeUndefined();
  });

  it('accept only the closed set of categories', () => {
    expect(rememberInputSchema.safeParse({ category: 'climate', value: 'hates heat' }).success).toBe(true);
    expect(rememberInputSchema.safeParse({ category: 'favouriteFood', value: 'pierogi' }).success).toBe(false);
    expect(forgetInputSchema.safeParse({ category: 'homeCity' }).success).toBe(true);
    expect(forgetInputSchema.safeParse({ category: 'everything' }).success).toBe(false);
  });

  it('reject an empty or oversized value instead of storing it', () => {
    expect(rememberInputSchema.safeParse({ category: 'avoid', value: '  ' }).success).toBe(false);
    expect(rememberInputSchema.safeParse({ category: 'avoid', value: 'x'.repeat(121) }).success).toBe(false);
  });
});
