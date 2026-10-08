import { MAX_NOTE_LENGTH, MAX_NOTES, normalizeNote, type Memory } from './schema';

// Pure note operations: memory in, new memory out. The browser runs them on a
// fresh read of localStorage (components/chat/client-tools.ts) and the evals
// on a plain object (evals/memory-tools.ts), so both behave the same. The
// text has already passed noteTextSchema in the tool input.

export type AddNoteResult = { memory: Memory; text: string; dropped?: string };

export function addNote(memory: Memory, text: string): AddNoteResult {
  const notes = memory.notes ?? [];
  const existing = notes.find((note) => normalizeNote(note) === normalizeNote(text));

  // A repeated note moves to the end — the newest, so the last to be dropped
  // — and keeps the wording the user already saw in the panel.
  if (existing !== undefined) {
    const rest = notes.filter((note) => note !== existing);
    return { memory: { ...memory, notes: [...rest, existing] }, text: existing };
  }

  const next = [...notes, text];
  const dropped = next.length > MAX_NOTES ? next.shift() : undefined;
  return { memory: { ...memory, notes: next }, text, dropped };
}

export type RemoveNoteResult =
  | { ok: true; memory: Memory; removed: string }
  | { ok: false; error: string };

export function removeNote(memory: Memory, text: string): RemoveNoteResult {
  const notes = memory.notes ?? [];
  const match = notes.find((note) => normalizeNote(note) === normalizeNote(text));
  if (match === undefined) {
    return { ok: false, error: `No saved note matches: ${text.slice(0, MAX_NOTE_LENGTH)}` };
  }

  const rest = notes.filter((note) => note !== match);
  const next: Memory = { ...memory, notes: rest };
  // The schema has no empty notes list: "no notes" is a missing key.
  if (rest.length === 0) delete next.notes;
  return { ok: true, memory: next, removed: match };
}
