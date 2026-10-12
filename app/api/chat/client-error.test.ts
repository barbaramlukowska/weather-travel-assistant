// @vitest-environment node
import { APICallError } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RATE_LIMIT_MESSAGE } from '@/lib/errors';
import { toClientErrorMessage } from './client-error';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('toClientErrorMessage', () => {
  it('explains the daily quota', () => {
    const error = new APICallError({ message: 'quota', url: 'https://api', requestBodyValues: {}, statusCode: 429 });
    expect(toClientErrorMessage(error)).toBe(RATE_LIMIT_MESSAGE);
  });

  it('masks anything else and logs it', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(toClientErrorMessage(new Error('internal detail'))).toBe('An error occurred.');
    expect(log).toHaveBeenCalledTimes(1);
  });

  // Stop and closing the tab abort the request on purpose (abortSignal in
  // the route). That is not a failure, so it must not fill the server log.
  it('does not log an aborted request', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    toClientErrorMessage(new DOMException('The operation was aborted.', 'AbortError'));
    expect(log).not.toHaveBeenCalled();
  });
});
