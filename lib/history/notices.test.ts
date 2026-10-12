import { describe, expect, it } from 'vitest';
import { pickNotice } from './notices';
import { SERVER_STATUS, type HistoryStatus } from './store';

const QUIET: HistoryStatus = SERVER_STATUS;
const OK = { level: 'ok' } as const;
const WARN = { level: 'warn', reason: 'size' } as const;
const EVICTED = { reason: 'limit', titles: ['Old trip'] } as const;

describe('pickNotice', () => {
  it('shows nothing when all is well', () => {
    expect(pickNotice(QUIET, 'a', OK)).toBeNull();
  });

  it('shows one notice, the most serious first', () => {
    const everything: HistoryStatus = {
      available: false,
      unavailableDismissed: false,
      saveFailedChatId: 'a',
      evicted: { ...EVICTED, titles: [...EVICTED.titles] },
    };
    expect(pickNotice(everything, 'a', WARN)).toEqual({ kind: 'unavailable' });
    expect(pickNotice({ ...everything, available: true }, 'a', WARN)).toEqual({ kind: 'save_failed' });
    expect(pickNotice({ ...everything, available: true, saveFailedChatId: null }, 'a', WARN)).toEqual({
      kind: 'evicted',
      reason: 'limit',
      titles: ['Old trip'],
    });
    expect(pickNotice(QUIET, 'a', WARN)).toEqual({ kind: 'warn' });
  });

  it('falls through to the next notice once "history is off" is dismissed', () => {
    const off: HistoryStatus = { ...QUIET, available: false, unavailableDismissed: true };
    expect(pickNotice(off, 'a', WARN)).toEqual({ kind: 'warn' });
  });

  it('shows a failed save only over the chat that failed', () => {
    expect(pickNotice({ ...QUIET, saveFailedChatId: 'b' }, 'a', OK)).toBeNull();
  });

  // A full chat gets ChatFullNotice in place of the composer instead.
  it('shows no warning for a chat that is already full', () => {
    expect(pickNotice(QUIET, 'a', { level: 'full', reason: 'size' })).toBeNull();
  });
});
