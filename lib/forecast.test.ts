import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./geocode', () => ({ geocodeCity: vi.fn() }));

import { fetchForecast } from './forecast';
import { geocodeCity } from './geocode';

const geocodeMock = vi.mocked(geocodeCity);

// A stand-in for fetch: no network in unit tests.
function mockFetch(body: unknown, ok = true) {
  const fetchMock = vi.fn<typeof fetch>(
    async () =>
      ({ ok, status: ok ? 200 : 503, json: async () => body }) as Response,
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const found = {
  found: true as const,
  latitude: 38.72,
  longitude: -9.14,
  name: 'Lisbon',
  country: 'Portugal',
};

const sevenDays = {
  daily: {
    time: Array.from({ length: 7 }, (_, i) => `2026-08-0${i + 3}`),
    temperature_2m_max: [28, 29, 30, 27, 26, 25, 24],
    temperature_2m_min: [17, 18, 18, 16, 15, 15, 14],
    precipitation_probability_max: [0, 10, 5, 20, 40, 60, 0],
    wind_speed_10m_max: [12, 14, 10, 9, 20, 22, 8],
  },
  daily_units: {
    temperature_2m_max: '°C',
    precipitation_probability_max: '%',
    wind_speed_10m_max: 'km/h',
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  geocodeMock.mockReset();
});

describe('fetchForecast', () => {
  it('returns seven reshaped days with a weekday each', async () => {
    geocodeMock.mockResolvedValue(found);
    mockFetch(sevenDays);

    const result = await fetchForecast('Lisbon');

    expect(result).toMatchObject({
      found: true,
      location: 'Lisbon, Portugal',
      units: { temperature: '°C', precipitationChance: '%', windSpeed: 'km/h' },
    });
    if (!result.found) throw new Error('expected found');
    expect(result.days).toHaveLength(7);
    expect(result.days[0]).toMatchObject({
      date: '2026-08-03',
      maxTemp: 28,
      minTemp: 17,
      precipitationChance: 0,
      maxWindSpeed: 12,
    });
    expect(result.days.every((d) => d.weekday.length > 0)).toBe(true);
  });

  it('reports "not found" when the geocoder finds nothing', async () => {
    geocodeMock.mockResolvedValue({ found: false });
    const fetchMock = mockFetch(sevenDays);

    await expect(fetchForecast('Atlantis')).resolves.toEqual({
      found: false,
      city: 'Atlantis',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws a clean message when the forecast request fails', async () => {
    geocodeMock.mockResolvedValue(found);
    mockFetch({}, false);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(fetchForecast('Lisbon')).rejects.toThrow('Forecast service unavailable');
  });

  it('passes the signal to both requests', async () => {
    geocodeMock.mockResolvedValue(found);
    const fetchMock = mockFetch(sevenDays);
    const signal = new AbortController().signal;

    await fetchForecast('Lisbon', { signal });

    expect(geocodeMock).toHaveBeenCalledWith('Lisbon', { signal });
    expect(fetchMock.mock.calls[0][1]).toEqual({ signal });
  });
});
