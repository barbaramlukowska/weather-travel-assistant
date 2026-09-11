import { describe, expect, it } from 'vitest';
import { scoreLabels } from './judge-score';

describe('scoreLabels', () => {
  it('counts matches against the labels', () => {
    const score = scoreLabels([true, false, true], [true, true, true]);
    expect(score.total).toBe(3);
    expect(score.matched).toBe(2);
  });

  // Without the baselines "9/10" means nothing: a judge that always says the
  // same thing must be visibly worse than a real one.
  it('reports what a constant judge would score', () => {
    const score = scoreLabels([true, false, false, true, true], []);
    expect(score.alwaysPass).toBe(3);
    expect(score.alwaysFail).toBe(2);
  });

  it('is balanced when the label set is balanced', () => {
    const expectedLabels = [true, true, false, false];
    const score = scoreLabels(expectedLabels, expectedLabels);
    expect(score.matched).toBe(4);
    expect(score.alwaysPass).toBe(2);
    expect(score.alwaysFail).toBe(2);
  });

  it('treats a missing actual label as a mismatch', () => {
    expect(scoreLabels([true, true], [true]).matched).toBe(1);
  });
});
