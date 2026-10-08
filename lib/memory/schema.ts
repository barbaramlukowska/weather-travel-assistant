import { z } from 'zod';

// A closed set of categories, not a key the model makes up: free keys drift
// ("heat" vs "temperaturePreference") and then never overwrite each other.
export const MEMORY_CATEGORIES = [
  'homeCity',
  'climate',
  'travelParty',
  'interests',
  'avoid',
] as const;

// Five categories x 120 characters: memory can never exceed ~600 characters,
// so no separate "at most N facts" rule is needed — the shape is the limit.
export const MAX_MEMORY_VALUE_LENGTH = 120;

export const memoryCategorySchema = z.enum(MEMORY_CATEGORIES);
export type MemoryCategory = z.infer<typeof memoryCategorySchema>;

export const memoryValueSchema = z.string().trim().min(1).max(MAX_MEMORY_VALUE_LENGTH);

// An object, not a list: overwriting is assignment and forgetting is deleting
// a key, so two conflicting values for one category cannot exist at all.
// The same schema guards the browser store and the API route.
export const memorySchema = z.partialRecord(memoryCategorySchema, memoryValueSchema);
export type Memory = z.infer<typeof memorySchema>;
