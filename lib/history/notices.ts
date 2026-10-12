import type { ChatCapacity } from '../limits';
import type { Evicted, HistoryStatus } from './store';

export type HistoryNotice =
  | { kind: 'unavailable' }
  | { kind: 'save_failed' }
  | ({ kind: 'evicted' } & Evicted)
  | { kind: 'warn' };

// One notice at a time, the most serious first. `warn` comes from the
// chat's own size (computed in render); the rest from the store.
export function pickNotice(
  status: HistoryStatus,
  chatId: string,
  capacity: ChatCapacity,
): HistoryNotice | null {
  if (!status.available && !status.unavailableDismissed) return { kind: 'unavailable' };
  if (status.saveFailedChatId === chatId) return { kind: 'save_failed' };
  if (status.evicted) return { kind: 'evicted', ...status.evicted };
  if (capacity.level === 'warn') return { kind: 'warn' };
  return null;
}
