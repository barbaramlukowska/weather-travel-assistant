export type EvalArgs = {
  // Substring match on case ids; undefined runs everything.
  filter: string | undefined;
  noJudge: boolean;
  // Flags this parser does not know. Collected rather than warned about here,
  // so the function stays pure and the runners decide how loud to be.
  unknownFlags: string[];
};

export const EVAL_FLAGS = ['--no-judge'];

// Lives apart from run.ts because that file calls main() on import — a test
// importing it would start a paid eval run.
// knownFlags is a parameter because the two runners accept different ones:
// --no-judge means nothing to the meta-eval, which judges by definition.
export function parseEvalArgs(argv: string[], knownFlags: string[] = EVAL_FLAGS): EvalArgs {
  return {
    filter: argv.find((arg) => !arg.startsWith('--')),
    noJudge: knownFlags.includes('--no-judge') && argv.includes('--no-judge'),
    unknownFlags: argv.filter((arg) => arg.startsWith('--') && !knownFlags.includes(arg)),
  };
}

// Shared by both runners so a filter typo behaves the same in each. The empty
// result is the interesting case: the caller must treat it as an error, not as
// a clean run of nothing.
export function selectById<T extends { id: string }>(
  items: T[],
  filter: string | undefined,
): T[] {
  return filter ? items.filter((item) => item.id.includes(filter)) : items;
}
