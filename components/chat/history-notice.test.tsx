import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HistoryNotice as Notice } from '@/lib/history';
import { HistoryNotice } from './history-notice';

function renderNotice(notice: Notice | null) {
  const onDismiss = vi.fn();
  render(<HistoryNotice notice={notice} onDismiss={onDismiss} />);
  return onDismiss;
}

describe('HistoryNotice', () => {
  it('warns that the chat is getting long, with nothing to dismiss', () => {
    renderNotice({ kind: 'warn' });
    expect(screen.getByRole('status')).toHaveTextContent('This chat is getting long. Start a new one soon.');
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('names the chat deleted to stay under 30', () => {
    renderNotice({ kind: 'evicted', reason: 'limit', titles: ['Old trip'] });
    expect(screen.getByRole('status')).toHaveTextContent(
      'You can keep 30 chats, so I deleted the oldest one: “Old trip”.',
    );
  });

  // Possible when the list holds more than 30, e.g. after another tab saved.
  it('names every chat deleted to stay under 30', () => {
    renderNotice({ kind: 'evicted', reason: 'limit', titles: ['A', 'B'] });
    expect(screen.getByRole('status')).toHaveTextContent(
      'You can keep 30 chats, so I deleted the oldest ones: “A”, “B”.',
    );
  });

  it('names every chat deleted because storage was full', async () => {
    const onDismiss = renderNotice({ kind: 'evicted', reason: 'storage', titles: ['A', 'B'] });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Browser storage was full, so I deleted your oldest chats: “A”, “B”.',
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledWith('evicted');
  });

  it('says a save failed, with nothing to dismiss (it clears after a good save)', () => {
    renderNotice({ kind: 'save_failed' });
    expect(screen.getByRole('status')).toHaveTextContent(
      "Couldn't save this chat. Browser storage is full. Delete some chats to make room.",
    );
    expect(screen.queryByRole('button', { name: 'Dismiss' })).not.toBeInTheDocument();
  });

  it('says history is off, and lets the user dismiss it', async () => {
    const onDismiss = renderNotice({ kind: 'unavailable' });
    expect(screen.getByRole('status')).toHaveTextContent(
      'History is off in this browser. This chat will be gone when you close the page.',
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismiss).toHaveBeenCalledWith('unavailable');
  });

  // The live region stays mounted, so a screen reader hears each new notice.
  it('keeps an empty live region when there is nothing to say', () => {
    renderNotice(null);
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });
});
