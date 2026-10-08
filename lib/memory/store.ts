import { memorySchema, type Memory, type MemoryCategory } from './schema';

// Versioned key: a future schema change gets a new key instead of misreading
// old data. Anything that fails the schema is dropped on read.
export const MEMORY_STORAGE_KEY = 'wta.memory.v1';
const CHANGE_EVENT = 'wta:memorychange';

// One frozen object for "nothing saved", shared by the server snapshot and
// every empty read, so React keeps seeing the same reference.
export const EMPTY_MEMORY: Memory = Object.freeze({});

// window is absent during a server render, and merely touching localStorage
// can throw when the browser blocks site data — both mean "no storage".
function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

// useSyncExternalStore calls readMemory on every render and compares results
// by reference, so the same stored string must always give back the same
// object — a fresh JSON.parse each time would re-render forever.
let cachedRaw: string | null = null;
let cachedMemory: Memory = EMPTY_MEMORY;

function parseMemory(raw: string): Memory | null {
  try {
    const parsed = memorySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function readMemory(): Memory {
  const storage = getStorage();
  if (!storage) return EMPTY_MEMORY;

  let raw: string | null;
  try {
    raw = storage.getItem(MEMORY_STORAGE_KEY);
  } catch {
    return EMPTY_MEMORY;
  }
  if (raw === null) return EMPTY_MEMORY;
  if (raw === cachedRaw) return cachedMemory;

  const memory = parseMemory(raw);
  if (memory === null) {
    // An old schema, hand-edited JSON, a write from another app version:
    // drop it and start empty rather than crash on what the browser holds.
    try {
      storage.removeItem(MEMORY_STORAGE_KEY);
    } catch {
      // Storage blocked: nothing to clean up.
    }
    return EMPTY_MEMORY;
  }

  cachedRaw = raw;
  cachedMemory = memory;
  return memory;
}

function writeMemory(next: Memory): boolean {
  // The store guards its own invariant instead of trusting callers: whatever
  // lands here is read back into every future system prompt.
  const parsed = memorySchema.safeParse(next);
  const storage = getStorage();
  if (!parsed.success || !storage) return false;

  try {
    if (Object.keys(parsed.data).length === 0) {
      storage.removeItem(MEMORY_STORAGE_KEY);
    } else {
      storage.setItem(MEMORY_STORAGE_KEY, JSON.stringify(parsed.data));
    }
  } catch {
    // Quota exceeded, or storage blocked (some private modes).
    return false;
  }

  window.dispatchEvent(new Event(CHANGE_EVENT));
  return true;
}

// Every write starts from a fresh read, not from a React snapshot, so a value
// another tab saved a moment ago is kept instead of overwritten.
export function saveFact(category: MemoryCategory, value: string): boolean {
  const next: Memory = { ...readMemory() };
  next[category] = value;
  return writeMemory(next);
}

export function removeFact(category: MemoryCategory): boolean {
  const next: Memory = { ...readMemory() };
  delete next[category];
  return writeMemory(next);
}

export function clearMemory(): boolean {
  return writeMemory({});
}

// CHANGE_EVENT covers writes in this tab. The browser's `storage` event fires
// only in OTHER tabs, which keeps an open panel in sync across tabs.
export function subscribeMemory(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}
