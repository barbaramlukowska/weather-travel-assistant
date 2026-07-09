import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// RTL's auto-cleanup only kicks in with global test hooks; we import
// describe/it/expect explicitly instead of using vitest's globals, so
// register it ourselves — otherwise DOM from one test leaks into the next.
afterEach(() => {
  cleanup();
});
