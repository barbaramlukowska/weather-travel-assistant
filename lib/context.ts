import type { UIMessage } from 'ai';

// Small stand-in that still pairs with its tool call.
const PRUNED_OUTPUT = { note: 'Older tool result omitted to save context.' };

// Strip heavy tool outputs from all but the last `keepRecent` messages.
// Only the copy sent to the model is pruned; the client keeps full history.
// Generic so callers with a tool-typed UIMessage keep their type.
export function pruneOldToolResults<M extends UIMessage>(
  messages: M[],
  keepRecent = 4,
): M[] {
  const cutoff = messages.length - keepRecent;
  if (cutoff <= 0) return messages;

  return messages.map((message, index) => {
    if (index >= cutoff) return message;

    const parts = message.parts.map((part) =>
      part.type.startsWith('tool-') && 'output' in part && part.output !== undefined
        ? ({ ...part, output: PRUNED_OUTPUT } as typeof part)
        : part,
    );

    return { ...message, parts } as M;
  });
}
