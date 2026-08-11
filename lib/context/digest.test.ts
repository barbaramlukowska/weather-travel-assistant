import { describe, expect, it } from 'vitest';
import type { ToolResultPart } from 'ai';
import { tools } from '@/lib/tools';
import { DIGESTERS, KEEP_RAW, PRUNED_OUTPUT, digestToolResult } from './digest';

const WEATHER = {
  found: true,
  location: 'Kraków, Poland',
  temperature: 18.3,
  feelsLike: 16.1,
  precipitation: 0,
  windSpeed: 12.4,
  units: { temperature: '°C', windSpeed: 'km/h' },
};

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const FORECAST = {
  found: true,
  location: 'Rome, Italy',
  days: WEEKDAYS.map((weekday, i) => ({
    date: `2026-08-0${i + 3}`,
    weekday,
    maxTemp: 28 + i,
    minTemp: 17 + i,
    precipitationChance: i * 10,
    maxWindSpeed: 12,
  })),
  units: { temperature: '°C', precipitationChance: '%', windSpeed: 'km/h' },
};

const AIR_QUALITY = {
  found: true,
  location: 'Kraków, Poland',
  usAqi: 42,
  pm25: 9.8,
  pm10: 14.2,
  europeanAqi: 38,
};

function jsonPart(toolName: string, value: unknown): ToolResultPart {
  return {
    type: 'tool-result',
    toolCallId: 'call-1',
    toolName,
    output: { type: 'json', value: value as never },
  };
}

function digestOf(part: ToolResultPart): string {
  const output = digestToolResult(part).output;
  if (output.type !== 'text') throw new Error(`expected a text digest, got ${output.type}`);
  return output.value;
}

describe('digestToolResult', () => {
  it('keeps location and the key numbers for getWeather', () => {
    const digest = digestOf(jsonPart('getWeather', WEATHER));

    expect(digest).toContain('Kraków, Poland');
    expect(digest).toContain('18.3');
    expect(digest).toContain('16.1');
    expect(digest).toContain('12.4');
  });

  it('keeps location and the key numbers for getAirQuality', () => {
    const digest = digestOf(jsonPart('getAirQuality', AIR_QUALITY));

    expect(digest).toContain('Kraków, Poland');
    expect(digest).toContain('42');
    expect(digest).toContain('9.8');
    expect(digest).toContain('14.2');
  });

  it('keeps every weekday name verbatim in the forecast digest', () => {
    const digest = digestOf(jsonPart('getForecast', FORECAST));

    for (const weekday of WEEKDAYS) {
      expect(digest).toContain(weekday);
    }
  });

  it('makes the forecast digest much shorter than the raw JSON', () => {
    const raw = JSON.stringify(FORECAST).length;
    const digest = digestOf(jsonPart('getForecast', FORECAST)).length;

    expect(digest).toBeLessThan(raw * 0.6);
  });

  it('reports a not-found city instead of dropping it', () => {
    const digest = digestOf(jsonPart('getWeather', { found: false, city: 'Xyzzyville' }));

    expect(digest).toContain('Xyzzyville');
    expect(digest).toContain('not found');
  });

  it('falls back to the placeholder when the shape does not parse', () => {
    const result = digestToolResult(jsonPart('getWeather', { foo: 1 }));

    expect(result.output).toEqual({ type: 'json', value: PRUNED_OUTPUT });
  });

  it('falls back to the placeholder for a tool with no digester', () => {
    const result = digestToolResult(jsonPart('getSomethingNew', { anything: true }));

    expect(result.output).toEqual({ type: 'json', value: PRUNED_OUTPUT });
  });

  it('leaves tools on the keep-raw list untouched', () => {
    const part = jsonPart('planTrip', { found: true, city: 'Lisbon', summary: 's', packingList: ['a'] });

    expect(digestToolResult(part)).toBe(part);
  });

  it('leaves non-json outputs untouched', () => {
    const part: ToolResultPart = {
      type: 'tool-result',
      toolCallId: 'call-1',
      toolName: 'getWeather',
      output: { type: 'error-text', value: 'Weather service unavailable' },
    };

    expect(digestToolResult(part)).toBe(part);
  });

  it('has a decision recorded for every registered tool', () => {
    for (const toolName of Object.keys(tools)) {
      const handled = toolName in DIGESTERS || KEEP_RAW.includes(toolName);
      expect(handled, `no digest decision for tool "${toolName}"`).toBe(true);
    }
  });
});
