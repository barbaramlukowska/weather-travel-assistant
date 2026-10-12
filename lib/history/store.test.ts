import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatUIMessage } from '../tools';

type Store = typeof import('./store');

// The store keeps state in the module (active chat, broken ids, the storage
// probe), which outlives localStorage.clear(). A fresh import per test is a
// page reload.
async function loadStore(): Promise<Store> {
  vi.resetModules();
  return import('./store');
}

const INDEX = 'wta.chats.v1';
const ACTIVE = 'wta.chats.active.v1';
const chatKey = (id: string) => `wta.chat.v1.${id}`;
const originalSetItem = Storage.prototype.setItem;

const ask = (text: string): ChatUIMessage[] => [{ id: 'u1', role: 'user', parts: [{ type: 'text', text }] }];

// Appends, so a chat seeded later counts as older (the list is newest first).
function seedChat(id: string, title: string, messages: unknown = ask(title), updatedAt = 1) {
  const index = JSON.parse(localStorage.getItem(INDEX) ?? '[]');
  localStorage.setItem(INDEX, JSON.stringify([...index, { id, title, updatedAt }]));
  localStorage.setItem(chatKey(id), JSON.stringify(messages));
}

// Every write throws, as when the quota is used up. Call after the first
// store call, which runs the storage probe.
function storageIsFull() {
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('active chat', () => {
  it('stays the same object between calls', async () => {
    const store = await loadStore();
    expect(store.getActiveChat()).toBe(store.getActiveChat());
  });

  it('reopens the last open chat after a reload', async () => {
    seedChat('a', 'Weather in Kraków');
    localStorage.setItem(ACTIVE, 'a');
    const store = await loadStore();
    expect(store.getActiveChat()).toEqual({ id: 'a', initialMessages: ask('Weather in Kraków') });
  });

  it('starts a draft when the stored id is not on the list', async () => {
    localStorage.setItem(ACTIVE, 'ghost');
    const store = await loadStore();
    const active = store.getActiveChat();
    expect(active.id).not.toBe('ghost');
    expect(active.initialMessages).toEqual([]);
  });

  it('lists a draft only after its first save', async () => {
    const store = await loadStore();
    const { id } = store.getActiveChat();
    expect(store.readIndex()).toEqual([]);

    store.saveChat(id, ask('Weather in Kraków?'));
    expect(store.readIndex()).toEqual([
      { id, title: 'Weather in Kraków?', updatedAt: expect.any(Number), broken: false },
    ]);
  });

  // The first visit has no stored active id. The first save must store it,
  // or F5 would throw the user out of the chat they just started.
  it('keeps the draft id through the first save and a reload', async () => {
    const store = await loadStore();
    const { id } = store.getActiveChat();
    store.saveChat(id, ask('Weather in Kraków?'));

    const reloaded = await loadStore();
    expect(reloaded.getActiveChat().id).toBe(id);
  });

  it('ignores another tab opening a chat', async () => {
    seedChat('a', 'A');
    seedChat('b', 'B');
    localStorage.setItem(ACTIVE, 'a');
    const store = await loadStore();
    const onChange = vi.fn();
    const unsubscribe = store.subscribeHistory(onChange);
    store.getActiveChat();

    localStorage.setItem(ACTIVE, 'b');
    window.dispatchEvent(new StorageEvent('storage', { key: ACTIVE }));

    expect(onChange).not.toHaveBeenCalled();
    expect(store.getActiveChat().id).toBe('a');
    unsubscribe();
  });

  it('keeps an empty draft on "New chat"', async () => {
    const store = await loadStore();
    const { id } = store.getActiveChat();
    store.startNewChat();
    expect(store.getActiveChat().id).toBe(id);
  });

  it('opens a chat from the list', async () => {
    seedChat('a', 'Trip to Rome');
    const store = await loadStore();
    store.openChat('a');
    expect(store.getActiveChat()).toEqual({ id: 'a', initialMessages: ask('Trip to Rome') });
    expect(localStorage.getItem(ACTIVE)).toBe('a');
  });
});

describe('saving and reading', () => {
  it('round-trips messages with tool parts exactly', async () => {
    const messages = [
      ...ask('Weather in Lisbon?'),
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'step-start' },
          {
            type: 'tool-getWeather',
            toolCallId: 'call-1',
            state: 'output-available',
            input: { city: 'Lisbon' },
            output: { found: true, city: 'Lisbon', country: 'Portugal', temperature: 21 },
          },
          { type: 'text', text: 'Sunny, 21°C.', state: 'done' },
        ],
      },
    ] as unknown as ChatUIMessage[];
    const store = await loadStore();
    const { id } = store.getActiveChat();
    store.saveChat(id, messages);

    const reloaded = await loadStore();
    expect(reloaded.readChat(id)).toEqual(messages);
  });

  it('puts the chat saved last at the top', async () => {
    const store = await loadStore();
    store.saveChat('a', ask('A'));
    store.saveChat('b', ask('B'));
    store.saveChat('a', ask('A'));
    expect(store.readIndex().map((chat) => chat.id)).toEqual(['a', 'b']);
  });

  it('deletes the oldest chat to make room for a 31st and names it', async () => {
    for (let i = 0; i < 30; i++) seedChat(`c${i}`, `Chat ${i}`);
    const store = await loadStore();
    const { id } = store.getActiveChat();

    const result = store.saveChat(id, ask('One more'));

    expect(result).toEqual({ ok: true, evicted: { reason: 'limit', titles: ['Chat 29'] } });
    expect(store.readIndex()).toHaveLength(30);
    expect(localStorage.getItem(chatKey('c29'))).toBeNull();
    expect(store.getHistoryStatus().evicted).toEqual({ reason: 'limit', titles: ['Chat 29'] });
  });

  it('marks a chat that fails validation as broken and opens a draft, keeping its data', async () => {
    seedChat('a', 'Broken', [{ role: 'user' }]);
    localStorage.setItem(ACTIVE, 'a');
    const store = await loadStore();

    expect(store.getActiveChat().id).not.toBe('a');
    expect(store.readIndex()[0]).toMatchObject({ id: 'a', broken: true });
    expect(localStorage.getItem(chatKey('a'))).toBe(JSON.stringify([{ role: 'user' }]));
  });

  // A chat that passes the schema but throws while rendering would otherwise
  // reopen after every F5 and land on the error screen again.
  it('does not reopen a chat marked broken after a reload', async () => {
    seedChat('a', 'Crashes the render');
    localStorage.setItem(ACTIVE, 'a');
    let store = await loadStore();
    const crashed = store.getActiveChat();

    store.markChatBroken('a');

    // No switch in this tab: the error screen stays until the user acts.
    expect(store.getActiveChat()).toBe(crashed);
    expect(localStorage.getItem(ACTIVE)).toBeNull();
    store = await loadStore();
    expect(store.getActiveChat().id).not.toBe('a');
    expect(localStorage.getItem(chatKey('a'))).not.toBeNull();
  });

  it('keeps the active chat when a different chat is marked broken', async () => {
    seedChat('a', 'Open');
    localStorage.setItem(ACTIVE, 'a');
    const store = await loadStore();
    store.getActiveChat();

    store.markChatBroken('b');

    expect(localStorage.getItem(ACTIVE)).toBe('a');
  });

  // Validating up to 30 × 62K characters on every render would be slow; full
  // validation waits until a chat is opened.
  it('checks only that each chat key exists when listing', async () => {
    seedChat('a', 'Garbage inside');
    localStorage.setItem(chatKey('a'), '{not json');
    seedChat('b', 'Gone');
    localStorage.removeItem(chatKey('b'));
    const store = await loadStore();

    expect(store.readIndex().map((chat) => chat.broken)).toEqual([false, true]);
  });

  // getItem would copy each chat's whole body (up to ~62K characters) into JS
  // just to see that it exists, on every render.
  it('does not read chat bodies when listing', async () => {
    seedChat('a', 'A');
    seedChat('b', 'B');
    const store = await loadStore();
    store.getActiveChat();
    const getItem = vi.spyOn(Storage.prototype, 'getItem');

    store.readIndex();

    expect(getItem.mock.calls.map(([key]) => key)).not.toContain(chatKey('a'));
    expect(getItem.mock.calls.map(([key]) => key)).not.toContain(chatKey('b'));
  });

  it('starts a draft when a chat turns out broken on opening', async () => {
    seedChat('a', 'Garbage inside');
    localStorage.setItem(chatKey('a'), '{not json');
    const store = await loadStore();
    const draft = store.getActiveChat();

    store.openChat('a');

    expect(store.getActiveChat().id).not.toBe('a');
    expect(store.getActiveChat().id).not.toBe(draft.id);
    expect(store.readIndex()[0]).toMatchObject({ id: 'a', broken: true });
  });

  it('skips a bad or repeated entry instead of dropping the whole list', async () => {
    localStorage.setItem(
      INDEX,
      JSON.stringify([
        { id: 'a', title: 'A', updatedAt: 2 },
        { id: 5 },
        { id: 'b', title: 'B', updatedAt: 1 },
        { id: 'a', title: 'A again', updatedAt: 0 },
      ]),
    );
    localStorage.setItem(chatKey('a'), '[]');
    localStorage.setItem(chatKey('b'), '[]');
    const store = await loadStore();
    expect(store.readIndex().map((chat) => chat.title)).toEqual(['A', 'B']);
  });

  it('survives a list that is not an array', async () => {
    localStorage.setItem(INDEX, '{"id":"a"}');
    const store = await loadStore();
    expect(store.readIndex()).toEqual([]);
  });

  // useSyncExternalStore compares snapshots by reference.
  it('returns the same list while storage is unchanged', async () => {
    seedChat('a', 'A');
    const store = await loadStore();
    expect(store.readIndex()).toBe(store.readIndex());
  });

  it('follows the list when another tab saves', async () => {
    const store = await loadStore();
    const onChange = vi.fn();
    const unsubscribe = store.subscribeHistory(onChange);
    expect(store.readIndex()).toEqual([]);

    seedChat('a', 'From the other tab');
    window.dispatchEvent(new StorageEvent('storage', { key: INDEX }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(store.readIndex()[0]).toMatchObject({ title: 'From the other tab' });
    unsubscribe();
  });
});

describe('storage limits', () => {
  it('deletes the oldest other chat when storage is full, then retries', async () => {
    seedChat('b', 'Newer');
    seedChat('a', 'Oldest');
    const store = await loadStore();
    const { id } = store.getActiveChat();
    let failures = 1;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (failures-- > 0) throw new DOMException('full', 'QuotaExceededError');
      originalSetItem.call(this, key, value);
    });

    const result = store.saveChat(id, ask('New'));

    expect(result).toEqual({ ok: true, evicted: { reason: 'storage', titles: ['Oldest'] } });
    expect(store.readIndex().map((chat) => chat.id)).toEqual([id, 'b']);
  });

  it('gives up after five deletions and leaves no orphan behind', async () => {
    for (let i = 0; i < 6; i++) seedChat(`c${i}`, `Chat ${i}`);
    const store = await loadStore();
    const { id } = store.getActiveChat();
    storageIsFull();

    expect(store.saveChat(id, ask('New'))).toEqual({ ok: false, reason: 'full' });

    expect(localStorage.getItem(chatKey(id))).toBeNull();
    const chatKeys = Object.keys(localStorage).filter((key) => key.startsWith('wta.chat.v1.'));
    expect(chatKeys).toHaveLength(1);
    expect(store.getHistoryStatus().saveFailedChatId).toBe(id);
  });

  // The chat being saved holds the messages just typed, so eviction must never delete it.
  it('never deletes the chat it is saving, even when storage stays full', async () => {
    seedChat('a', 'Open chat');
    localStorage.setItem(ACTIVE, 'a');
    const store = await loadStore();
    store.getActiveChat();
    storageIsFull();

    expect(store.saveChat('a', [...ask('Open chat'), ...ask('Follow-up')])).toEqual({
      ok: false,
      reason: 'full',
    });
    expect(localStorage.getItem(chatKey('a'))).toBe(JSON.stringify(ask('Open chat')));
  });

  // The chat-key write goes through and only the list write hits the quota.
  // storageIsFull() cannot reach this branch: it fails the chat-key write first.
  function listWriteFails() {
    return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === INDEX) throw new DOMException('full', 'QuotaExceededError');
      originalSetItem.call(this, key, value);
    });
  }

  // A failed save still deletes chats on its way. Two failures in a row must
  // not hide the first one's victims behind the second's.
  it('keeps the titles of chats deleted by an earlier failed save', async () => {
    seedChat('a', 'First victim');
    const store = await loadStore();
    const { id } = store.getActiveChat();
    storageIsFull();

    store.saveChat(id, ask('New'));
    // seedChat writes through the mocked setItem, so put the chat in by hand.
    originalSetItem.call(localStorage, INDEX, JSON.stringify([{ id: 'b', title: 'Second victim', updatedAt: 1 }]));
    originalSetItem.call(localStorage, chatKey('b'), JSON.stringify(ask('Second victim')));
    store.saveChat(id, ask('New again'));

    expect(store.getHistoryStatus().evicted?.titles).toEqual(['First victim', 'Second victim']);
  });

  // A new chat whose list entry did not fit
  // would stay behind as a key nobody can see or delete.
  it('removes the key of a new chat when only the list write fails', async () => {
    const store = await loadStore();
    const { id } = store.getActiveChat();
    listWriteFails();

    expect(store.saveChat(id, ask('New'))).toEqual({ ok: false, reason: 'full' });

    expect(localStorage.getItem(chatKey(id))).toBeNull();
  });

  // The other side of the same rule: an existing chat is the user's data, so
  // a failed list write must never delete its key.
  it('keeps the key and the list entry of an existing chat when only the list write fails', async () => {
    seedChat('a', 'Open chat');
    localStorage.setItem(ACTIVE, 'a');
    const store = await loadStore();
    store.getActiveChat();
    listWriteFails();

    const followUp = [...ask('Open chat'), ...ask('Follow-up')];
    expect(store.saveChat('a', followUp)).toEqual({ ok: false, reason: 'full' });

    // The chat-key write succeeded, so the key holds the new messages.
    expect(localStorage.getItem(chatKey('a'))).toBe(JSON.stringify(followUp));
    expect(store.readIndex().map((chat) => chat.id)).toEqual(['a']);
  });

  it('clears the failure once a save goes through', async () => {
    const store = await loadStore();
    const { id } = store.getActiveChat();
    const full = storageIsFull();
    store.saveChat(id, ask('New'));
    full.mockRestore();

    expect(store.saveChat(id, ask('New'))).toEqual({ ok: true });
    expect(store.getHistoryStatus().saveFailedChatId).toBeNull();
  });

  it('turns history off when the storage probe fails', async () => {
    storageIsFull();
    const store = await loadStore();

    expect(store.getHistoryStatus().available).toBe(false);
    expect(store.readIndex()).toBe(store.EMPTY_INDEX);
    expect(store.saveChat(store.getActiveChat().id, ask('Hi'))).toEqual({
      ok: false,
      reason: 'unavailable',
    });
  });

  it('works without window, as during a server render', async () => {
    const store = await loadStore();
    vi.stubGlobal('window', undefined);

    expect(store.readIndex()).toBe(store.EMPTY_INDEX);
    expect(store.getHistoryStatus()).toBe(store.SERVER_STATUS);
    expect(store.saveChat('a', ask('Hi'))).toEqual({ ok: false, reason: 'unavailable' });
  });

  // The risk the spec names: "New chat" with storage blocked drops the chat.
  // It must still work — the notice warned the user about exactly this.
  it('starts a new chat after the first message even with history off', async () => {
    storageIsFull();
    const store = await loadStore();
    const { id } = store.getActiveChat();
    store.saveChat(id, ask('Hi'));

    store.startNewChat();

    expect(store.getActiveChat().id).not.toBe(id);
  });
});

describe('deleting', () => {
  // Deleting the open chat must switch to a draft, or its next save would bring it back.
  it('switches to a new draft when the open chat is deleted', async () => {
    seedChat('a', 'Open chat');
    localStorage.setItem(ACTIVE, 'a');
    const store = await loadStore();
    store.getActiveChat();

    store.deleteChat('a');

    expect(store.getActiveChat().id).not.toBe('a');
    expect(store.readIndex()).toEqual([]);
    expect(localStorage.getItem(chatKey('a'))).toBeNull();
  });

  it('deletes another chat without leaving the open one', async () => {
    seedChat('a', 'Open chat');
    seedChat('b', 'Other');
    localStorage.setItem(ACTIVE, 'a');
    const store = await loadStore();

    store.deleteChat('b');

    expect(store.getActiveChat().id).toBe('a');
    expect(store.readIndex().map((chat) => chat.id)).toEqual(['a']);
  });

  it('deletes every chat key, orphans included, but never preferences', async () => {
    seedChat('a', 'A');
    localStorage.setItem(chatKey('orphan'), '[]');
    localStorage.setItem('wta.memory.v2', '{"climate":{"maxComfortC":28}}');
    const store = await loadStore();

    store.clearHistory();

    expect(Object.keys(localStorage).filter((key) => key.startsWith('wta.chat.v1.'))).toEqual([]);
    expect(localStorage.getItem(INDEX)).toBeNull();
    expect(localStorage.getItem('wta.memory.v2')).toBe('{"climate":{"maxComfortC":28}}');
    expect(store.readIndex()).toEqual([]);
  });
});

describe('notices', () => {
  it('drops notices about the previous chat when another one opens', async () => {
    for (let i = 0; i < 30; i++) seedChat(`c${i}`, `Chat ${i}`);
    const store = await loadStore();
    store.saveChat(store.getActiveChat().id, ask('One more'));
    expect(store.getHistoryStatus().evicted).not.toBeNull();

    store.openChat('c0');

    expect(store.getHistoryStatus().evicted).toBeNull();
  });

  it('remembers a dismissed "history is off" for the rest of the page life', async () => {
    storageIsFull();
    const store = await loadStore();
    store.dismissNotice('unavailable');
    store.saveChat(store.getActiveChat().id, ask('Hi'));
    expect(store.getHistoryStatus()).toMatchObject({ available: false, unavailableDismissed: true });
  });

  it('hides a dismissed eviction until the next one', async () => {
    for (let i = 0; i < 30; i++) seedChat(`c${i}`, `Chat ${i}`);
    const store = await loadStore();
    store.saveChat('new-1', ask('One more'));
    store.dismissNotice('evicted');
    expect(store.getHistoryStatus().evicted).toBeNull();

    store.saveChat('new-2', ask('And another'));
    expect(store.getHistoryStatus().evicted).toEqual({ reason: 'limit', titles: ['Chat 28'] });
  });
});
