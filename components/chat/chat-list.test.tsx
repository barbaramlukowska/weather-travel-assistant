import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ChatListItem } from '@/lib/history';
import { ChatList } from './chat-list';

const CHATS: ChatListItem[] = [
  { id: 'a', title: 'Weather in Kraków', updatedAt: 2, broken: false },
  { id: 'b', title: 'Trip to Rome', updatedAt: 1, broken: false },
];

function renderList(props: Partial<ComponentProps<typeof ChatList>> = {}) {
  const handlers = { onOpen: vi.fn(), onNew: vi.fn(), onDelete: vi.fn(), onDeleteAll: vi.fn() };
  render(<ChatList chats={CHATS} activeId="a" isBusy={false} isAvailable {...handlers} {...props} />);
  return handlers;
}

describe('ChatList', () => {
  it('lists chats newest first and marks the open one', () => {
    renderList();
    expect(screen.getByRole('navigation', { name: 'Chat history' })).toHaveTextContent(
      /Weather in Kraków.*Trip to Rome/,
    );
    expect(screen.getByRole('button', { name: 'Weather in Kraków' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: 'Trip to Rome' })).not.toHaveAttribute('aria-current');
  });

  it('opens a chat and starts a new one', async () => {
    const user = userEvent.setup();
    const { onOpen, onNew } = renderList();
    await user.click(screen.getByRole('button', { name: 'Trip to Rome' }));
    await user.click(screen.getByRole('button', { name: 'New chat' }));
    expect(onOpen).toHaveBeenCalledWith('b');
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  // Unmounting useChat stops the reply, so switching mid-reply would cut it off.
  it('locks everything while a reply is coming, and says why', () => {
    renderList({ isBusy: true });
    expect(screen.getByText('Wait for the reply to finish.')).toBeInTheDocument();
    for (const name of ['New chat', 'Weather in Kraków', 'Delete chat: Trip to Rome', 'Delete all chats']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });

  it('shows a broken chat that can only be deleted', () => {
    renderList({ chats: [{ ...CHATS[0], broken: true }] });
    expect(screen.getByText("Can't be opened")).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Weather in Kraków' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete chat: Weather in Kraków' })).toBeEnabled();
  });

  it('asks before deleting a chat, with focus on Cancel', async () => {
    const user = userEvent.setup();
    const { onDelete } = renderList();
    await user.click(screen.getByRole('button', { name: 'Delete chat: Trip to Rome' }));

    expect(screen.getByText('Delete this chat?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDelete).toHaveBeenCalledWith('b');
  });

  // The confirmed row goes away with the focused button; keyboard users must
  // not land on <body>.
  it('moves focus to "New chat" after deleting a chat', async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole('button', { name: 'Delete chat: Trip to Rome' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('button', { name: 'New chat' })).toHaveFocus();
  });

  it('moves focus to "New chat" after deleting all chats', async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole('button', { name: 'Delete all chats' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(screen.getByRole('button', { name: 'New chat' })).toHaveFocus();
  });

  it('brings the row back on Cancel, with focus on its delete button', async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole('button', { name: 'Delete chat: Trip to Rome' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.getByRole('button', { name: 'Trip to Rome' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete chat: Trip to Rome' })).toHaveFocus();
  });

  it('asks before deleting all chats and says preferences stay', async () => {
    const user = userEvent.setup();
    const { onDeleteAll } = renderList();
    await user.click(screen.getByRole('button', { name: 'Delete all chats' }));

    expect(screen.getByText('Delete all 2 chats? Saved preferences stay.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onDeleteAll).toHaveBeenCalledTimes(1);
  });

  it('says when there are no chats yet, and offers no "Delete all chats"', () => {
    renderList({ chats: [] });
    expect(screen.getByText('No chats yet. Your conversations will show up here.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete all chats' })).not.toBeInTheDocument();
  });

  it('says when history is off, without claiming chats are stored', () => {
    renderList({ chats: [], isAvailable: false });
    expect(screen.getByText('History is off in this browser.')).toBeInTheDocument();
    expect(screen.queryByText('Chats are stored only in this browser.')).not.toBeInTheDocument();
  });

  it('says where chats are kept', () => {
    renderList();
    expect(screen.getByText('Chats are stored only in this browser.')).toBeInTheDocument();
  });
});
