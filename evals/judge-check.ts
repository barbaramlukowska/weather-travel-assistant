import { parseEvalArgs, selectById } from './args';
import { judgeAnswer } from './judge';
import { fixtures, validateFixtures } from './judge-fixtures';
import { scoreLabels } from './judge-score';

// Meta-eval: does the judge agree with hand-written labels? No agent calls,
// so this is cheap and fast — run it before trusting any judged eval case.
async function main() {
  // Same parser as run.ts: reading argv[2] straight would take `--no-judge`
  // for a fixture id, match nothing, and report a green 0/0 — the meta-eval
  // failing exactly the way the thing it measures must not.
  // No flags are accepted here: --no-judge is meaningless for the meta-eval,
  // and passing it must not quietly spend money judging every fixture.
  const { filter, unknownFlags } = parseEvalArgs(process.argv.slice(2), []);
  if (unknownFlags.length > 0) {
    console.log(`unknown flag: ${unknownFlags.join(', ')} (this runner takes a fixture id only)`);
    process.exitCode = 1;
    return;
  }

  const shape = validateFixtures(fixtures);
  if (shape.length > 0) {
    for (const problem of shape) console.log(`❌ fixture ${problem}`);
    process.exitCode = 1;
    return;
  }

  const selected = selectById(fixtures, filter);
  if (selected.length === 0) {
    console.log(`no fixture id matches "${filter}"`);
    process.exitCode = 1;
    return;
  }

  const expected: boolean[] = [];
  const actual: boolean[] = [];

  for (const fixture of selected) {
    try {
      const verdicts = await judgeAnswer({
        question: fixture.question,
        answer: fixture.answer,
        criteria: fixture.criteria,
      });
      fixture.criteria.forEach((criterion, i) => {
        const want = fixture.expect[i];
        const got = verdicts[i].pass;
        expected.push(want);
        actual.push(got);
        if (want === got) {
          console.log(`✅ ${fixture.id} [${i + 1}]`);
        } else {
          console.log(`❌ ${fixture.id} [${i + 1}] expected ${want}, judge said ${got}`);
          console.log(`   criterion: ${criterion}`);
          // The reason is what tells you whether the prompt, the fixture or
          // the model is the thing to fix.
          console.log(`   reason: ${verdicts[i].reason}`);
        }
      });
    } catch (err) {
      // A crashed judge must never read as agreement.
      fixture.criteria.forEach((_, i) => {
        expected.push(fixture.expect[i]);
        actual.push(!fixture.expect[i]);
      });
      console.log(`❌ ${fixture.id} (crashed: ${err instanceof Error ? err.message : err})`);
    }
  }

  const score = scoreLabels(expected, actual);
  console.log(
    `\n${score.matched}/${score.total} matched  ` +
      `(baseline: always-pass ${score.alwaysPass}/${score.total}, ` +
      `always-fail ${score.alwaysFail}/${score.total})`,
  );
  process.exitCode = score.matched === score.total ? 0 : 1;
}

main();
