import { z } from 'zod';

// One entry of the chat list. The store parses entries one by one, so one
// bad entry (a hand edit, another app version) drops only itself.
export const chatIndexEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  updatedAt: z.number(),
});
export type ChatIndexEntry = z.infer<typeof chatIndexEntrySchema>;

// Only the shape the list and useChat rely on, checked when a chat is
// opened. looseObject, not object: Zod 4's object strips unknown keys, so
// `text`, `state` and `output` would vanish, and the next save would make
// that loss permanent.
export const storedMessagesSchema = z.array(
  z.looseObject({
    id: z.string(),
    role: z.enum(['system', 'user', 'assistant']),
    parts: z.array(z.looseObject({ type: z.string() })),
  }),
);
