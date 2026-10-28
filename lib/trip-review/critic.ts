import { Output, generateText } from 'ai';
import { getCriticModel } from '@/lib/model';
import { costUsd } from '@/lib/pricing';
import { CRITIC_SYSTEM_PROMPT, buildCriticPrompt, type ReviewInput } from './prompt';
import {
  MAX_ISSUES,
  MAX_ITEM_CHARS,
  MAX_PROBLEM_CHARS,
  criticWireSchema,
  type CriticVerdict,
} from './schema';

// Approves iff no issue is named; `pass` alone decides nothing. The eval
// scores this same rule, so it measures what ships.
export function criticApproves(verdict: CriticVerdict): boolean {
  return verdict.issues.length === 0;
}

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

// No catch: what a failure means is the orchestrator's call.
export async function critiqueTrip(
  input: ReviewInput,
  opts: { abortSignal?: AbortSignal; onCost?: (usd: number | null) => void } = {},
): Promise<CriticVerdict> {
  const { output } = await generateText({
    model: getCriticModel(),
    // Reasoning models ignore it; the others get minimum variance.
    temperature: 0,
    system: CRITIC_SYSTEM_PROMPT,
    prompt: buildCriticPrompt(input),
    output: Output.object({ schema: criticWireSchema }),
    abortSignal: opts.abortSignal,
    // Before the checks below: a verdict that throws was still billed.
    onEnd: ({ model, totalUsage }) => opts.onCost?.(costUsd(model.modelId, totalUsage)),
  });
  // A "no" without a reason would otherwise read as "verified".
  if (!output.pass && output.issues.length === 0) {
    throw new Error('Critic failed the draft but named no issue');
  }
  return {
    issues: output.issues.slice(0, MAX_ISSUES).map(({ field, item, problem }) => ({
      field,
      ...(item === null ? {} : { item: clip(item, MAX_ITEM_CHARS) }),
      problem: clip(problem, MAX_PROBLEM_CHARS),
    })),
    pass: output.pass,
  };
}
