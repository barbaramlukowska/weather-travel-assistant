import { describe, expect, it } from 'vitest';
import { fixtures, validateFixtures, type JudgeFixture } from './judge-fixtures';

const fixture = (over: Partial<JudgeFixture>): JudgeFixture => ({
  id: 'x',
  question: 'q',
  answer: 'a',
  criteria: ['c'],
  expect: [true],
  ...over,
});

describe('validateFixtures', () => {
  it('accepts the real fixture set', () => {
    expect(validateFixtures(fixtures)).toEqual([]);
  });

  it('catches a fixture with fewer labels than criteria', () => {
    const problems = validateFixtures([fixture({ criteria: ['a', 'b'], expect: [true] })]);
    expect(problems).toEqual(['x: 2 criteria but 1 labels']);
  });

  it('catches a fixture with more labels than criteria', () => {
    const problems = validateFixtures([fixture({ criteria: ['a'], expect: [true, false] })]);
    expect(problems).toEqual(['x: 1 criteria but 2 labels']);
  });

  it('catches a fixture that would measure nothing', () => {
    expect(validateFixtures([fixture({ criteria: [], expect: [] })])).toEqual(['x: no criteria']);
  });
});
