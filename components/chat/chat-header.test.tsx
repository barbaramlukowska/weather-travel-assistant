import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChatHeader } from './chat-header';

function renderHeader(props: Partial<ComponentProps<typeof ChatHeader>> = {}) {
  const handlers = { onToggleTheme: vi.fn(), onToggleMemory: vi.fn(), onOpenHistory: vi.fn() };
  render(
    <ChatHeader
      isDark={false}
      memoryCount={2}
      isMemoryOpen={false}
      isHistoryOpen={false}
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('ChatHeader memory button', () => {
  it('shows how many preferences are saved and toggles the panel', async () => {
    const { onToggleMemory } = renderHeader();
    const button = screen.getByRole('button', { name: 'Saved preferences (2)' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.setup().click(button);
    expect(onToggleMemory).toHaveBeenCalledTimes(1);
  });
});

describe('ChatHeader history button', () => {
  it('opens the chat history', async () => {
    const { onOpenHistory } = renderHeader();
    const button = screen.getByRole('button', { name: 'Chat history' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    // The closed drawer is not in the DOM, so nothing to point at.
    expect(button).not.toHaveAttribute('aria-controls');
    await userEvent.setup().click(button);
    expect(onOpenHistory).toHaveBeenCalledTimes(1);
  });

  it('points at the open drawer', () => {
    renderHeader({ isHistoryOpen: true });
    const button = screen.getByRole('button', { name: 'Chat history' });
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(button).toHaveAttribute('aria-controls', 'chat-history-drawer');
  });
});
