import { describe, expect, it } from 'vitest';
import { toolOutputSchemas } from './tools';

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
