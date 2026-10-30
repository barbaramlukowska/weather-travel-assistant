import { describe, expect, it } from 'vitest';
import type { TurnLog } from '../lib/turn-log';
import { formatPerf, percentile, perfRegressions, perfStats, type PerfStats } from './perf';

function turn(ms: number, costUsd: number | null): TurnLog {
  return {
    status: 'done',
    model: 'gpt-5.6-luna',
    steps: 1,
    ttftMs: null,
    ms,
    tokens: { input: 0, cached: 0, output: 0, reasoning: 0 },
    costUsd,
    tools: [],
  };
}

describe('percentile', () => {
  const ten = [10, 1, 9, 2, 8, 3, 7, 4, 6, 5];

  it('takes the median and the near-worst value by nearest rank', () => {
    expect(percentile(ten, 50)).toBe(5);
    expect(percentile(ten, 95)).toBe(10);
  });

  it('is 0 for no values', () => {
    expect(percentile([], 95)).toBe(0);
  });
});

describe('perfStats', () => {
  it('sums the cost of every turn', () => {
    expect(perfStats([turn(1000, 0.001), turn(3000, 0.002)])).toEqual({
      turns: 2,
      p50Ms: 1000,
      p95Ms: 3000,
      costUsd: 0.003,
    });
  });

  // A turn on an unpriced model makes the total unknown, not smaller.
  it('has no total cost when one turn has none', () => {
    expect(perfStats([turn(1000, 0.001), turn(1000, null)]).costUsd).toBeNull();
  });
});

describe('perfRegressions', () => {
  const base: PerfStats = { turns: 10, p50Ms: 2000, p95Ms: 5000, costUsd: 0.01 };

  it('passes run-to-run noise', () => {
    expect(perfRegressions({ turns: 10, p50Ms: 2500, p95Ms: 6000, costUsd: 0.011 }, base)).toEqual([]);
  });

  it('flags a slower p50 and p95', () => {
    const found = perfRegressions({ ...base, p50Ms: 3100, p95Ms: 8000 }, base);
    expect(found).toEqual([
      'p50 3.1s is over 1.3× the baseline 2.0s',
      'p95 8.0s is over 1.3× the baseline 5.0s',
    ]);
  });

  // Compared per turn: adding cases adds turns, which is not a regression.
  it('flags cost per turn, not the total', () => {
    expect(perfRegressions({ ...base, turns: 20, costUsd: 0.02 }, base)).toEqual([]);
    expect(perfRegressions({ ...base, costUsd: 0.013 }, base)).toEqual([
      'cost per turn $0.001300 is over 1.15× the baseline $0.001000',
    ]);
  });

  it('skips cost when either side has none', () => {
    expect(perfRegressions({ ...base, costUsd: null }, base)).toEqual([]);
  });
});

describe('formatPerf', () => {
  it('prints seconds and dollars', () => {
    expect(formatPerf({ turns: 41, p50Ms: 2140, p95Ms: 5380, costUsd: 0.07123 })).toBe(
      '41 turns, p50 2.1s, p95 5.4s, cost $0.0712',
    );
  });

  it('says when the cost is unknown', () => {
    expect(formatPerf({ turns: 1, p50Ms: 0, p95Ms: 0, costUsd: null })).toBe(
      '1 turns, p50 0.0s, p95 0.0s, cost unknown',
    );
  });
});
