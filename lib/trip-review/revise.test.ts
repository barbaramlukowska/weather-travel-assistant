// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { ReviewInput } from './prompt';
import { reviseTrip } from './revise';

const { doGenerate } = vi.hoisted(() => ({ doGenerate: vi.fn() }));
vi.mock('@/lib/model', async () => {
  const { MockLanguageModelV4 } = await import('ai/test');
  const model = () => new MockLanguageModelV4({ doGenerate });
  return { getCriticModel: model, getChatModel: model };
});

const input: ReviewInput & { issues: { field: 'packingList'; problem: string }[] } = {
  draft: { city: 'Lisbon', summary: 'Sunny.', packingList: ['a', 'b', 'c'] },
  forecast: {
    found: true,
    location: 'Lisbon',
    days: [],
    units: { temperature: '°C', precipitationChance: '%', windSpeed: 'km/h' },
  },
  memory: {},
  issues: [{ field: 'packingList', problem: 'No rain gear.' }],
};

const reply = (text: string) => ({
  content: [{ type: 'text' as const, text }],
  finishReason: { unified: 'stop' as const, raw: 'stop' },
  usage: {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 1, text: 1, reasoning: 0 },
  },
  warnings: [],
});

describe('reviseTrip', () => {
  it('returns the revised draft', async () => {
    const revised = { city: 'Lisbon', summary: 'Sunny.', packingList: ['a', 'b', 'umbrella'] };
    doGenerate.mockResolvedValueOnce(reply(JSON.stringify(revised)));
    await expect(reviseTrip(input)).resolves.toEqual(revised);
  });

  it('passes the abortSignal to the model', async () => {
    const ok = { city: 'Lisbon', summary: 's', packingList: ['a', 'b', 'c'] };
    doGenerate.mockResolvedValueOnce(reply(JSON.stringify(ok)));
    const controller = new AbortController();
    await reviseTrip(input, { abortSignal: controller.signal });
    const signal: AbortSignal = doGenerate.mock.calls.at(-1)?.[0].abortSignal;
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it('throws when the packing list has only 2 items', async () => {
    doGenerate.mockResolvedValueOnce(
      reply(JSON.stringify({ city: 'Lisbon', summary: 's', packingList: ['a', 'b'] })),
    );
    await expect(reviseTrip(input)).rejects.toThrow();
  });
});
