import { describe, expect, it } from 'vitest';
import { formatJudgeFailure, validateVerdicts, type JudgeVerdict } from './judge-verdicts';

const verdict = (criterion: string, pass: boolean, reason = 'because'): JudgeVerdict => ({
  criterion,
  reason,
  pass,
});

describe('validateVerdicts', () => {
  it('accepts a matching, in-order response', () => {
    expect(validateVerdicts(['a', 'b'], [verdict('a', true), verdict('b', false)])).toEqual([]);
  });

  it('rejects a short response and reports both counts', () => {
    const problems = validateVerdicts(['a', 'b', 'c'], [verdict('a', true)]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('1');
    expect(problems[0]).toContain('3');
  });

  it('rejects a long response', () => {
    expect(validateVerdicts(['a'], [verdict('a', true), verdict('b', true)])).toHaveLength(1);
  });

  // The dangerous case: right count, wrong order. Without this check
  // verdicts[i] silently describes a different criterion.
  it('rejects a reordered response', () => {
    const problems = validateVerdicts(['a', 'b'], [verdict('b', true), verdict('a', false)]);
    expect(problems).toHaveLength(2);
  });

  it('tolerates whitespace and case differences in the echoed criterion', () => {
    const criteria = ['The answer names a  weekend day.'];
    const echoed = [verdict('the answer names a weekend day.', true)];
    expect(validateVerdicts(criteria, echoed)).toEqual([]);
  });

  // buildJudgePrompt numbers the criteria, so "copy it verbatim" makes the
  // judge echo the number as well. That is formatting, not a shape problem.
  it('tolerates the enumeration prefix the prompt itself adds', () => {
    expect(validateVerdicts(['names a weekend day'], [verdict('1. names a weekend day', true)])).toEqual([]);
  });

  it('rejects a criterion the judge rewrote in substance', () => {
    expect(validateVerdicts(['names a weekend day'], [verdict('names a city', true)])).toHaveLength(1);
  });
});

describe('formatJudgeFailure', () => {
  it('shows the criterion and the judge reason, so three causes stay tellable apart', () => {
    const line = formatJudgeFailure(verdict('names a weekend day', false, 'no day is mentioned'));
    expect(line).toContain('judge:');
    expect(line).toContain('names a weekend day');
    expect(line).toContain('no day is mentioned');
  });
});
