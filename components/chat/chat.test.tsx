import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderToString } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function seedChat(id: string, question: string, answer: string) {
  const index = JSON.parse(localStorage.getItem('wta.chats.v1') ?? '[]');
  localStorage.setItem('wta.chats.v1', JSON.stringify([...index, { id, title: question, updatedAt: 1 }]));
  localStorage.setItem(
    `wta.chat.v1.${id}`,
    JSON.stringify([
      { id: `${id}-u`, role: 'user', parts: [{ type: 'text', text: question }] },
      { id: `${id}-a`, role: 'assistant', parts: [{ type: 'text', text: answer }] },
    ]),
  );
}

// A fresh store per test: it keeps its state in the module, like a page.
async function loadChat() {
  vi.resetModules();
  return (await import('./chat')).Chat;
}

beforeEach(() => {
  localStorage.clear();
  seedChat('a', 'Weather in Kraków', 'Sunny, 21°C.');
  seedChat('b', 'Trip to Rome', 'Rome: 25°C all week.');
  localStorage.setItem('wta.chats.active.v1', 'a');
});

describe('Chat frame', () => {
  // The same layout as after hydration, empty: nothing jumps once the
  // stored chat appears.
  it('renders an empty skeleton on the server, with the composer off', async () => {
    const Chat = await loadChat();
    const html = renderToString(<Chat />);
    expect(html).toContain('Where are we exploring today?');
    expect(html).not.toContain('Sunny, 21°C.');
    // Parsed, not matched with a regex: the input always has the class
    // `disabled:opacity-60`, which satisfies /<input[^>]*disabled/ even when
    // the composer is enabled.
    const container = document.createElement('div');
    container.innerHTML = html;
    expect(container.querySelector('input[aria-label="Message"]')).toBeDisabled();
  });

  it('reopens the last open chat after a reload', async () => {
    const Chat = await loadChat();
    render(<Chat />);
    expect(await screen.findByText('Sunny, 21°C.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Weather in Kraków' })).toHaveAttribute('aria-current', 'true');
  });

  it('opens a chat from the drawer, closes it and focuses the composer', async () => {
    const user = userEvent.setup();
    const Chat = await loadChat();
    render(<Chat />);

    await user.click(screen.getByRole('button', { name: 'Chat history' }));
    const drawer = screen.getByRole('dialog', { name: 'Chat history' });
    // The sidebar is in the DOM too (jsdom applies no CSS), so look inside
    // the drawer only.
    await user.click(within(drawer).getByRole('button', { name: 'Trip to Rome' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Rome: 25°C all week.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveFocus();
  });

  it('closes the drawer with its close button', async () => {
    const user = userEvent.setup();
    const Chat = await loadChat();
    render(<Chat />);

    await user.click(screen.getByRole('button', { name: 'Chat history' }));
    await user.click(screen.getByRole('button', { name: 'Close chat history' }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chat history' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('starts a new chat and focuses the composer', async () => {
    const user = userEvent.setup();
    const Chat = await loadChat();
    render(<Chat />);
    await screen.findByText('Sunny, 21°C.');

    await user.click(screen.getByRole('button', { name: 'New chat' }));

    expect(screen.getByText('Where are we exploring today?')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Weather in Kraków' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveFocus();
  });

  // Deleting the open chat must not leave its key to be saved back.
  it('starts a new chat when the open one is deleted', async () => {
    const user = userEvent.setup();
    const Chat = await loadChat();
    render(<Chat />);
    await screen.findByText('Sunny, 21°C.');

    await user.click(screen.getByRole('button', { name: 'Delete chat: Weather in Kraków' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByText('Where are we exploring today?')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Weather in Kraków' })).not.toBeInTheDocument();
    expect(localStorage.getItem('wta.chat.v1.a')).toBeNull();
  });

  it('deletes all chats but keeps saved preferences', async () => {
    localStorage.setItem('wta.memory.v2', '{"climate":{"maxComfortC":28}}');
    const user = userEvent.setup();
    const Chat = await loadChat();
    render(<Chat />);
    await screen.findByText('Sunny, 21°C.');

    await user.click(screen.getByRole('button', { name: 'Delete all chats' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    expect(screen.getByText('No chats yet. Your conversations will show up here.')).toBeInTheDocument();
    expect(localStorage.getItem('wta.memory.v2')).toBe('{"climate":{"maxComfortC":28}}');
  });
});
