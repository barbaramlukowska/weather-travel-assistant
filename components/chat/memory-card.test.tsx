import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryCard } from './memory-card';

describe('MemoryCard', () => {
  it('shows what was remembered', () => {
    render(
      <MemoryCard data={{ saved: true, category: 'travelParty', value: 'travels with a 3-year-old' }} />,
    );
    expect(screen.getByText('Remembered:')).toBeInTheDocument();
    expect(screen.getByText('travels with a 3-year-old')).toBeInTheDocument();
  });

  it('shows which category was forgotten', () => {
    render(<MemoryCard data={{ removed: true, category: 'homeCity' }} />);
    expect(screen.getByText('Forgot:')).toBeInTheDocument();
    expect(screen.getByText('home city')).toBeInTheDocument();
  });
});
