import { tool } from 'ai';
import type { Memory } from '../lib/memory';
import { tools, type ForgetOutput, type RememberOutput } from '../lib/tools';

// THE one place where evals and production differ (spec, "Evale"). In the app
// remember/forget have no execute: the server stream ends on the call and the
// browser writes localStorage in useChat's onToolCall. generateText in Node
// has no browser, and a tool without execute would fail the run ("ToolInvocation
// must have a result"), so here the same tools get an execute that writes to
// a plain object. Descriptions, input schemas and output shapes stay the
// production ones.
// One more, smaller gap: in the app the reply after remember is written in a
// SECOND request whose system prompt already holds the new fact; here the
// loop finishes inside one generateText with the turn's original prompt. The
// fact reaches the prompt from the next turn on.
export function createEvalMemory(initial: Memory = {}) {
  const memory: Memory = { ...initial };

  const evalTools = {
    ...tools,
    remember: tool({
      ...tools.remember,
      execute: async ({ category, value }): Promise<RememberOutput> => {
        memory[category] = value;
        return { saved: true, category, value };
      },
    }),
    forget: tool({
      ...tools.forget,
      execute: async ({ category }): Promise<ForgetOutput> => {
        delete memory[category];
        return { removed: true, category };
      },
    }),
  };

  return { tools: evalTools, memory };
}
