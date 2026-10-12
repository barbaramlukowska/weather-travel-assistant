import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function Boom(): never {
  throw new Error('A card could not render this output');
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('wta.chats.v1', JSON.stringify([{ id: 'a', title: 'Trip to Rome', updatedAt: 1 }]));
  localStorage.setItem('wta.chat.v1.a', '[]');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ChatErrorBoundary', () => {
  // Valid in shape, broken in content: without the boundary the page would
  // crash after every F5, because the active chat id is stored.
  it('shows a way out and marks the chat as broken', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.resetModules();
    const { ChatErrorBoundary } = await import('./chat-error-boundary');
    const { readIndex } = await import('@/lib/history');
    const onStartNew = vi.fn();

    render(
      <ChatErrorBoundary chatId="a" onStartNew={onStartNew}>
        <Boom />
      </ChatErrorBoundary>,
    );

    expect(screen.getByText("This chat can't be shown.")).toBeInTheDocument();
    expect(readIndex()[0]).toMatchObject({ id: 'a', broken: true });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Start a new chat' }));
    expect(onStartNew).toHaveBeenCalledTimes(1);
  });
});
