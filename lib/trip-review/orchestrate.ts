import { fetchForecast } from '../forecast';
import { roundUsd } from '../pricing';
import type { Memory } from '../memory';
import type { ForecastOutput, TripPlanOutput } from '../tools';
import { checkDraft } from './checks';
import { critiqueTrip } from './critic';
import { reviseTrip } from './revise';
import type { ReviewIssue, ReviewStatus, TripDraft } from './schema';

// Without a cap, a critic that always finds something would loop forever.
export const MAX_REVISIONS = 2;

// The route has 30s for the whole turn. Checked before each call and enforced
// as an abort signal on every call.
export const REVIEW_DEADLINE_MS = 12_000;

export type ReviewMode = 'off' | 'shadow' | 'live';

// 'live' waits for the UI states (Task 7) and the LLM10 threat-model row (Task 8).
const DEFAULT_REVIEW_MODE: ReviewMode = 'off';

const MODES: readonly ReviewMode[] = ['off', 'shadow', 'live'];

// Read per call: no rebuild on a flag change, and tests can stub the env.
export function reviewMode(): ReviewMode {
  const raw = process.env.TRIP_REVIEW;
  return MODES.find((m) => m === raw) ?? DEFAULT_REVIEW_MODE;
}

export type ReviewStats = {
  mode: ReviewMode;
  // 'aborted' = user's Stop; logged because the calls were billed.
  status: ReviewStatus | 'aborted';
  rounds: number; // critic rounds actually run
  // live: issues on the card; shadow: all found, layer 1 even if the critic failed.
  issues: number;
  ms: number;
  // Critic and reviser calls that finished; one cut off by Stop or the
  // deadline is billed but missing, so this is a lower bound. null = unpriced model.
  costUsd: number | null;
};

export type ReviewDeps = {
  fetchForecast: (city: string, init?: { signal?: AbortSignal }) => Promise<ForecastOutput>;
  critique: typeof critiqueTrip;
  revise: typeof reviseTrip;
  now: () => number;
  log: (stats: ReviewStats) => void;
  timeout: (ms: number) => AbortSignal; // injected: tests fire it by hand
};

const defaultDeps: ReviewDeps = {
  fetchForecast,
  critique: critiqueTrip,
  revise: reviseTrip,
  now: Date.now,
  log: (s) => console.log('trip review:', s),
  timeout: (ms) => AbortSignal.timeout(ms),
};

type Found = Extract<ForecastOutput, { found: true }>;

// Not every name the model writes geocodes ("Lake Como, Italy"), so retry
// once with the part before the comma.
async function lookup(city: string, deps: ReviewDeps, signal: AbortSignal): Promise<Found | null> {
  const first = await deps.fetchForecast(city, { signal });
  if (first.found) return sameCountry(city, first) ? first : null;
  const short = city.split(',')[0].trim();
  if (short === city || short === '') return null;
  const second = await deps.fetchForecast(short, { signal });
  return second.found && sameCountry(city, second) ? second : null;
}

// "Lake Como" alone geocodes to Florida. Wrong country = not found: an
// unchecked plan beats one judged against the wrong forecast.
function sameCountry(city: string, found: Found): boolean {
  const parts = city.split(',');
  if (parts.length < 2) return true;
  const want = parts.at(-1)!.trim().toLowerCase();
  const got = found.location.split(',').at(-1)!.trim().toLowerCase();
  return want === got;
}

export async function* reviewTrip(
  draft: TripDraft,
  memory: Memory,
  opts: { mode: ReviewMode; abortSignal?: AbortSignal; deps?: Partial<ReviewDeps> },
): AsyncGenerator<TripPlanOutput> {
  const { mode, abortSignal } = opts;
  const deps: ReviewDeps = { ...defaultDeps, ...opts.deps };

  if (mode === 'off') {
    yield { found: true, ...draft };
    return;
  }

  const start = deps.now();
  let costUsd: number | null = 0;
  const onCost = (usd: number | null) => {
    costUsd = costUsd === null || usd === null ? null : costUsd + usd;
  };
  const finish = (status: ReviewStats['status'], rounds: number, issues: number) =>
    deps.log({
      mode, status, rounds, issues, ms: deps.now() - start,
      costUsd: costUsd === null ? null : roundUsd(costUsd),
    });

  // User's Stop or our deadline, whichever comes first.
  const deadline = deps.timeout(REVIEW_DEADLINE_MS);
  const signal = abortSignal ? AbortSignal.any([abortSignal, deadline]) : deadline;

  // Stop goes to the caller; the deadline is an ordinary stop condition, even
  // though the SDK reports both as AbortError.
  const rethrowIfStopped = (error: unknown, rounds: number) => {
    const userStop =
      abortSignal?.aborted === true ||
      (!deadline.aborted && error instanceof Error && error.name === 'AbortError');
    if (!userStop) return;
    finish('aborted', rounds, 0);
    throw error;
  };

  if (mode === 'live') {
    yield { found: true, ...draft, review: { status: 'checking', round: 1 } };
  }

  // Can't check (not found, service down, deadline) != plan is wrong.
  let forecast: Found | null = null;
  try {
    forecast = await lookup(draft.city, deps, signal);
  } catch (error) {
    rethrowIfStopped(error, 0);
  }
  if (!forecast) {
    finish('unchecked', 0, 0);
    yield mode === 'shadow'
      ? { found: true, ...draft }
      : { found: true, ...draft, review: { status: 'unchecked', round: 0 } };
    return;
  }

  // Shadow: log only, the card stays as is.
  if (mode === 'shadow') {
    let issues = checkDraft(draft, forecast).length;
    let status: ReviewStatus = 'unchecked';
    try {
      const verdict = await deps.critique({ draft, forecast, memory }, { abortSignal: signal, onCost });
      issues += verdict.issues.length;
      status = issues === 0 ? 'verified' : 'unverified';
    } catch (error) {
      rethrowIfStopped(error, 1);
    }
    finish(status, 1, issues);
    yield { found: true, ...draft };
    return;
  }

  // Live: critic -> reviser loop. Every exit goes through `done()`.
  let current = draft;
  let best: { draft: TripDraft; issues: ReviewIssue[] } | null = null;
  let rounds = 0;

  const done = (status: ReviewStatus, result: TripDraft, issues?: ReviewIssue[]): TripPlanOutput => {
    finish(status, rounds, issues?.length ?? 0);
    return {
      found: true,
      ...result,
      review: { status, round: rounds, ...(issues ? { issues } : {}) },
    };
  };

  // Any stop but success: best judged version, or the draft if none was judged.
  const fallback = () =>
    best ? done('unverified', best.draft, best.issues) : done('unchecked', draft);

  for (let round = 1; round <= MAX_REVISIONS + 1; round++) {
    // Stop: out of time.
    if (deps.now() - start > REVIEW_DEADLINE_MS) {
      yield fallback();
      return;
    }

    // Only the issue count decides (see criticApproves).
    let issues: ReviewIssue[];
    rounds = round;
    try {
      const verdict = await deps.critique({ draft: current, forecast, memory }, { abortSignal: signal, onCost });
      issues = [...checkDraft(current, forecast), ...verdict.issues];
    } catch (error) {
      rethrowIfStopped(error, rounds);
      // Stop: critic failed.
      yield fallback();
      return;
    }

    // Stop: success.
    if (issues.length === 0) {
      yield done('verified', current);
      return;
    }

    if (!best || issues.length < best.issues.length) {
      best = { draft: current, issues };
    } else {
      // Stop: no progress.
      yield fallback();
      return;
    }

    // Stop: budget used up (the last round is critique-only).
    if (round === MAX_REVISIONS + 1) {
      yield fallback();
      return;
    }

    // Stop: the critique ate the remaining time.
    if (deps.now() - start > REVIEW_DEADLINE_MS) {
      yield fallback();
      return;
    }

    yield { found: true, ...current, review: { status: 'revising', round } };
    try {
      current = await deps.revise(
        { draft: current, forecast, memory, issues },
        { abortSignal: signal, onCost },
      );
      // The forecast belongs to draft.city; code, not the prompt, keeps it.
      current = { ...current, city: draft.city };
    } catch (error) {
      rethrowIfStopped(error, rounds);
      // Stop: reviser failed.
      yield fallback();
      return;
    }
  }
}
