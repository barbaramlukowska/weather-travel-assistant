import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WeatherCard } from './weather-card';

const sampleData = {
  found: true as const,
  location: 'Vienna, Austria',
  temperature: 24.4,
  feelsLike: 23.1,
  precipitation: 0,
  windSpeed: 12.3,
  units: { temperature: '°C', windSpeed: 'km/h' },
};

describe('WeatherCard', () => {
  it('shows location and rounded temperature with its unit', () => {
    render(<WeatherCard data={sampleData} />);

    expect(screen.getByText('Vienna, Austria')).toBeInTheDocument();
    expect(screen.getByText('24°C')).toBeInTheDocument();
  });

  it('shows feels-like and wind stats', () => {
    render(<WeatherCard data={sampleData} />);

    expect(screen.getByText('23°C')).toBeInTheDocument();
    expect(screen.getByText('12 km/h')).toBeInTheDocument();
  });
});
