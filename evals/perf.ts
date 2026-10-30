import type { TurnLog } from '../lib/turn-log';

export type PerfStats = { turns: number; p50Ms: number; p95Ms: number; costUsd: number | null };

// What evals/perf-baseline.json holds: the stats plus enough to tell whether
// a later run is comparable at all.
export type PerfBaseline = PerfStats & { date: string; model: string };

// Measured noise between unchanged runs (2026-10-28): p95 ±11%, cost ±3%.
// At 1.5× a 3s slower tool passed unnoticed; 1.3× still leaves room for noise.
export const LATENCY_TOLERANCE = 1.3;
export const COST_TOLERANCE = 1.15;

// Nearest rank: the smallest value with at least p% of values at or below it.
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil((p / 100) * sorted.length) - 1)];
}

export function perfStats(turns: readonly TurnLog[]): PerfStats {
  const ms = turns.map((t) => t.ms);
  const costUsd = turns.reduce<number | null>(
    (sum, t) => (sum === null || t.costUsd === null ? null : sum + t.costUsd),
    0,
  );
  return { turns: turns.length, p50Ms: percentile(ms, 50), p95Ms: percentile(ms, 95), costUsd };
}

const sec = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

export function perfRegressions(now: PerfStats, base: PerfStats): string[] {
  const found: string[] = [];
  for (const key of ['p50Ms', 'p95Ms'] as const) {
    if (now[key] > base[key] * LATENCY_TOLERANCE) {
      const name = key.replace('Ms', '');
      found.push(`${name} ${sec(now[key])} is over ${LATENCY_TOLERANCE}× the baseline ${sec(base[key])}`);
    }
  }
  if (now.costUsd !== null && base.costUsd !== null && now.turns > 0 && base.turns > 0) {
    const nowPerTurn = now.costUsd / now.turns;
    const basePerTurn = base.costUsd / base.turns;
    if (nowPerTurn > basePerTurn * COST_TOLERANCE) {
      found.push(
        `cost per turn $${nowPerTurn.toFixed(6)} is over ${COST_TOLERANCE}× the baseline $${basePerTurn.toFixed(6)}`,
      );
    }
  }
  return found;
}

export function formatPerf(s: PerfStats): string {
  const cost = s.costUsd === null ? 'unknown' : `$${s.costUsd.toFixed(4)}`;
  return `${s.turns} turns, p50 ${sec(s.p50Ms)}, p95 ${sec(s.p95Ms)}, cost ${cost}`;
}
