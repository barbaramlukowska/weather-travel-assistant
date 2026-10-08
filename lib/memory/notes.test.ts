import { describe, expect, it } from 'vitest';
import { addNote, removeNote } from './notes';
import type { Memory } from './schema';

const tenNotes = Array.from({ length: 10 }, (_, i) => `note ${i}`);

describe('addNote', () => {
  it('adds a note as the newest one', () => {
    expect(addNote({ notes: ['vegetarian'] }, 'jazz cafés')).toEqual({
      memory: { notes: ['vegetarian', 'jazz cafés'] },
      text: 'jazz cafés',
    });
  });

  it('starts a list and keeps the other categories', () => {
    const memory: Memory = { climate: { maxComfortC: 28 } };
    expect(addNote(memory, 'vegetarian').memory).toEqual({
      climate: { maxComfortC: 28 },
      notes: ['vegetarian'],
    });
  });

  it('drops the oldest note when an 11th arrives', () => {
    const result = addNote({ notes: tenNotes }, 'newest');
    expect(result.memory.notes).toEqual([...tenNotes.slice(1), 'newest']);
    expect(result.dropped).toBe('note 0');
  });

  // A repeated note matters to the user, so it should not be the next to fall
  // out just because it was first saved long ago.
  it('moves a repeated note to the end instead of saving it twice', () => {
    const result = addNote({ notes: ['Vegetarian', 'jazz cafés'] }, ' vegetarian');
    expect(result.memory.notes).toEqual(['jazz cafés', 'Vegetarian']);
    expect(result.text).toBe('Vegetarian');
    expect(result.dropped).toBeUndefined();
  });

  // Review Focus 3.
  it('does not drop anything when a repeated note arrives at 10/10', () => {
    const result = addNote({ notes: tenNotes }, 'NOTE 0');
    expect(result.memory.notes).toEqual([...tenNotes.slice(1), 'note 0']);
    expect(result.dropped).toBeUndefined();
  });

  it('does not change the memory it was given', () => {
    const memory: Memory = { notes: ['vegetarian'] };
    addNote(memory, 'jazz cafés');
    expect(memory).toEqual({ notes: ['vegetarian'] });
  });
});

describe('removeNote', () => {
  // Review Focus 4.
  it('removes the matching note, whatever the case or outer spaces', () => {
    expect(removeNote({ notes: ['Vegetarian', 'jazz cafés'] }, ' vegetarian ')).toEqual({
      ok: true,
      memory: { notes: ['jazz cafés'] },
      removed: 'Vegetarian',
    });
  });

  it('leaves no empty notes list behind', () => {
    const result = removeNote({ climate: { maxComfortC: 28 }, notes: ['vegetarian'] }, 'vegetarian');
    expect(result).toEqual({ ok: true, memory: { climate: { maxComfortC: 28 } }, removed: 'vegetarian' });
  });

  it('reports a note that is not saved', () => {
    expect(removeNote({ notes: ['vegetarian'] }, 'loves steak')).toEqual({
      ok: false,
      error: 'No saved note matches: loves steak',
    });
    expect(removeNote({}, 'vegetarian')).toEqual({
      ok: false,
      error: 'No saved note matches: vegetarian',
    });
  });

  it('echoes at most 120 characters of the text back', () => {
    const result = removeNote({}, 'x'.repeat(300));
    expect(result).toEqual({ ok: false, error: `No saved note matches: ${'x'.repeat(120)}` });
  });
});
