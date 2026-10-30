// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ForecastOutput, TripPlanOutput } from '../tools';
import type { ReviewIssue, TripDraft } from './schema';
import { MAX_REVISIONS, REVIEW_DEADLINE_MS, reviewMode, reviewTrip, type ReviewDeps, type ReviewStats } from './orchestrate';

const draft: TripDraft = {
  city: 'Lisbon',
  summary: 'Sunny, 20–24°.',
  packingList: ['sunscreen', 'sun hat', 'sandals'],
};
const forecast: ForecastOutput = {
  found: true,
  location: 'Lisbon, Portugal', // fetchForecast always returns "name, country"
  days: [{ date: '2026-10-28', minTemp: 18, maxTemp: 24, precipitationChance: 5, weatherCode: 0 } as never],
  units: { temperature: '°C', precipitationChance: '%', windSpeed: 'km/h' },
};
const issue = (problem: string): ReviewIssue => ({ field: 'summary', problem });
const pass = { issues: [] as ReviewIssue[], pass: true };
const fail = (...problems: string[]) => ({ issues: problems.map(issue), pass: false });
const draftN = (n: number): TripDraft => ({ ...draft, summary: `Sunny, 20–24°. v${n}` });

function setup(over: Partial<ReviewDeps> = {}) {
  const log = vi.fn<(s: ReviewStats) => void>();
  const fetchForecast = vi.fn(async () => forecast);
  const critique = vi.fn(async () => pass);
  const revise = vi.fn(async () => draftN(2));
  let t = 0;
  const now = vi.fn(() => t);
  const deadline = new AbortController();
  const timeout = vi.fn(() => deadline.signal);
  const deps = { fetchForecast, critique, revise, now, log, timeout, ...over } as ReviewDeps;
  return {
    deps, log, fetchForecast, critique, revise, now, deadline,
    advance: (ms: number) => (t += ms),
  };
}

async function run(mode: 'off' | 'shadow' | 'live', deps: ReviewDeps, d = draft, abortSignal?: AbortSignal) {
  const out: TripPlanOutput[] = [];
  for await (const v of reviewTrip(d, {}, { mode, deps, abortSignal })) out.push(v);
  return out;
}

const card = (d: TripDraft, review: object) => ({ found: true, ...d, review });

describe('reviewMode', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('reads TRIP_REVIEW per call; unknown or unset gives the default', () => {
    vi.stubEnv('TRIP_REVIEW', 'live');
    expect(reviewMode()).toBe('live');
    vi.stubEnv('TRIP_REVIEW', 'shadow');
    expect(reviewMode()).toBe('shadow');
    vi.stubEnv('TRIP_REVIEW', 'nonsense');
    expect(reviewMode()).toBe('off');
  });
});

describe('reviewTrip', () => {
  it('constants', () => {
    expect(MAX_REVISIONS).toBe(2);
    expect(REVIEW_DEADLINE_MS).toBe(12_000);
  });

  it('off: one yield without review, nothing fetched or logged', async () => {
    const s = setup();
    expect(await run('off', s.deps)).toEqual([{ found: true, ...draft }]);
    expect(s.fetchForecast).not.toHaveBeenCalled();
    expect(s.log).not.toHaveBeenCalled();
  });

  it('shadow with issues: unchanged card, logs issues > 0, no revise', async () => {
    const s = setup({ critique: vi.fn(async () => fail('a', 'b')) });
    expect(await run('shadow', s.deps)).toEqual([{ found: true, ...draft }]);
    expect(s.revise).not.toHaveBeenCalled();
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'shadow', status: 'unverified', rounds: 1, issues: 2, ms: 0, costUsd: 0 });
  });

  it('shadow with a throwing critic: logs unchecked', async () => {
    const s = setup({ critique: vi.fn(async () => { throw new Error('bad'); }) });
    expect(await run('shadow', s.deps)).toEqual([{ found: true, ...draft }]);
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'shadow', status: 'unchecked', rounds: 1, issues: 0, ms: 0, costUsd: 0 });
  });

  it('shadow with a throwing critic still counts the layer 1 issues', async () => {
    const bad = { ...draft, summary: 'Hot, 35–40°.' };
    const s = setup({ critique: vi.fn(async () => { throw new Error('bad'); }) });
    expect(await run('shadow', s.deps, bad)).toEqual([{ found: true, ...bad }]);
    expect(s.log).toHaveBeenCalledWith({ mode: 'shadow', status: 'unchecked', rounds: 1, issues: 1, ms: 0, costUsd: 0 });
  });

  it('live, critic passes at once: [checking, verified]', async () => {
    const s = setup();
    expect(await run('live', s.deps)).toEqual([
      card(draft, { status: 'checking', round: 1 }),
      card(draft, { status: 'verified', round: 1 }),
    ]);
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'live', status: 'verified', rounds: 1, issues: 0, ms: 0, costUsd: 0 });
  });

  it('live, issues then revise then pass', async () => {
    const revised = draftN(2);
    const critique = vi.fn().mockResolvedValueOnce(fail('x')).mockResolvedValueOnce(pass);
    const revise = vi.fn(async () => revised);
    const s = setup({ critique, revise });
    expect(await run('live', s.deps)).toEqual([
      card(draft, { status: 'checking', round: 1 }),
      card(draft, { status: 'revising', round: 1 }),
      card(revised, { status: 'verified', round: 2 }),
    ]);
    expect(revise).toHaveBeenCalledWith(
      expect.objectContaining({ draft, issues: [issue('x')] }),
      expect.anything(),
    );
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'live', status: 'verified', rounds: 2, issues: 0, ms: 0, costUsd: 0 });
  });

  it('live, fewer issues each time but never zero: budget stop after 2 revisions', async () => {
    const critique = vi.fn()
      .mockResolvedValueOnce(fail('a', 'b', 'c'))
      .mockResolvedValueOnce(fail('a', 'b'))
      .mockResolvedValueOnce(fail('a'));
    const revise = vi.fn().mockResolvedValueOnce(draftN(2)).mockResolvedValueOnce(draftN(3));
    const s = setup({ critique, revise });
    expect(await run('live', s.deps)).toEqual([
      card(draft, { status: 'checking', round: 1 }),
      card(draft, { status: 'revising', round: 1 }),
      card(draftN(2), { status: 'revising', round: 2 }),
      card(draftN(3), { status: 'unverified', round: 3, issues: [issue('a')] }),
    ]);
    expect(critique).toHaveBeenCalledTimes(3);
    expect(revise).toHaveBeenCalledTimes(2);
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'live', status: 'unverified', rounds: 3, issues: 1, ms: 0, costUsd: 0 });
  });

  it('live, no progress: stops after one revision and returns the first version', async () => {
    const critique = vi.fn().mockResolvedValue(fail('a', 'b'));
    const s = setup({ critique });
    expect(await run('live', s.deps)).toEqual([
      card(draft, { status: 'checking', round: 1 }),
      card(draft, { status: 'revising', round: 1 }),
      card(draft, { status: 'unverified', round: 2, issues: [issue('a'), issue('b')] }),
    ]);
    expect(s.revise).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'live', status: 'unverified', rounds: 2, issues: 2, ms: 0, costUsd: 0 });
  });

  it('live, deadline passes during the first critique: no revise, unverified', async () => {
    const s = setup();
    s.deps.critique = vi.fn(async () => {
      s.advance(13_000);
      return fail('a');
    });
    expect(await run('live', s.deps)).toEqual([
      card(draft, { status: 'checking', round: 1 }),
      card(draft, { status: 'unverified', round: 1, issues: [issue('a')] }),
    ]);
    expect(s.revise).not.toHaveBeenCalled();
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'live', status: 'unverified', rounds: 1, issues: 1, ms: 13_000, costUsd: 0 });
  });

  it('live, critic throws: unchecked, plan is the draft', async () => {
    const s = setup({ critique: vi.fn(async () => { throw new Error('schema'); }) });
    expect(await run('live', s.deps)).toEqual([
      card(draft, { status: 'checking', round: 1 }),
      card(draft, { status: 'unchecked', round: 1 }),
    ]);
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'live', status: 'unchecked', rounds: 1, issues: 0, ms: 0, costUsd: 0 });
  });

  it('live, reviser throws in round 2: unverified with the best version', async () => {
    const critique = vi.fn()
      .mockResolvedValueOnce(fail('a', 'b', 'c'))
      .mockResolvedValueOnce(fail('a', 'b'));
    const revise = vi.fn().mockResolvedValueOnce(draftN(2)).mockRejectedValueOnce(new Error('boom'));
    const s = setup({ critique, revise });
    expect(await run('live', s.deps)).toEqual([
      card(draft, { status: 'checking', round: 1 }),
      card(draft, { status: 'revising', round: 1 }),
      card(draftN(2), { status: 'revising', round: 2 }),
      card(draftN(2), { status: 'unverified', round: 2, issues: [issue('a'), issue('b')] }),
    ]);
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'live', status: 'unverified', rounds: 2, issues: 2, ms: 0, costUsd: 0 });
  });

  it('AbortError from the critic propagates, logged as aborted', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const s = setup({ critique: vi.fn(async () => { throw abort; }) });
    await expect(run('live', s.deps)).rejects.toBe(abort);
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'live', status: 'aborted', rounds: 1, issues: 0, ms: 0, costUsd: 0 });
  });

  it('an error while the signal is aborted propagates even without the AbortError name', async () => {
    const ctrl = new AbortController();
    const s = setup({ critique: vi.fn(async () => { ctrl.abort(); throw new Error('wrapped'); }) });
    await expect(run('live', s.deps, draft, ctrl.signal)).rejects.toThrow('wrapped');
    expect(s.log).toHaveBeenCalledWith(expect.objectContaining({ status: 'aborted' }));
  });

  it('AbortError from the reviser propagates', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const s = setup({
      critique: vi.fn(async () => fail('a')),
      revise: vi.fn(async () => { throw abort; }),
    });
    await expect(run('live', s.deps)).rejects.toBe(abort);
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'live', status: 'aborted', rounds: 1, issues: 0, ms: 0, costUsd: 0 });
  });

  it('retries the geocoder with the part before the comma', async () => {
    const d = { ...draft, city: 'Lisbon, Portugal' };
    const fetchForecast = vi.fn(async (c: string): Promise<ForecastOutput> =>
      c === 'Lisbon' ? forecast : { found: false, city: c },
    );
    const s = setup({ fetchForecast });
    expect(await run('live', s.deps, d)).toEqual([
      card(d, { status: 'checking', round: 1 }),
      card(d, { status: 'verified', round: 1 }),
    ]);
    expect(fetchForecast.mock.calls.map((c) => c[0])).toEqual(['Lisbon, Portugal', 'Lisbon']);
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'live', status: 'verified', rounds: 1, issues: 0, ms: 0, costUsd: 0 });
  });

  it('city unknown after both lookups: the plan stays, unchecked', async () => {
    const d = { ...draft, city: 'Lake Como, Italy' };
    const fetchForecast = vi.fn(async (c: string): Promise<ForecastOutput> => ({ found: false, city: c }));
    const s = setup({ fetchForecast });
    expect(await run('live', s.deps, d)).toEqual([
      card(d, { status: 'checking', round: 1 }),
      card(d, { status: 'unchecked', round: 0 }),
    ]);
    expect(s.critique).not.toHaveBeenCalled();
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'live', status: 'unchecked', rounds: 0, issues: 0, ms: 0, costUsd: 0 });
  });

  // Found in the browser: "Lake Como" alone geocodes to Florida.
  it('fallback lands in another country: unchecked, never judged against it', async () => {
    const d = { ...draft, city: 'Lake Como, Italy' };
    const florida: ForecastOutput = { ...forecast, location: 'Lake Como, United States' };
    const fetchForecast = vi.fn(async (c: string): Promise<ForecastOutput> =>
      c === 'Lake Como' ? florida : { found: false, city: c },
    );
    const s = setup({ fetchForecast });
    expect(await run('live', s.deps, d)).toEqual([
      card(d, { status: 'checking', round: 1 }),
      card(d, { status: 'unchecked', round: 0 }),
    ]);
    expect(s.critique).not.toHaveBeenCalled();
  });

  it('the country check ignores case and uses the last part of the name', async () => {
    const d = { ...draft, city: 'Kraków, Lesser Poland, POLAND' };
    const krakow: ForecastOutput = { ...forecast, location: 'Kraków, Poland' };
    const s = setup({ fetchForecast: vi.fn(async () => krakow) });
    expect((await run('live', s.deps, d)).at(-1)).toEqual(card(d, { status: 'verified', round: 1 }));
  });

  it('a draft without a country is not country-checked', async () => {
    const s = setup({ fetchForecast: vi.fn(async () => ({ ...forecast, location: 'Lisbon, Portugal' })) });
    expect((await run('live', s.deps)).at(-1)).toEqual(card(draft, { status: 'verified', round: 1 }));
  });

  it('layer 1 finds a temperature, critic passes: still revised, issues summed', async () => {
    const bad = { ...draft, summary: 'Hot, 35–40°.' };
    const revise = vi.fn(async () => draftN(2));
    const s = setup({ revise });
    const out = await run('live', s.deps, bad);
    expect(revise).toHaveBeenCalledTimes(1);
    expect(out).toEqual([
      card(bad, { status: 'checking', round: 1 }),
      card(bad, { status: 'revising', round: 1 }),
      card(draftN(2), { status: 'verified', round: 2 }),
    ]);
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'live', status: 'verified', rounds: 2, issues: 0, ms: 0, costUsd: 0 });
  });

  it('layer 1 and critic issues are concatenated for the reviser', async () => {
    const bad = { ...draft, summary: 'Hot, 35–40°.' };
    const critique = vi.fn().mockResolvedValueOnce(fail('crit')).mockResolvedValueOnce(pass);
    const s = setup({ critique });
    const out = await run('live', s.deps, bad);
    expect(out).toEqual([
      card(bad, { status: 'checking', round: 1 }),
      card(bad, { status: 'revising', round: 1 }),
      card(draftN(2), { status: 'verified', round: 2 }),
    ]);
    expect(s.log).toHaveBeenCalledTimes(1);
    const issues = (s.revise.mock.calls[0] as unknown as [{ issues: ReviewIssue[] }])[0].issues;
    expect(issues).toHaveLength(2);
    expect(issues[1]).toEqual(issue('crit'));
  });

  it('shadow, city unknown: card unchanged, logged unchecked once', async () => {
    const d = { ...draft, city: 'Lisbon, Portugal' };
    const fetchForecast = vi.fn(async (c: string): Promise<ForecastOutput> => ({ found: false, city: c }));
    const s = setup({ fetchForecast });
    expect(await run('shadow', s.deps, d)).toEqual([{ found: true, ...d }]);
    expect(s.critique).not.toHaveBeenCalled();
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'shadow', status: 'unchecked', rounds: 0, issues: 0, ms: 0, costUsd: 0 });
  });

  it('live, deadline passes during revise: no second critique, unverified with best issues', async () => {
    const s = setup();
    const critique = vi.fn(async () => fail('a', 'b'));
    const revise = vi.fn(async () => {
      s.advance(13_000);
      return draftN(2);
    });
    s.deps.critique = critique;
    s.deps.revise = revise;
    expect(await run('live', s.deps)).toEqual([
      card(draft, { status: 'checking', round: 1 }),
      card(draft, { status: 'revising', round: 1 }),
      card(draft, { status: 'unverified', round: 1, issues: [issue('a'), issue('b')] }),
    ]);
    expect(critique).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'live', status: 'unverified', rounds: 1, issues: 2, ms: 13_000, costUsd: 0 });
  });

  it('live, critic throws in round 2: unverified with the best judged version', async () => {
    const critique = vi.fn().mockResolvedValueOnce(fail('a')).mockRejectedValueOnce(new Error('schema'));
    const s = setup({ critique });
    expect(await run('live', s.deps)).toEqual([
      card(draft, { status: 'checking', round: 1 }),
      card(draft, { status: 'revising', round: 1 }),
      card(draft, { status: 'unverified', round: 2, issues: [issue('a')] }),
    ]);
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'live', status: 'unverified', rounds: 2, issues: 1, ms: 0, costUsd: 0 });
  });

  it('live, deadline passes during the geocoder lookup: unchecked, critic never ran', async () => {
    const s = setup();
    s.deps.fetchForecast = vi.fn(async () => {
      s.advance(13_000);
      return forecast;
    });
    expect(await run('live', s.deps)).toEqual([
      card(draft, { status: 'checking', round: 1 }),
      card(draft, { status: 'unchecked', round: 0 }),
    ]);
    expect(s.critique).not.toHaveBeenCalled();
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'live', status: 'unchecked', rounds: 0, issues: 0, ms: 13_000, costUsd: 0 });
  });
  it('shadow, forecast service down: card unchanged, logged unchecked once', async () => {
    const s = setup({ fetchForecast: vi.fn(async () => { throw new Error('Forecast service unavailable'); }) });
    expect(await run('shadow', s.deps)).toEqual([{ found: true, ...draft }]);
    expect(s.critique).not.toHaveBeenCalled();
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'shadow', status: 'unchecked', rounds: 0, issues: 0, ms: 0, costUsd: 0 });
  });

  it('live, forecast service down: card with unchecked, logged once', async () => {
    const s = setup({ fetchForecast: vi.fn(async () => { throw new Error('Forecast service unavailable'); }) });
    expect(await run('live', s.deps)).toEqual([
      card(draft, { status: 'checking', round: 1 }),
      card(draft, { status: 'unchecked', round: 0 }),
    ]);
    expect(s.critique).not.toHaveBeenCalled();
    expect(s.log).toHaveBeenCalledTimes(1);
    expect(s.log).toHaveBeenCalledWith({ mode: 'live', status: 'unchecked', rounds: 0, issues: 0, ms: 0, costUsd: 0 });
  });

  it('AbortError during the forecast lookup propagates, logged as aborted', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const s = setup({ fetchForecast: vi.fn(async () => { throw abort; }) });
    await expect(run('live', s.deps)).rejects.toBe(abort);
    expect(s.log).toHaveBeenCalledWith({ mode: 'live', status: 'aborted', rounds: 0, issues: 0, ms: 0, costUsd: 0 });
  });

  it('live, reviser returns another city: code pins draft.city on critique and output', async () => {
    const critique = vi.fn().mockResolvedValueOnce(fail('x')).mockResolvedValueOnce(pass);
    const revise = vi.fn(async () => ({ ...draftN(2), city: 'Madrid' }));
    const s = setup({ critique, revise });
    const out = await run('live', s.deps);
    expect(critique.mock.calls[1][0].draft.city).toBe('Lisbon');
    expect(out.at(-1)).toEqual(card(draftN(2), { status: 'verified', round: 2 }));
  });

  describe('hard deadline', () => {
    const timedOut = () => Object.assign(new Error('timed out'), { name: 'AbortError' });

    it('one signal reaches the lookup, the critic and the reviser', async () => {
      const ctrl = new AbortController();
      const critique = vi.fn().mockResolvedValueOnce(fail('x')).mockResolvedValueOnce(pass);
      const s = setup({ critique });
      await run('live', s.deps, draft, ctrl.signal);
      const signals = [
        (s.fetchForecast.mock.calls[0] as unknown[])[1] as { signal: AbortSignal },
        critique.mock.calls[0][1] as { abortSignal: AbortSignal },
        (s.revise.mock.calls[0] as unknown[])[1] as { abortSignal: AbortSignal },
      ].map((o) => ('signal' in o ? o.signal : o.abortSignal));
      expect(s.deps.timeout).toHaveBeenCalledWith(REVIEW_DEADLINE_MS);
      expect(signals.every((sig) => sig === signals[0] && !sig.aborted)).toBe(true);
      // It fires on the user's Stop...
      ctrl.abort();
      expect(signals[0].aborted).toBe(true);
    });

    it('...and on the deadline, without a user signal', async () => {
      const s = setup();
      await run('live', s.deps);
      const signal = (s.critique.mock.calls[0] as unknown[])[1] as { abortSignal: AbortSignal };
      s.deadline.abort();
      expect(signal.abortSignal.aborted).toBe(true);
    });

    it('deadline hits mid-critique in round 1: unchecked, not a Stop', async () => {
      const s = setup();
      s.deps.critique = vi.fn(async () => {
        s.deadline.abort();
        throw timedOut();
      });
      expect(await run('live', s.deps)).toEqual([
        card(draft, { status: 'checking', round: 1 }),
        card(draft, { status: 'unchecked', round: 1 }),
      ]);
      expect(s.log).toHaveBeenCalledWith({ mode: 'live', status: 'unchecked', rounds: 1, issues: 0, ms: 0, costUsd: 0 });
    });

    it('deadline hits mid-revise: unverified with the best version', async () => {
      const s = setup({ critique: vi.fn(async () => fail('a')) });
      s.deps.revise = vi.fn(async () => {
        s.deadline.abort();
        throw timedOut();
      });
      expect((await run('live', s.deps)).at(-1)).toEqual(
        card(draft, { status: 'unverified', round: 1, issues: [issue('a')] }),
      );
    });

    it('deadline hits during the lookup: unchecked card', async () => {
      const s = setup();
      s.deps.fetchForecast = vi.fn(async () => {
        s.deadline.abort();
        throw new Error('Forecast service unavailable');
      });
      expect((await run('live', s.deps)).at(-1)).toEqual(card(draft, { status: 'unchecked', round: 0 }));
      expect(s.critique).not.toHaveBeenCalled();
    });

    it('shadow is bounded too: a timed-out critic logs unchecked, card unchanged', async () => {
      const s = setup();
      s.deps.critique = vi.fn(async () => {
        s.deadline.abort();
        throw timedOut();
      });
      expect(await run('shadow', s.deps)).toEqual([{ found: true, ...draft }]);
      expect(s.log).toHaveBeenCalledWith({ mode: 'shadow', status: 'unchecked', rounds: 1, issues: 0, ms: 0, costUsd: 0 });
    });

    it('a Stop that lands after the deadline is still a Stop', async () => {
      const ctrl = new AbortController();
      const s = setup();
      s.deps.critique = vi.fn(async () => {
        s.deadline.abort();
        ctrl.abort();
        throw timedOut();
      });
      await expect(run('live', s.deps, draft, ctrl.signal)).rejects.toThrow('timed out');
    });
  });
});

describe('reviewTrip cost', () => {
  type Opts = { onCost?: (usd: number | null) => void };

  // One line per review: the critic's Terra calls are the expensive part.
  it('sums every critic and reviser call into the log line', async () => {
    const critique = vi
      .fn()
      .mockImplementationOnce(async (_: unknown, o: Opts) => (o.onCost?.(0.002), fail('x')))
      .mockImplementationOnce(async (_: unknown, o: Opts) => (o.onCost?.(0.003), pass));
    const revise = vi.fn(async (_: unknown, o: Opts) => (o.onCost?.(0.0005), draftN(2)));
    const s = setup({ critique, revise } as Partial<ReviewDeps>);
    await run('live', s.deps);
    expect(s.log.mock.calls[0][0].costUsd).toBeCloseTo(0.0055);
  });

  it('is null when a call ran on a model without a price', async () => {
    const critique = vi.fn(async (_: unknown, o: Opts) => (o.onCost?.(null), pass));
    const s = setup({ critique } as Partial<ReviewDeps>);
    await run('shadow', s.deps);
    expect(s.log.mock.calls[0][0].costUsd).toBeNull();
  });
});
