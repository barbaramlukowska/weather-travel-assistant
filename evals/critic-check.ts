import { getCriticModel } from '../lib/model';
import { criticApproves, critiqueTrip } from '../lib/trip-review/critic';
import { parseEvalArgs, selectById } from './args';
import { fixtures } from './critic-fixtures';
import { scoreLabels } from './judge-score';

// Meta-eval for the critic: does it agree with hand-written labels? Run it
// per candidate model (CRITIC_MODEL=...) before trusting the review. It makes
// one paid critic call per fixture and nothing else.
async function main() {
  // Same parser as the other runners; no flags are accepted, and an unknown
  // one must not be mistaken for a fixture id.
  const { filter, unknownFlags } = parseEvalArgs(process.argv.slice(2), []);
  if (unknownFlags.length > 0) {
    console.log(`unknown flag: ${unknownFlags.join(', ')} (this runner takes a fixture id only)`);
    process.exitCode = 1;
    return;
  }

  const selected = selectById(fixtures, filter);
  if (selected.length === 0) {
    console.log(`no fixture id matches "${filter}"`);
    process.exitCode = 1;
    return;
  }

  // Measurement runs are compared across models, so every run says which one.
  console.log(`critic model: ${getCriticModel().modelId}\n`);

  const expected: boolean[] = [];
  const actual: boolean[] = [];

  for (const fixture of selected) {
    expected.push(fixture.expectPass);
    try {
      const verdict = await critiqueTrip(
        { draft: fixture.draft, forecast: fixture.forecast, memory: fixture.memory },
        {},
      );
      // Same rule as the product: issues, not `pass`.
      const approves = criticApproves(verdict);
      actual.push(approves);
      const mixed = verdict.pass !== approves ? ` (inconsistent: pass=${verdict.pass} with ${verdict.issues.length} issues)` : '';
      if (approves === fixture.expectPass) {
        console.log(`✅ ${fixture.id}${mixed}`);
      } else {
        console.log(`❌ ${fixture.id} expected pass=${fixture.expectPass}, critic approves=${approves}${mixed}`);
        console.log(`   note: ${fixture.note}`);
        for (const issue of verdict.issues) {
          console.log(`   issue: [${issue.field}${issue.item ? `: ${issue.item}` : ''}] ${issue.problem}`);
        }
      }
    } catch (err) {
      // A crash (incl. a "fail" with no issue) never counts as agreement.
      actual.push(!fixture.expectPass);
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
