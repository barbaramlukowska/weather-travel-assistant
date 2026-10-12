import { describe, expect, it } from 'vitest';
import {
  MAX_BODY_CHARS,
  MAX_MESSAGES,
  TURN_RESERVE_CHARS,
  WARN_MESSAGES,
  WARN_RATIO,
  buildChatRequestBody,
  chatCapacity,
  requestLength,
} from './limits';
import type { ChatUIMessage } from './tools';

// The size left for history once one more turn is reserved, and its 75%.
const FULL_SIZE = MAX_BODY_CHARS - TURN_RESERVE_CHARS;
const WARN_SIZE = WARN_RATIO * FULL_SIZE;

const QUESTION: ChatUIMessage = {
  id: 'm1',
  role: 'user',
  parts: [{ type: 'text', text: 'Pogoda w Krakowie? 🌧' }],
};

describe('chatCapacity', () => {
  it('is ok for a short chat', () => {
    expect(chatCapacity({ messageCount: 2, requestChars: 1_000 })).toEqual({ level: 'ok' });
  });

  it('warns from 45 messages', () => {
    expect(chatCapacity({ messageCount: WARN_MESSAGES - 1, requestChars: 0 }).level).toBe('ok');
    expect(chatCapacity({ messageCount: WARN_MESSAGES, requestChars: 0 })).toEqual({
      level: 'warn',
      reason: 'messages',
    });
  });

  // +2: the next question and its answer must still fit under 60.
  it('is full when the next question and answer would pass 60 messages', () => {
    expect(chatCapacity({ messageCount: MAX_MESSAGES - 2, requestChars: 0 }).level).toBe('warn');
    expect(chatCapacity({ messageCount: MAX_MESSAGES - 1, requestChars: 0 })).toEqual({
      level: 'full',
      reason: 'messages',
    });
  });

  it('warns at 75% of the size left after the reserve', () => {
    expect(chatCapacity({ messageCount: 2, requestChars: WARN_SIZE - 1 }).level).toBe('ok');
    expect(chatCapacity({ messageCount: 2, requestChars: WARN_SIZE })).toEqual({
      level: 'warn',
      reason: 'size',
    });
  });

  it('is full when one more turn would not fit under the body cap', () => {
    expect(chatCapacity({ messageCount: 2, requestChars: FULL_SIZE }).level).toBe('warn');
    expect(chatCapacity({ messageCount: 2, requestChars: FULL_SIZE + 1 })).toEqual({
      level: 'full',
      reason: 'size',
    });
  });
});

describe('requestLength', () => {
  it('is the length of the exact body the transport sends', () => {
    const args = {
      chatId: 'c1',
      messages: [QUESTION],
      memory: { notes: ['wegetarianka'] },
      trigger: 'submit-message' as const,
      messageId: 'm1',
    };
    const body = buildChatRequestBody(args);
    expect(body).toEqual({
      memory: { notes: ['wegetarianka'] },
      id: 'c1',
      messages: [QUESTION],
      trigger: 'submit-message',
      messageId: 'm1',
    });
    expect(requestLength(args)).toBe(JSON.stringify(body).length);
  });

  // JSON.stringify drops undefined fields — the same body the route receives.
  it('leaves out trigger and messageId when they are not given', () => {
    const body = JSON.parse(
      JSON.stringify(buildChatRequestBody({ chatId: 'c1', messages: [QUESTION], memory: {} })),
    );
    expect(Object.keys(body)).toEqual(['memory', 'id', 'messages']);
  });
});
