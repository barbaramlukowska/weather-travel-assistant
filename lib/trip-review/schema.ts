import { z } from 'zod';

// Output contract for the trip-plan card. Every field must be derived from
// real tool results (forecast), never from the model's own knowledge.
export const tripPlanSchema = z.object({
  city: z
    .string()
    .describe('City name with country, e.g. "Lisbon, Portugal"'),
  summary: z
    .string()
    .describe(
      'One or two sentences based on the actual forecast data: mention the ' +
        'temperature range and rain risk. Do not give generic travel advice.',
    ),
  packingList: z
    .array(z.string())
    .min(3)
    .max(6)
    .describe(
      'Items to pack, each justified by the forecast or by the known user ' +
        'preferences (e.g. "umbrella" only if rain is likely, "sunscreen" ' +
        'only if sunny, "a dog lead" for someone who travels with their dog). ' +
        'Short phrases.',
    ),
});
export type TripDraft = z.infer<typeof tripPlanSchema>;

// `item` = the packing-list entry (absent for summary issues). Caps keep the
// reviser's prompt and the card short.
export const MAX_ISSUES = 6;
export const MAX_PROBLEM_CHARS = 160;
export const MAX_ITEM_CHARS = 80;

export const reviewIssueSchema = z.object({
  field: z.enum(['summary', 'packingList']),
  item: z.string().max(MAX_ITEM_CHARS).optional(),
  problem: z.string().max(MAX_PROBLEM_CHARS),
});
export type ReviewIssue = z.infer<typeof reviewIssueSchema>;

// `issues` before `pass`: evidence first, verdict second (as in evals/judge.ts).
export const criticVerdictSchema = z.object({
  issues: z.array(reviewIssueSchema).max(MAX_ISSUES),
  pass: z.boolean(),
});
// What the model returns. `item: null`, not optional: OpenAI strict mode
// rejects optional fields. No hard limits: not every provider enforces them,
// so critiqueTrip clips instead of losing the whole verdict.
export const criticWireSchema = z.object({
  issues: z
    .array(
      z.object({
        field: z.enum(['summary', 'packingList']),
        item: z.string().nullable().describe(`The packing-list item, at most ${MAX_ITEM_CHARS} characters`),
        problem: z.string().describe(`One sentence, at most ${MAX_PROBLEM_CHARS} characters`),
      }),
    )
    .describe(`At most ${MAX_ISSUES} issues, most important first`),
  pass: z.boolean(),
});

export type CriticVerdict = z.infer<typeof criticVerdictSchema>;

export type ReviewStatus = 'checking' | 'revising' | 'verified' | 'unverified' | 'unchecked';

export type TripReview = {
  status: ReviewStatus;
  round: number;
  issues?: ReviewIssue[];
};
