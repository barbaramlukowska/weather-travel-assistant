import { act, render, screen } from '@testing-library/react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Fresh modules per test: the store keeps its state in the module.
async function load() {
  vi.resetModules();
  const hooks = await import('./use-history');
  const store = await import('@/lib/history');
  function Probe() {
    const active = hooks.useActiveChat();
    const chats = hooks.useHistory();
    const status = hooks.useHistoryStatus();
    return (
      <span data-testid="probe">
        {active ? `${active.id}:${chats.length}:${status.available}` : 'skeleton'}
      </span>
    );
  }
  return { Probe, store };
}

function seedOpenChat() {
  localStorage.setItem('wta.chats.v1', JSON.stringify([{ id: 'a', title: 'Hi', updatedAt: 1 }]));
  localStorage.setItem(
    'wta.chat.v1.a',
    JSON.stringify([{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] }]),
  );
  localStorage.setItem('wta.chats.active.v1', 'a');
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('history hooks', () => {
  it('render the skeleton on the server', async () => {
    seedOpenChat();
    const { Probe } = await load();
    expect(renderToString(<Probe />)).toContain('skeleton');
  });

  // The server snapshot (no active chat) keeps the server HTML and the first
  // client render identical; the stored chat appears right after hydration.
  it('hydrate without errors, then show the open chat', async () => {
    seedOpenChat();
    const { Probe } = await load();
    const container = document.createElement('div');
    container.innerHTML = renderToString(<Probe />);
    document.body.append(container);
    const error = vi.spyOn(console, 'error');

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, <Probe />);
    });

    expect(error).not.toHaveBeenCalled();
    expect(container).toHaveTextContent('a:1:true');
    act(() => root?.unmount());
    container.remove();
  });

  it('re-render when a chat is saved', async () => {
    const { Probe, store } = await load();
    render(<Probe />);
    const { id } = store.getActiveChat();
    act(() => {
      store.saveChat(id, [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] }]);
    });
    expect(screen.getByTestId('probe')).toHaveTextContent(`${id}:1:true`);
  });
});
