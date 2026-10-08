import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MemoryCard } from './memory-card';

describe('MemoryCard', () => {
  it('shows what was remembered, with its category', () => {
    render(
      <MemoryCard
        data={{
          saved: true,
          category: 'travelParty',
          value: { withPartner: true, childrenAges: [3], pets: [] },
        }}
      />,
    );
    expect(screen.getByText('Remembered:')).toBeInTheDocument();
    expect(screen.getByText('Travel party — with a partner; children aged 3')).toBeInTheDocument();
  });

  // Without the label "crowds, heat" does not say whether these are liked or avoided.
  it('tells interests and things to avoid apart', () => {
    render(<MemoryCard data={{ saved: true, category: 'avoid', value: ['crowds', 'long-walks'] }} />);
    expect(screen.getByText('Things to avoid — crowds, long walks')).toBeInTheDocument();
  });

  it('shows which category was forgotten', () => {
    render(<MemoryCard data={{ removed: true, category: 'homeCity' }} />);
    expect(screen.getByText('Forgot:')).toBeInTheDocument();
    expect(screen.getByText('home city')).toBeInTheDocument();
  });

  it('shows a saved note', () => {
    render(<MemoryCard data={{ saved: true, category: 'notes', value: { text: 'vegetarian' } }} />);
    expect(screen.getByText('Note — vegetarian')).toBeInTheDocument();
    expect(screen.queryByText(/Forgot the oldest/)).not.toBeInTheDocument();
  });

  it('says which note fell out to make room', () => {
    render(
      <MemoryCard
        data={{ saved: true, category: 'notes', value: { text: 'jazz cafés' }, dropped: 'vegetarian' }}
      />,
    );
    expect(screen.getByText('Forgot the oldest: "vegetarian"')).toBeInTheDocument();
  });

  it('shows which note was forgotten', () => {
    render(<MemoryCard data={{ removed: true, category: 'notes', note: 'vegetarian' }} />);
    expect(screen.getByText('Forgot:')).toBeInTheDocument();
    expect(screen.getByText('note "vegetarian"')).toBeInTheDocument();
  });
});
