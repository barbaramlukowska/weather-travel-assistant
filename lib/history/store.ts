import { generateId } from 'ai';
import type { ChatUIMessage } from '../tools';
import { chatIndexEntrySchema, storedMessagesSchema, type ChatIndexEntry } from './schema';
import { chatTitle } from './title';

// Versioned keys, like wta.memory.v2: a new format gets new keys instead of
// misreading old data. A list plus one key per chat, so a save rewrites one
// chat, not the whole history.
export const INDEX_KEY = 'wta.chats.v1';
export const CHAT_KEY_PREFIX = 'wta.chat.v1.';
export const ACTIVE_KEY = 'wta.chats.active.v1';
const PROBE_KEY = 'wta.probe';

// The localStorage quota is shared with preference memory, and a full
// history must never leave `remember` without room. No separate character
// budget: the composer closes a chat before ~62K characters, so 30 chats is
// already a ceiling (~2M characters).
export const MAX_CHATS = 30;
export const MAX_EVICTIONS_PER_SAVE = 5;

export interface ChatListItem extends ChatIndexEntry {
  broken: boolean;
}

export interface ActiveChat {
  id: string;
  initialMessages: ChatUIMessage[];
}

export interface Evicted {
  reason: 'limit' | 'storage';
  titles: string[];
}

export type SaveResult =
  | { ok: true; evicted?: Evicted }
  | { ok: false; reason: 'unavailable' | 'full' };

export interface HistoryStatus {
  available: boolean;
  unavailableDismissed: boolean;
  saveFailedChatId: string | null;
  evicted: Evicted | null;
}

// Frozen and shared, so React keeps seeing the same reference — on the
// server and whenever there is nothing to show.
export const EMPTY_INDEX: readonly ChatListItem[] = Object.freeze([]);
export const SERVER_STATUS: HistoryStatus = Object.freeze({
  available: true,
  unavailableDismissed: false,
  saveFailedChatId: null,
  evicted: null,
});

const chatKey = (id: string) => `${CHAT_KEY_PREFIX}${id}`;

const listeners = new Set<() => void>();
function notify() {
  for (const listener of listeners) listener();
}

let status: HistoryStatus = SERVER_STATUS;
function setStatus(patch: Partial<HistoryStatus>) {
  const next = { ...status, ...patch };
  const keys = Object.keys(next) as (keyof HistoryStatus)[];
  // A new object only on a real change: useSyncExternalStore compares by
  // reference, and every save passes through here.
  if (keys.every((key) => next[key] === status[key])) return;
  status = next;
}

// One probe per page life. If a test write fails, history is off until the
// page closes. After a passed probe, a failing write means "storage is full"
// — browsers name the quota error differently, so the name is not checked.
let probe: 'ok' | 'failed' | null = null;

function getStorage(): Storage | null {
  // No window during a server render: no storage, but not "blocked" either.
  if (typeof window === 'undefined' || probe === 'failed') return null;
  try {
    const storage = window.localStorage;
    if (probe === null) {
      storage.setItem(PROBE_KEY, '1');
      storage.removeItem(PROBE_KEY);
      probe = 'ok';
    }
    return storage;
  } catch {
    probe = 'failed';
    setStatus({ available: false });
    return null;
  }
}

function read(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function remove(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // Nothing more to clean up.
  }
}

function parseIndex(raw: string | null): ChatIndexEntry[] {
  if (raw === null) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const entries: ChatIndexEntry[] = [];
  for (const item of data) {
    const parsed = chatIndexEntrySchema.safeParse(item);
    // A repeated id would give React two rows with one key.
    if (parsed.success && !seen.has(parsed.data.id)) {
      seen.add(parsed.data.id);
      entries.push(parsed.data);
    }
  }
  return entries;
}

// Ids whose messages failed validation, or whose render crashed. Kept for
// the page life: the list shows them as "Can't be opened", and nothing is
// ever saved over them.
const broken = new Set<string>();
let brokenVersion = 0;

// No notify: this runs inside reads, some of them during a render. The list
// sees the new version on its next read.
function addBroken(id: string) {
  if (broken.has(id)) return;
  broken.add(id);
  brokenVersion++;
}

// The broken set lives only in memory, so the stored active id is cleared
// too: after F5 a draft opens instead of the same crash. `active` stays, so
// this tab keeps its error screen rather than remounting.
export function markChatBroken(id: string) {
  addBroken(id);
  const storage = getStorage();
  if (storage && read(storage, ACTIVE_KEY) === id) remove(storage, ACTIVE_KEY);
  notify();
}

let listKey: string | null = null;
let list: readonly ChatListItem[] = EMPTY_INDEX;

// Key names only: getItem would copy each chat's whole body into JS just to
// see that it exists.
function storedKeys(storage: Storage): Set<string> {
  const keys = new Set<string>();
  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key !== null) keys.add(key);
    }
  } catch {
    // Treat what was read so far as everything; the rest shows as broken.
  }
  return keys;
}

// Called on every render by useSyncExternalStore. It only checks that each
// chat's key exists; parsing up to 30 chats here would be far too slow.
// Full validation happens when a chat is opened (readChat).
export function readIndex(): readonly ChatListItem[] {
  const storage = getStorage();
  if (!storage) return EMPTY_INDEX;
  const raw = read(storage, INDEX_KEY);
  const entries = parseIndex(raw);
  const keys = entries.length === 0 ? null : storedKeys(storage);
  const present = entries.map((entry) => (keys?.has(chatKey(entry.id)) ? '1' : '0')).join('');
  const key = `${raw}\u0000${present}\u0000${brokenVersion}`;
  if (key === listKey) return list;
  listKey = key;
  list =
    entries.length === 0
      ? EMPTY_INDEX
      : entries.map((entry, i) => ({ ...entry, broken: present[i] === '0' || broken.has(entry.id) }));
  return list;
}

function parseMessages(raw: string): ChatUIMessage[] | null {
  try {
    const parsed = storedMessagesSchema.safeParse(JSON.parse(raw));
    // The schema checks what the list and useChat need. A part that passes
    // but still breaks a card is caught by ChatErrorBoundary.
    return parsed.success ? (parsed.data as unknown as ChatUIMessage[]) : null;
  } catch {
    return null;
  }
}

export function readChat(id: string): ChatUIMessage[] | null {
  const storage = getStorage();
  if (!storage) return null;
  const raw = read(storage, chatKey(id));
  const messages = raw === null ? null : parseMessages(raw);
  if (messages === null) addBroken(id);
  return messages;
}

let active: ActiveChat | null = null;
// "New chat" on an empty draft does nothing. Tracked here, not from the
// list, because with storage blocked nothing is ever listed.
let activeIsEmpty = true;

function newDraft(): ActiveChat {
  activeIsEmpty = true;
  // generateId (what Chat itself uses), not crypto.randomUUID: randomUUID
  // exists only in a secure context, and the app is also opened over
  // http://192.168.x.x on a phone. Made once and kept: changing the id at
  // the first save would remount the session and cut off the first reply.
  return { id: generateId(), initialMessages: [] };
}

function initActive(): ActiveChat {
  const storage = getStorage();
  const id = storage ? read(storage, ACTIVE_KEY) : null;
  if (storage && id !== null && parseIndex(read(storage, INDEX_KEY)).some((entry) => entry.id === id)) {
    const messages = readChat(id);
    if (messages !== null) {
      activeIsEmpty = messages.length === 0;
      return { id, initialMessages: messages };
    }
  }
  return newDraft();
}

// Read once, then kept in the module: no `storage` listener and no read per
// render. Another tab opening a chat must not switch this one — the remount
// would cut off a reply that is still streaming here.
export function getActiveChat(): ActiveChat {
  active ??= initActive();
  return active;
}

function setActive(next: ActiveChat) {
  active = next;
  // A notice about chat A must not hang over chat B.
  setStatus({ evicted: null, saveFailedChatId: null });
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(ACTIVE_KEY, next.id);
    } catch {
      // Storage full: after F5 the user lands on a new draft. Acceptable.
    }
  }
  notify();
}

export function openChat(id: string) {
  if (getActiveChat().id === id) return;
  const messages = readChat(id);
  // Missing or invalid since the list was drawn. readChat marked it broken;
  // open a draft instead of ever writing over it.
  if (messages === null) {
    setActive(newDraft());
    return;
  }
  activeIsEmpty = messages.length === 0;
  setActive({ id, initialMessages: messages });
}

export function startNewChat() {
  getActiveChat();
  if (activeIsEmpty) return;
  setActive(newDraft());
}

// Writes the chat, then the list. False when either write throws.
function write(storage: Storage, id: string, body: string, index: ChatIndexEntry[], isNew: boolean) {
  try {
    storage.setItem(chatKey(id), body);
  } catch {
    return false;
  }
  try {
    storage.setItem(INDEX_KEY, JSON.stringify(index));
    return true;
  } catch {
    // No orphans: a new chat whose list entry did not fit must not stay
    // behind as a key nobody can see or delete. An existing chat keeps its
    // key — that is the user's data.
    if (isNew) remove(storage, chatKey(id));
    return false;
  }
}

// A failed save still deletes chats on its way, and the user can only learn
// their names from the notice. A second save must add to that notice, not
// replace it, or the first save's victims vanish unseen. Different reasons
// cannot share one sentence, so then the newer notice wins.
function mergeEvicted(reason: Evicted['reason'], titles: string[]): Evicted {
  const previous = status.evicted?.reason === reason ? status.evicted.titles : [];
  return { reason, titles: [...previous, ...titles] };
}

export function saveChat(id: string, messages: ChatUIMessage[]): SaveResult {
  const isActive = getActiveChat().id === id;
  // Before the storage check, so "New chat" works with history off too.
  if (isActive && messages.length > 0) activeIsEmpty = false;
  const storage = getStorage();
  if (!storage) return { ok: false, reason: 'unavailable' };

  // A fresh read, not the cached list: another tab may have saved a moment ago.
  let index = parseIndex(read(storage, INDEX_KEY));
  const isNew = !index.some((entry) => entry.id === id);
  const titles: string[] = [];
  let reason: Evicted['reason'] = 'limit';

  while (isNew && index.length >= MAX_CHATS) {
    const oldest = index[index.length - 1];
    remove(storage, chatKey(oldest.id));
    index = index.slice(0, -1);
    titles.push(oldest.title);
  }

  const entry: ChatIndexEntry = { id, title: chatTitle(messages), updatedAt: Date.now() };
  const body = JSON.stringify(messages);
  let evictions = 0;

  while (!write(storage, id, body, [entry, ...index.filter((e) => e.id !== id)], isNew)) {
    // The oldest chat other than this one. Never this one: it holds the messages being saved.
    const victim = index.findLast((e) => e.id !== id);
    if (!victim || evictions === MAX_EVICTIONS_PER_SAVE) {
      // Keep the list in line with the keys already deleted. The list
      // shrank, so this write usually fits.
      try {
        storage.setItem(INDEX_KEY, JSON.stringify(index));
      } catch {
        // The deleted chats will show as "Can't be opened".
      }
      setStatus({
        saveFailedChatId: id,
        ...(titles.length > 0 ? { evicted: mergeEvicted(reason, titles) } : {}),
      });
      notify();
      return { ok: false, reason: 'full' };
    }
    remove(storage, chatKey(victim.id));
    index = index.filter((e) => e.id !== victim.id);
    titles.push(victim.title);
    reason = 'storage';
    evictions++;
  }

  if (isActive) {
    // A draft started without a stored active id (the first visit) must
    // come back after F5 too.
    try {
      storage.setItem(ACTIVE_KEY, id);
    } catch {
      // Storage full: after F5 the user lands on a new draft. Acceptable.
    }
  }

  const evicted = titles.length > 0 ? mergeEvicted(reason, titles) : undefined;
  // A good save clears this chat's failure, but not an eviction notice: that
  // one stays until dismissed or until the chat changes.
  setStatus({
    saveFailedChatId: status.saveFailedChatId === id ? null : status.saveFailedChatId,
    ...(evicted ? { evicted } : {}),
  });
  notify();
  return evicted ? { ok: true, evicted } : { ok: true };
}

export function deleteChat(id: string) {
  const storage = getStorage();
  if (storage) {
    remove(storage, chatKey(id));
    const index = parseIndex(read(storage, INDEX_KEY)).filter((entry) => entry.id !== id);
    try {
      storage.setItem(INDEX_KEY, JSON.stringify(index));
    } catch {
      // The list shrank, so this rarely fails; if it does, the entry shows
      // as "Can't be opened" and can be deleted again.
    }
  }
  if (broken.delete(id)) brokenVersion++;
  // The open chat is gone: switch to a draft here, or its next save would
  // bring it back.
  if (getActiveChat().id === id) {
    setActive(newDraft());
    return;
  }
  notify();
}

export function clearHistory() {
  const storage = getStorage();
  if (storage) {
    // Every key with the prefix, not only the listed ones: entries dropped
    // as invalid left their messages behind.
    const keys: string[] = [];
    try {
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key?.startsWith(CHAT_KEY_PREFIX)) keys.push(key);
      }
    } catch {
      // Storage blocked mid-way: delete what was found.
    }
    for (const key of keys) remove(storage, key);
    remove(storage, INDEX_KEY);
    remove(storage, ACTIVE_KEY);
  }
  broken.clear();
  brokenVersion++;
  setActive(newDraft());
}

export function getHistoryStatus(): HistoryStatus {
  // Runs the probe, so "History is off" shows from the start, not only
  // after the first failed save.
  getStorage();
  return status;
}

// "History is off" is a lasting state, so dismissing it holds for the page
// life. An eviction is an event: dismissing it hides this one, and the next
// eviction shows again.
export function dismissNotice(kind: 'unavailable' | 'evicted') {
  setStatus(kind === 'unavailable' ? { unavailableDismissed: true } : { evicted: null });
  notify();
}

export function subscribeHistory(onChange: () => void): () => void {
  listeners.add(onChange);
  // The browser fires `storage` only in OTHER tabs. Only the list follows
  // them; the open chat does not (see getActiveChat).
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === INDEX_KEY || event.key.startsWith(CHAT_KEY_PREFIX)) {
      onChange();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onStorage);
  };
}
