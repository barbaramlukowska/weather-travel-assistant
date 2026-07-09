// Sliding-window rate limiter, in-memory on purpose (YAGNI: no external
// store). On serverless this counts per warm instance, not globally — good
// enough to stop naive request loops; documented in docs/THREAT-MODEL.md.
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;

const hitsByKey = new Map<string, number[]>();

export function isRateLimited(key: string, now: number = Date.now()): boolean {
  const windowStart = now - WINDOW_MS;
  const recent = (hitsByKey.get(key) ?? []).filter((t) => t > windowStart);

  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    hitsByKey.set(key, recent);
    return true;
  }

  recent.push(now);
  hitsByKey.set(key, recent);

  // Drop idle keys so the map cannot grow without bound.
  if (hitsByKey.size > 10_000) {
    for (const [k, times] of hitsByKey) {
      if (times.every((t) => t <= windowStart)) hitsByKey.delete(k);
    }
  }

  return false;
}

export function clientKeyFrom(req: Request): string {
  // First hop in x-forwarded-for is the client (set by Vercel's proxy).
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
}
