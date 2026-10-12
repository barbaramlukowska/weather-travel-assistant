'use client';

import { useSyncExternalStore } from 'react';
import {
  EMPTY_INDEX,
  SERVER_STATUS,
  getActiveChat,
  getHistoryStatus,
  readIndex,
  subscribeHistory,
  type ActiveChat,
} from '@/lib/history';

// Same pattern as use-memory.ts: history lives outside React (localStorage
// plus module state). Server snapshots — an empty list, no active chat, no
// notices — make the server HTML the skeleton, so hydration never mismatches
// and the stored chat appears right after it.
const getServerIndex = () => EMPTY_INDEX;
const getServerActive = () => null;
const getServerStatus = () => SERVER_STATUS;

export function useHistory() {
  return useSyncExternalStore(subscribeHistory, readIndex, getServerIndex);
}

export function useActiveChat() {
  return useSyncExternalStore<ActiveChat | null>(subscribeHistory, getActiveChat, getServerActive);
}

export function useHistoryStatus() {
  return useSyncExternalStore(subscribeHistory, getHistoryStatus, getServerStatus);
}
