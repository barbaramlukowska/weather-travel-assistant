import { geocodeCity } from './geocode';
// Type-only on purpose: lib/tools.ts will import runtime code that depends on
// this module, so a runtime import back would create a cycle.
import type { ForecastOutput } from './tools';

// Shared by getForecast and the trip review. Always a full week: the model
// asked for too few days and missed the weekend.
export async function fetchForecast(
  city: string,
  init?: { signal?: AbortSignal },
): Promise<ForecastOutput> {
  try {
    const geo = await geocodeCity(city, init);
    if (!geo.found) {
      return { found: false, city };
    }

    const { latitude, longitude, name, country } = geo;

    const fRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
        `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max` +
        `&forecast_days=7&timezone=auto`,
      init,
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
    console.error('fetchForecast failed:', err);
    throw new Error('Forecast service unavailable');
  }
}
