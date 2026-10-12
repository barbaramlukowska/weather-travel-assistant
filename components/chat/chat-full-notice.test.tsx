import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ChatFullNotice } from './chat-full-notice';

describe('ChatFullNotice', () => {
  it('explains the chat is full and starts a new one', async () => {
    const onNewChat = vi.fn();
    render(<ChatFullNotice onNewChat={onNewChat} />);
    expect(screen.getByRole('status')).toHaveTextContent(
      'This chat is full. Start a new one to keep going. This one stays here to read, and your saved preferences carry over.',
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Start a new chat' }));
    expect(onNewChat).toHaveBeenCalledTimes(1);
  });
});
