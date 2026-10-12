import { APICallError, RetryError } from 'ai';
import { RATE_LIMIT_MESSAGE } from '@/lib/errors';

// Lives next to the route, not in it: a route file may export only HTTP
// handlers and route config, and this needs its own tests.
//
// The SDK masks streaming errors as "An error occurred." so internals never
// leak. We override that only for the free-tier daily quota (HTTP 429), which
// is worth explaining. The failing model call is wrapped in retries, so the
// error is usually a RetryError — unwrap it to read the real status code.
export function toClientErrorMessage(error: unknown): string {
  // Stop, or closing the tab, aborts the request on purpose (abortSignal in
  // the route) — nothing went wrong, so nothing is logged. In ai@7 streamText
  // usually turns an abort into an `abort` stream part instead of an error,
  // so this guard is a defensive belt for an AbortError that still reaches
  // onError.
  if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError') {
    return 'Aborted.';
  }

  const apiError = RetryError.isInstance(error) ? error.lastError : error;

  if (APICallError.isInstance(apiError) && apiError.statusCode === 429) {
    return RATE_LIMIT_MESSAGE;
  }

  console.error('Chat stream error:', error);
  return 'An error occurred.';
}
