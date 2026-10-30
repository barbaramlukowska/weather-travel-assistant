import { Output, generateText } from 'ai';
import { getChatModel } from '@/lib/model';
import { costUsd } from '@/lib/pricing';
import {
  REVISER_SYSTEM_PROMPT,
  buildRevisePrompt,
  type ReviewInput,
} from './prompt';
import { tripPlanSchema, type ReviewIssue, type TripDraft } from './schema';

// The reviser is the chat model on purpose: it wrote the draft in the same
// voice, and only the checker needs to be a different model. No catch, like
// critiqueTrip; a 2-item list fails tripPlanSchema.min(3) and throws.
export async function reviseTrip(
  input: ReviewInput & { issues: ReviewIssue[] },
  opts: { abortSignal?: AbortSignal; onCost?: (usd: number | null) => void } = {},
): Promise<TripDraft> {
  const { output } = await generateText({
    model: getChatModel(),
    system: REVISER_SYSTEM_PROMPT,
    prompt: buildRevisePrompt(input),
    output: Output.object({ schema: tripPlanSchema }),
    abortSignal: opts.abortSignal,
    onEnd: ({ model, totalUsage }) => opts.onCost?.(costUsd(model.modelId, totalUsage)),
  });
  return output;
}
