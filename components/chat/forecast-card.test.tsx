import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ForecastCard } from './forecast-card';

const sampleData = {
  found: true as const,
  location: 'Barcelona, Spain',
  units: { temperature: '°C', precipitationChance: '%', windSpeed: 'km/h' },
  days: [
    {
      date: '2026-07-11',
      weekday: 'Saturday',
      maxTemp: 28,
      minTemp: 20,
      precipitationChance: 10,
      maxWindSpeed: 15,
    },
    {
      date: '2026-07-12',
      weekday: 'Sunday',
      maxTemp: 27,
      minTemp: 19,
      precipitationChance: 60,
      maxWindSpeed: 18,
    },
  ],
};

describe('ForecastCard', () => {
  it('shows location and each day using the weekday field verbatim', () => {
    render(<ForecastCard data={sampleData} />);

    expect(screen.getByText('Barcelona, Spain')).toBeInTheDocument();
    // Phase 6 regression: the card must show the real weekday, not a
    // recomputed one — so it renders the abbreviation of the given field.
    expect(screen.getByText('Sat')).toBeInTheDocument();
    expect(screen.getByText('Sun')).toBeInTheDocument();
  });

  it('shows each day\'s max temperature', () => {
    render(<ForecastCard data={sampleData} />);

    expect(screen.getByText('28°C')).toBeInTheDocument();
    expect(screen.getByText('27°C')).toBeInTheDocument();
  });
});
