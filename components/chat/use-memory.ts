'use client';

import { useSyncExternalStore } from 'react';
import { EMPTY_MEMORY, readMemory, subscribeMemory } from '@/lib/memory';

// Same pattern as use-theme.ts: memory lives outside React (localStorage), and
// useSyncExternalStore reads it without setState-in-effect. The server
// snapshot is empty, so the server HTML matches the first client render and
// saved values appear right after hydration.
const getServerSnapshot = () => EMPTY_MEMORY;

export function useMemory() {
  return useSyncExternalStore(subscribeMemory, readMemory, getServerSnapshot);
}
