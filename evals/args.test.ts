import { describe, expect, it } from 'vitest';
import { parseEvalArgs, selectById } from './args';

describe('parseEvalArgs', () => {
  it('defaults to judging everything and filtering nothing', () => {
    expect(parseEvalArgs([])).toEqual({ filter: undefined, noJudge: false, unknownFlags: [] });
  });

  it('reads a bare argument as the case-id filter', () => {
    expect(parseEvalArgs(['trip-plan'])).toEqual({
      filter: 'trip-plan',
      noJudge: false,
      unknownFlags: [],
    });
  });

  // The regression this module exists for: without it "--no-judge" would be
  // taken as a filter, match no case, and print a green 0/0.
  it('does not mistake a flag for the filter', () => {
    expect(parseEvalArgs(['--no-judge'])).toEqual({
      filter: undefined,
      noJudge: true,
      unknownFlags: [],
    });
  });

  it('accepts a filter and the flag together, in either order', () => {
    expect(parseEvalArgs(['trip-plan', '--no-judge'])).toEqual({
      filter: 'trip-plan',
      noJudge: true,
      unknownFlags: [],
    });
    expect(parseEvalArgs(['--no-judge', 'trip-plan'])).toEqual({
      filter: 'trip-plan',
      noJudge: true,
      unknownFlags: [],
    });
  });

  // A misspelled --no-judge silently runs the paid judge, so the flag is still
  // not treated as a filter, but it is reported instead of vanishing.
  it('reports an unknown flag rather than treating it as a filter', () => {
    expect(parseEvalArgs(['--nojudge'])).toEqual({
      filter: undefined,
      noJudge: false,
      unknownFlags: ['--nojudge'],
    });
  });

  it('reports every unknown flag alongside a recognised one', () => {
    expect(parseEvalArgs(['--no_judge', '--no-judge', '--verbose'])).toEqual({
      filter: undefined,
      noJudge: true,
      unknownFlags: ['--no_judge', '--verbose'],
    });
  });

  // The meta-eval accepts no flags: it judges by definition, so --no-judge
  // there is a typo that would otherwise cost a full paid run.
  it('treats every flag as unknown when the caller accepts none', () => {
    expect(parseEvalArgs(['--no-judge'], [])).toEqual({
      filter: undefined,
      noJudge: false,
      unknownFlags: ['--no-judge'],
    });
  });

  it('still reads a bare filter when no flags are accepted', () => {
    expect(parseEvalArgs(['clean-pass'], [])).toEqual({
      filter: 'clean-pass',
      noJudge: false,
      unknownFlags: [],
    });
  });
});

describe('selectById', () => {
  const items = [{ id: 'trip-plan-flow' }, { id: 'trip-plan-memory' }, { id: 'unknown-city' }];

  it('returns everything when there is no filter', () => {
    expect(selectById(items, undefined)).toEqual(items);
  });

  it('matches ids by substring', () => {
    expect(selectById(items, 'trip-plan')).toEqual([
      { id: 'trip-plan-flow' },
      { id: 'trip-plan-memory' },
    ]);
  });

  // The case the runners must refuse to report as success.
  it('returns nothing for a filter that matches no id', () => {
    expect(selectById(items, 'trp-plan')).toEqual([]);
  });
});
