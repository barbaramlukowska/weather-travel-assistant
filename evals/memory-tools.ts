import { tool } from 'ai';
import { geocodeCity, type Geocode } from '../lib/geocode';
import { addNote, removeNote, resolveRememberInput, type Memory } from '../lib/memory';
import { tools, type ForgetOutput, type RememberOutput } from '../lib/tools';

// THE one place where evals and production differ (spec, "Evale"). In the app
// remember/forget have no execute: the server stream ends on the call and the
// browser writes localStorage in useChat's onToolCall. generateText in Node
// has no browser, and a tool without execute would fail the run ("ToolInvocation
// must have a result"), so here the same tools get an execute that writes to
// a plain object. Descriptions, input schemas and output shapes stay the
// production ones, and remember resolves its input with the same
// resolveRememberInput as the browser — a city is stored under the
// geocoder's name here too.
// One more, smaller gap: in the app the reply after remember is written in a
// SECOND request whose system prompt already holds the new fact; here the
// loop finishes inside one generateText with the turn's original prompt. The
// fact reaches the prompt from the next turn on.
export function createEvalMemory(initial: Memory = {}, geocode: Geocode = geocodeCity) {
  const memory: Memory = { ...initial };

  const evalTools = {
    ...tools,
    remember: tool({
      ...tools.remember,
      execute: async (input): Promise<RememberOutput> => {
        // Notes take the same pure path as in the browser (lib/memory/notes.ts).
        if (input.category === 'notes') {
          const added = addNote(memory, input.value.text);
          memory.notes = added.memory.notes;
          return { saved: true, category: 'notes', value: { text: added.text }, dropped: added.dropped };
        }
        const resolved = await resolveRememberInput(input, geocode);
        // generateText turns a thrown error into a tool-error the model reads
        // — what output-error is in the app.
        if (!resolved.ok) throw new Error(resolved.error);
        Object.assign(memory, { [resolved.fact.category]: resolved.fact.value });
        return { saved: true, ...resolved.fact };
      },
    }),
    forget: tool({
      ...tools.forget,
      execute: async (input): Promise<ForgetOutput> => {
        if (input.category === 'notes') {
          const removed = removeNote(memory, input.note);
          if (!removed.ok) throw new Error(removed.error);
          if (removed.memory.notes) memory.notes = removed.memory.notes;
          else delete memory.notes;
          return { removed: true, category: 'notes', note: removed.removed };
        }
        delete memory[input.category];
        return { removed: true, category: input.category };
      },
    }),
  };

  return { tools: evalTools, memory };
}
