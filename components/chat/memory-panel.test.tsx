import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MemoryPanel } from './memory-panel';

function renderPanel(memory = {}) {
  const handlers = { onForget: vi.fn(), onClear: vi.fn(), onClose: vi.fn() };
  render(<MemoryPanel memory={memory} {...handlers} />);
  return handlers;
}

describe('MemoryPanel', () => {
  it('lists every saved fact with its label, in category order', () => {
    renderPanel({ avoid: 'crowds', homeCity: 'Kraków' });
    const region = screen.getByRole('region', { name: 'Saved preferences' });
    expect(region).toHaveTextContent(/Home city.*Kraków.*Things to avoid.*crowds/);
  });

  it('says so when nothing is saved, and offers no "Clear all"', () => {
    renderPanel();
    expect(screen.getByText(/Nothing saved yet/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
  });

  it('forgets a single row', async () => {
    const { onForget } = renderPanel({ homeCity: 'Kraków', climate: 'dislikes heat' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Forget climate' }));
    expect(onForget).toHaveBeenCalledWith('climate');
  });

  it('clears everything with one click', async () => {
    const { onClear } = renderPanel({ homeCity: 'Kraków' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Clear all' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('closes', async () => {
    const { onClose } = renderPanel();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Close saved preferences' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
