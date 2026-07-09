import { describe, it, expect } from 'vitest';
import { isRateLimited, clientKeyFrom } from './rate-limit';

const T0 = 1_000_000;

describe('isRateLimited', () => {
  it('allows up to 10 requests within a minute', () => {
    for (let i = 0; i < 10; i++) {
      expect(isRateLimited('ip-a', T0 + i)).toBe(false);
    }
  });

  it('blocks the 11th request in the same window', () => {
    for (let i = 0; i < 10; i++) isRateLimited('ip-b', T0 + i);
    expect(isRateLimited('ip-b', T0 + 100)).toBe(true);
  });

  it('allows again once the window has passed', () => {
    for (let i = 0; i < 10; i++) isRateLimited('ip-c', T0 + i);
    expect(isRateLimited('ip-c', T0 + 61_000)).toBe(false);
  });

  it('tracks keys independently', () => {
    for (let i = 0; i < 10; i++) isRateLimited('ip-d', T0 + i);
    expect(isRateLimited('ip-e', T0 + 100)).toBe(false);
  });

  it('blocked requests do not extend the window (no lockout creep)', () => {
    for (let i = 0; i < 10; i++) isRateLimited('ip-f', T0 + i);
    // Hammering while blocked must not count as new hits...
    for (let i = 0; i < 5; i++) expect(isRateLimited('ip-f', T0 + 1_000 + i)).toBe(true);
    // ...so once the original 10 hits age out, requests pass again.
    expect(isRateLimited('ip-f', T0 + 61_000)).toBe(false);
  });
});

describe('clientKeyFrom', () => {
  it('takes the first hop of x-forwarded-for', () => {
    const req = new Request('http://x', {
      headers: { 'x-forwarded-for': '1.2.3.4, 10.0.0.1' },
    });
    expect(clientKeyFrom(req)).toBe('1.2.3.4');
  });

  it('falls back to "unknown" without the header', () => {
    expect(clientKeyFrom(new Request('http://x'))).toBe('unknown');
  });
});
