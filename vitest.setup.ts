import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// RTL's auto-cleanup only kicks in with global test hooks; we import
// describe/it/expect explicitly instead of using vitest's globals, so
// register it ourselves — otherwise DOM from one test leaks into the next.
afterEach(() => {
  cleanup();
});

// jsdom lacks these browser APIs. Without them every test that renders a
// chat session (scrolling, prefers-reduced-motion) or the history drawer
// (<dialog>, the lg media query) would throw. Guarded: route tests run in
// the node environment, where there is no DOM at all.
if (typeof window !== 'undefined') {
  Element.prototype.scrollIntoView = function scrollIntoView() {};

  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };

  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
