import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TripPlanCard } from './trip-plan-card';

const sampleData = {
  found: true as const,
  city: 'Lisbon, Portugal',
  summary: 'Expect pleasant weather with temperatures around 24-25°C.',
  packingList: ['sunscreen', 'light jacket', 'comfortable shoes'],
};

describe('TripPlanCard', () => {
  it('shows the city, summary, and every packing item', () => {
    render(<TripPlanCard data={sampleData} />);

    expect(screen.getByText('Lisbon, Portugal')).toBeInTheDocument();
    expect(screen.getByText(sampleData.summary)).toBeInTheDocument();
    for (const item of sampleData.packingList) {
      expect(screen.getByText(item)).toBeInTheDocument();
    }
  });
});
