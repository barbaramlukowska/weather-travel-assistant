import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EMPTY_MEMORY,
  MEMORY_STORAGE_KEY,
  clearMemory,
  readMemory,
  removeFact,
  saveFact,
  subscribeMemory,
} from './store';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('memory store', () => {
  it('starts empty', () => {
    expect(readMemory()).toEqual({});
  });

  it('saves a fact under its category', () => {
    expect(saveFact('homeCity', 'Kraków')).toBe(true);
    expect(readMemory()).toEqual({ homeCity: 'Kraków' });
  });

  it('overwrites a category instead of adding a second entry', () => {
    saveFact('homeCity', 'Kraków');
    saveFact('homeCity', 'Gdańsk');
    expect(readMemory()).toEqual({ homeCity: 'Gdańsk' });
  });

  it('removes one category and keeps the rest', () => {
    saveFact('homeCity', 'Kraków');
    saveFact('climate', 'dislikes heat');
    expect(removeFact('homeCity')).toBe(true);
    expect(readMemory()).toEqual({ climate: 'dislikes heat' });
  });

  it('clears everything and leaves no key behind', () => {
    saveFact('homeCity', 'Kraków');
    expect(clearMemory()).toBe(true);
    expect(readMemory()).toEqual({});
    expect(localStorage.getItem(MEMORY_STORAGE_KEY)).toBeNull();
  });

  it('refuses a value the schema rejects', () => {
    expect(saveFact('climate', '   ')).toBe(false);
    expect(saveFact('climate', 'x'.repeat(121))).toBe(false);
    expect(readMemory()).toEqual({});
  });

  it('drops broken JSON and starts empty', () => {
    localStorage.setItem(MEMORY_STORAGE_KEY, '{not json');
    expect(readMemory()).toEqual({});
    expect(localStorage.getItem(MEMORY_STORAGE_KEY)).toBeNull();
  });

  it('drops data written by an older or foreign schema', () => {
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify({ homeCity: 42 }));
    expect(readMemory()).toEqual({});

    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify({ pet: 'cat' }));
    expect(readMemory()).toEqual({});
  });

  // useSyncExternalStore compares snapshots by reference.
  it('returns the same object while storage is unchanged', () => {
    saveFact('homeCity', 'Kraków');
    expect(readMemory()).toBe(readMemory());
  });

  it('works without window, as during a server render', () => {
    vi.stubGlobal('window', undefined);
    expect(readMemory()).toBe(EMPTY_MEMORY);
    expect(saveFact('homeCity', 'Kraków')).toBe(false);
    expect(clearMemory()).toBe(false);
  });

  it('reports failure instead of throwing when storage is full', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(saveFact('homeCity', 'Kraków')).toBe(false);
    expect(readMemory()).toEqual({});
  });

  it('notifies subscribers about writes in this tab, until unsubscribed', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeMemory(onChange);
    saveFact('homeCity', 'Kraków');
    expect(onChange).toHaveBeenCalledTimes(1);

    unsubscribe();
    saveFact('climate', 'dislikes heat');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  // Review Focus 4: the browser fires `storage` only in OTHER tabs.
  it('notifies subscribers about writes in another tab', () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeMemory(onChange);
    window.dispatchEvent(new StorageEvent('storage', { key: MEMORY_STORAGE_KEY }));
    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('keeps a value another tab saved a moment ago', () => {
    readMemory(); // warm the cache with "empty", as an open tab would have
    localStorage.setItem(MEMORY_STORAGE_KEY, JSON.stringify({ homeCity: 'Kraków' }));
    saveFact('climate', 'dislikes heat');
    expect(readMemory()).toEqual({ homeCity: 'Kraków', climate: 'dislikes heat' });
  });
});
