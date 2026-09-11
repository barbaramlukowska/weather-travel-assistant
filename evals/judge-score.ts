export type LabelScore = {
  total: number;
  matched: number;
  // What a judge that answers the same way every time would score. Printed
  // next to the real result so the number can be read at all.
  alwaysPass: number;
  alwaysFail: number;
};

export function scoreLabels(expected: boolean[], actual: boolean[]): LabelScore {
  const alwaysPass = expected.filter((label) => label).length;
  return {
    total: expected.length,
    matched: expected.filter((label, i) => label === actual[i]).length,
    alwaysPass,
    alwaysFail: expected.length - alwaysPass,
  };
}
