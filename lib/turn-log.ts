import type { StepResult, ToolSet } from 'ai';
import { costUsd, roundUsd } from './pricing';

export type TurnStep = Pick<StepResult<ToolSet>, 'model' | 'usage' | 'toolCalls' | 'performance'>;

// Numbers and tool names only — no prompts or replies, so the log never holds
// what the user wrote or what memory says.
export type TurnLog = {
  status: 'done' | 'aborted';
  model: string | null;
  steps: number;
  ttftMs: number | null;
  ms: number;
  tokens: { input: number; cached: number; output: number; reasoning: number };
  costUsd: number | null;
  tools: { name: string; ms: number }[];
};

const round = (ms: number | undefined) => (ms === undefined ? null : Math.round(ms));

// Covers the chat model's steps only. The critic and the compaction recap are
// separate model calls and do not show up here.
export function summarizeTurn(steps: readonly TurnStep[], status: TurnLog['status']): TurnLog {
  const tokens = { input: 0, cached: 0, output: 0, reasoning: 0 };
  let ms = 0;
  let cost: number | null = 0;
  const tools: TurnLog['tools'] = [];

  for (const step of steps) {
    const { usage, performance } = step;
    tokens.input += usage.inputTokens ?? 0;
    tokens.cached += usage.inputTokenDetails.cacheReadTokens ?? 0;
    tokens.output += usage.outputTokens ?? 0;
    tokens.reasoning += usage.outputTokenDetails.reasoningTokens ?? 0;
    ms += performance.stepTimeMs;

    const stepCost = costUsd(step.model.modelId, usage);
    cost = cost === null || stepCost === null ? null : cost + stepCost;

    for (const call of step.toolCalls) {
      tools.push({ name: call.toolName, ms: Math.round(performance.toolExecutionMs[call.toolCallId] ?? 0) });
    }
  }

  return {
    status,
    model: steps[0]?.model.modelId ?? null,
    steps: steps.length,
    // The first step's first chunk is the wait the user feels; later steps
    // already have something on screen.
    // Whole ms: the SDK's sub-ms digits are noise in a log.
    ttftMs: round(steps[0]?.performance.timeToFirstOutputMs),
    ms: Math.round(ms),
    tokens,
    costUsd: cost === null ? null : roundUsd(cost),
    tools,
  };
}

// One JSON line per turn, so p50/p95 can be computed from exported logs.
export function logTurn(steps: readonly TurnStep[], status: TurnLog['status']) {
  console.log('chat turn:', JSON.stringify(summarizeTurn(steps, status)));
}
