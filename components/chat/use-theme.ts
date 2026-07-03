'use client';

import { useSyncExternalStore } from 'react';

// Theme lives outside React (a class on <html>). useSyncExternalStore reads
// it without setState-in-effect and stays consistent across SSR/hydration.
function subscribeTheme(callback: () => void) {
  window.addEventListener('themechange', callback);
  return () => window.removeEventListener('themechange', callback);
}
function getThemeSnapshot() {
  return document.documentElement.classList.contains('dark');
}
function getThemeServerSnapshot() {
  return false;
}

export function useTheme() {
  const isDark = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getThemeServerSnapshot,
  );
  const toggleTheme = () => {
    const next = !document.documentElement.classList.contains('dark');
    const c = document.documentElement.classList;
    c.toggle('dark', next);
    c.toggle('light', !next);
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch {
      // ignore storage errors (e.g. private mode)
    }
    window.dispatchEvent(new Event('themechange'));
  };
  return { isDark, toggleTheme };
}
