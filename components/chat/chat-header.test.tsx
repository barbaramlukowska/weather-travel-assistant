import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatHeader } from './chat-header';

describe('ChatHeader memory button', () => {
  it('shows how many preferences are saved and toggles the panel', async () => {
    const onToggleMemory = vi.fn();
    render(
      <ChatHeader
        isDark={false}
        onToggleTheme={() => {}}
        memoryCount={2}
        isMemoryOpen={false}
        onToggleMemory={onToggleMemory}
      />,
    );
    const button = screen.getByRole('button', { name: 'Saved preferences (2)' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    await userEvent.setup().click(button);
    expect(onToggleMemory).toHaveBeenCalledTimes(1);
  });
});
