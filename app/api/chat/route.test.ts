// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { POST } from './route';

const messages = [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'hi' }] }];

function post(body: unknown, ip: string) {
  return POST(
    new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body),
    }),
  );
}

// Only rejection paths: they return before the model is called, so these
// tests are free and need no API key.
describe('POST /api/chat — memory validation', () => {
  it('rejects an unknown memory category', async () => {
    const res = await post({ messages, memory: { password: 'hunter2' } }, '10.0.0.1');
    expect(res.status).toBe(400);
  });

  it('rejects a memory value over the length cap', async () => {
    const res = await post({ messages, memory: { homeCity: 'x'.repeat(121) } }, '10.0.0.2');
    expect(res.status).toBe(400);
  });

  it('rejects memory that is not an object', async () => {
    const res = await post({ messages, memory: 'homeCity: Paris' }, '10.0.0.3');
    expect(res.status).toBe(400);
  });

  it('still rejects an empty messages array', async () => {
    const res = await post({ messages: [], memory: {} }, '10.0.0.4');
    expect(res.status).toBe(400);
  });
});
