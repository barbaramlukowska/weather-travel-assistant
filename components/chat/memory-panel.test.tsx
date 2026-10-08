import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Memory } from '@/lib/memory';
import { MemoryPanel } from './memory-panel';

const KRAKOW = { name: 'Kraków', country: 'Poland' };

function renderPanel(memory: Memory = {}) {
  const handlers = { onForget: vi.fn(), onForgetNote: vi.fn(), onClear: vi.fn(), onClose: vi.fn() };
  render(<MemoryPanel memory={memory} {...handlers} />);
  return handlers;
}

describe('MemoryPanel', () => {
  it('lists every saved fact in the formatter\'s words, in category order', () => {
    renderPanel({ avoid: ['crowds', 'long-walks'], homeCity: KRAKOW });
    const region = screen.getByRole('region', { name: 'Saved preferences' });
    expect(region).toHaveTextContent(/Home city.*Kraków, Poland.*Things to avoid.*crowds, long walks/);
  });

  it('says so when nothing is saved, and offers no "Clear all"', () => {
    renderPanel();
    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
  });

  it('forgets a single row', async () => {
    const { onForget } = renderPanel({ homeCity: KRAKOW, climate: { maxComfortC: 28 } });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Forget climate' }));
    expect(onForget).toHaveBeenCalledWith('climate');
  });

  it('clears everything with one click', async () => {
    const { onClear } = renderPanel({ homeCity: KRAKOW });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('closes', async () => {
    const { onClose } = renderPanel();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close saved preferences' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('lists notes in their own section, after the categories', () => {
    renderPanel({ homeCity: KRAKOW, notes: ['vegetarian', 'prefers quiet cafés'] });
    const region = screen.getByRole('region', { name: 'Saved preferences' });
    expect(region).toHaveTextContent(/Home city.*Kraków, Poland.*Notes.*vegetarian.*prefers quiet cafés/);
  });

  it('forgets a single note', async () => {
    const { onForgetNote } = renderPanel({ notes: ['vegetarian'] });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Forget note: vegetarian' }));
    expect(onForgetNote).toHaveBeenCalledWith('vegetarian');
  });

  it('offers "Clear all" when only notes are saved', () => {
    renderPanel({ notes: ['vegetarian'] });
    expect(screen.queryByText(/Nothing saved yet/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear all' })).toBeInTheDocument();
  });
});
