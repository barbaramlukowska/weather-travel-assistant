// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { ReviewInput } from './prompt';
import { criticApproves, critiqueTrip } from './critic';

const { doGenerate } = vi.hoisted(() => ({ doGenerate: vi.fn() }));
vi.mock('@/lib/model', async () => {
  const { MockLanguageModelV4 } = await import('ai/test');
  const model = () => new MockLanguageModelV4({ doGenerate });
  return { getCriticModel: model, getChatModel: model };
});

const input: ReviewInput = {
  draft: { city: 'Lisbon', summary: 'Sunny.', packingList: ['a', 'b', 'c'] },
  forecast: {
    found: true,
    location: 'Lisbon',
    days: [],
    units: { temperature: '°C', precipitationChance: '%', windSpeed: 'km/h' },
  },
  memory: {},
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

describe('critiqueTrip', () => {
  it('returns the parsed verdict', async () => {
    const wire = { issues: [{ field: 'summary', item: null, problem: 'No rain mention.' }], pass: false };
    doGenerate.mockResolvedValueOnce(reply(JSON.stringify(wire)));
    // item: null on the wire becomes an absent key.
    await expect(critiqueTrip(input)).resolves.toEqual({
      issues: [{ field: 'summary', problem: 'No rain mention.' }],
      pass: false,
    });
  });

  it('keeps the item of a packing-list issue', async () => {
    const wire = { issues: [{ field: 'packingList', item: 'umbrella', problem: 'Dry week.' }], pass: false };
    doGenerate.mockResolvedValueOnce(reply(JSON.stringify(wire)));
    await expect(critiqueTrip(input)).resolves.toEqual(wire);
  });

  it('passes the abortSignal to the model', async () => {
    doGenerate.mockResolvedValueOnce(reply('{"issues":[],"pass":true}'));
    const controller = new AbortController();
    await critiqueTrip(input, { abortSignal: controller.signal });
    const signal: AbortSignal = doGenerate.mock.calls.at(-1)?.[0].abortSignal;
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
  });

  it('throws on a failing verdict that names no issue', async () => {
    doGenerate.mockResolvedValueOnce(reply('{"issues":[],"pass":false}'));
    await expect(critiqueTrip(input)).rejects.toThrow(/no issue/);
  });

  it('clips the verdict to 6 issues, 160-char problems and 80-char items', async () => {
    const long = { field: 'packingList', item: 'i'.repeat(100), problem: 'p'.repeat(200) };
    const wire = { issues: Array.from({ length: 8 }, () => long), pass: false };
    doGenerate.mockResolvedValueOnce(reply(JSON.stringify(wire)));
    const verdict = await critiqueTrip(input);
    expect(verdict.issues).toHaveLength(6);
    expect(verdict.issues[0].problem).toHaveLength(160);
    expect(verdict.issues[0].problem.endsWith('…')).toBe(true);
    expect(verdict.issues[0].item).toHaveLength(80);
  });

  it('throws on a response that fails the schema', async () => {
    doGenerate.mockResolvedValueOnce(reply('{"issues":"none","pass":true}'));
    await expect(critiqueTrip(input)).rejects.toThrow();
  });
});

describe('criticApproves', () => {
  it('reads a verdict by its issues, not by pass', () => {
    expect(criticApproves({ issues: [], pass: true })).toBe(true);
    expect(criticApproves({ issues: [{ field: 'summary', problem: 'x' }], pass: true })).toBe(false);
  });
});
