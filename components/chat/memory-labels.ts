import type { MemoryCategory } from '@/lib/memory';

// UI copy per category. A Record over the enum, so a new category without a
// label is a compile error rather than a blank row in the panel.
export const CATEGORY_LABELS: Record<MemoryCategory, string> = {
  homeCity: 'Home city',
  climate: 'Climate',
  travelParty: 'Travel party',
  interests: 'Interests',
  avoid: 'Things to avoid',
};
