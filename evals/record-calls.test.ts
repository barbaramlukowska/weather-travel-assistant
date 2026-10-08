import { describe, expect, it } from 'vitest';
import { recordCalls } from './record-calls';

describe('recordCalls', () => {
  it('keeps every call of every step, in order', () => {
    const steps = [
      { toolCalls: [{ toolName: 'getWeather', input: { city: 'Rome' } }] },
      { toolCalls: [{ toolName: 'remember', input: { category: 'notes', value: { text: 'jazz' } } }] },
    ];
    expect(recordCalls(steps)).toEqual([
      { toolName: 'getWeather', input: { city: 'Rome' } },
      { toolName: 'remember', input: { category: 'notes', value: { text: 'jazz' } } },
    ]);
  });

  // ai@7 keeps a call whose input failed the schema in step.toolCalls, marked
  // `invalid`. It never ran — memory-forget once "called forget" five times
  // while every call was rejected, and only the memory check noticed.
  it('marks a call the tool schema rejected, with the reason on one line', () => {
    const error = new Error('Invalid input for tool forget:\n  Unrecognized key: "note"');
    const steps = [
      {
        toolCalls: [
          { toolName: 'forget', input: { category: 'homeCity', note: ' ' }, invalid: true, error },
        ],
      },
    ];
    expect(recordCalls(steps)).toEqual([
      {
        toolName: 'forget',
        input: { category: 'homeCity', note: ' ' },
        rejected: 'Invalid input for tool forget: Unrecognized key: "note"',
      },
    ]);
  });
});
