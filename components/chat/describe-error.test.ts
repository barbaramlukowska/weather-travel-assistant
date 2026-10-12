import { APICallError } from 'ai';
import { describe, expect, it } from 'vitest';
import { RATE_LIMIT_MESSAGE } from '@/lib/errors';
import { describeChatError } from './describe-error';

const httpError = (statusCode: number, body: string) =>
  new APICallError({ message: body, url: '/api/chat', requestBodyValues: {}, statusCode, responseBody: body });

describe('describeChatError', () => {
  // Recognised by status code, not by parsing the text.
  it('turns a 413 into "chat is full"', () => {
    const error = httpError(413, '{"error":"This chat is too long.","code":"chat_too_long"}');
    expect(describeChatError(error)).toEqual({ kind: 'chat_full' });
  });

  it('shows the route\'s "error" field instead of raw JSON', () => {
    const error = httpError(429, '{"error":"Too many requests — please slow down."}');
    expect(describeChatError(error)).toEqual({
      kind: 'message',
      text: 'Too many requests — please slow down.',
    });
  });

  it('leaves plain text from the stream as it is', () => {
    expect(describeChatError(new Error(RATE_LIMIT_MESSAGE))).toEqual({
      kind: 'message',
      text: RATE_LIMIT_MESSAGE,
    });
  });

  it('leaves JSON without an "error" field as it is', () => {
    expect(describeChatError(new Error('{"detail":"x"}'))).toEqual({ kind: 'message', text: '{"detail":"x"}' });
  });
});
