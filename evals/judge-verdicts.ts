export type JudgeVerdict = {
  criterion: string;
  reason: string;
  pass: boolean;
};

// Wording differences that carry no meaning must not fail the shape check;
// a rewritten criterion must. The leading "N. " is stripped because
// buildJudgePrompt adds that numbering itself: asked to copy the criterion
// verbatim, the judge copies the number too, and rejecting that would fail
// four of ten calibration fixtures on formatting alone (meta-eval, first run).
const normalise = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\d+\.\s*/, '')
    .toLowerCase();

// Returns [] when the response lines up with the criteria. Anything else is a
// hard problem: a count or order mismatch means verdicts[i] describes a
// different criterion than the caller assumes, so the eval would lie both ways.
export function validateVerdicts(criteria: string[], verdicts: JudgeVerdict[]): string[] {
  if (verdicts.length !== criteria.length) {
    return [`judge returned ${verdicts.length} verdicts for ${criteria.length} criteria`];
  }
  const problems: string[] = [];
  criteria.forEach((criterion, i) => {
    if (normalise(verdicts[i].criterion) !== normalise(criterion)) {
      problems.push(
        `judge verdict ${i + 1} echoes "${verdicts[i].criterion}" but criterion ${i + 1} is "${criterion}"`,
      );
    }
  });
  return problems;
}

// The reason is not optional decoration: without it you cannot tell whether the
// agent, the criterion or the judge is the thing that is wrong.
export function formatJudgeFailure(verdict: JudgeVerdict): string {
  return `judge: "${verdict.criterion}" — ${verdict.reason}`;
}
