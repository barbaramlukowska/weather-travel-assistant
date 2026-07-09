import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AirQualityCard } from './air-quality-card';

function makeData(usAqi: number) {
  return {
    found: true as const,
    location: 'Delhi, India',
    usAqi,
    pm25: 42.7,
    pm10: 58.2,
    europeanAqi: 60,
  };
}

describe('AirQualityCard', () => {
  it('shows location, AQI value, and PM stats', () => {
    render(<AirQualityCard data={makeData(75)} />);

    expect(screen.getByText('Delhi, India')).toBeInTheDocument();
    expect(screen.getByText('75')).toBeInTheDocument();
    expect(screen.getByText('43 µg/m³')).toBeInTheDocument();
    expect(screen.getByText('58 µg/m³')).toBeInTheDocument();
  });

  // The label at each boundary is what the model is told in its tool
  // description — a mismatch here means the UI contradicts the system prompt.
  it.each([
    [50, 'Good'],
    [51, 'Moderate'],
    [100, 'Moderate'],
    [101, 'Unhealthy (sensitive)'],
    [150, 'Unhealthy (sensitive)'],
    [151, 'Unhealthy'],
  ])('labels AQI %i as "%s"', (usAqi, label) => {
    render(<AirQualityCard data={makeData(usAqi)} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
