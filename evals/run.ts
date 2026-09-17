import { generateText, stepCountIs, type ModelMessage } from 'ai';
import { compactContext } from '../lib/context';
import { getChatModel } from '../lib/model';
import { buildSystemPrompt } from '../lib/prompt';
import { tools } from '../lib/tools';
import { EVAL_FLAGS, parseEvalArgs, selectById } from './args';
import { cases, type EvalCase } from './cases';
import { judgeAnswer } from './judge';
import { formatJudgeFailure } from './judge-verdicts';

type RecordedCall = { toolName: string; input: Record<string, unknown> };

// Replay the case's turns the way useChat would (append responses to the
// history), then assert on the final turn only: its tool calls and text.
async function runCase(c: EvalCase, noJudge: boolean): Promise<string[]> {
  const messages: ModelMessage[] = [];
  let calls: RecordedCall[] = [];
  let text = '';

  for (const turn of c.turns) {
    messages.push({ role: 'user', content: turn });
    // Same context pipeline as production. Without this the runner would test
    // an agent that sees a longer history than the real one — which is exactly
    // how the "pruning loses facts" bug stayed invisible.
    const { messages: compacted } = await compactContext(
      messages,
      c.tokenBudget === undefined ? {} : { tokenBudget: c.tokenBudget },
    );
    const result = await generateText({
      // Same model, prompt, tools and step budget as the app — the point of
      // evals is to test the agent users talk to, not a copy.
      model: getChatModel(),
      system: buildSystemPrompt(),
      messages: compacted,
      tools,
      stopWhen: stepCountIs(5),
    });
    calls = result.steps.flatMap((step) =>
      step.toolCalls.map((tc) => ({
        toolName: tc.toolName,
        input: tc.input as Record<string, unknown>,
      })),
    );
    text = result.text;
    messages.push(...result.responseMessages);
  }

  const failures: string[] = [];
  const called = calls.map((call) => call.toolName);

  for (const name of c.expectTools ?? []) {
    if (!called.includes(name)) {
      failures.push(
        `expected tool "${name}" was not called (called: ${called.join(', ') || 'none'})`,
      );
    }
  }
  if (c.inOrder && c.expectTools) {
    const positions = c.expectTools.map((name) => called.indexOf(name));
    const inOrder = positions.every(
      (p, i) => p >= 0 && (i === 0 || p > positions[i - 1]),
    );
    if (!inOrder) failures.push(`tools out of order: ${called.join(' → ') || 'none'}`);
  }
  for (const name of c.forbidTools ?? []) {
    if (called.includes(name)) failures.push(`forbidden tool "${name}" was called`);
  }
  for (const check of c.expectToolInput ?? []) {
    const call = calls.find((x) => x.toolName === check.tool);
    const value = call?.input[check.field];
    if (typeof value !== 'string' || !check.match.test(value)) {
      failures.push(
        `${check.tool}.${check.field} = ${JSON.stringify(value)} does not match ${check.match}`,
      );
    }
  }
  for (const re of c.answerMustMatch ?? []) {
    if (!re.test(text)) failures.push(`answer does not match ${re}: "${text.slice(0, 100)}"`);
  }
  for (const re of c.answerMustNotMatch ?? []) {
    if (re.test(text)) failures.push(`answer matches forbidden ${re}`);
  }
  if (c.answerMaxLength && text.length > c.answerMaxLength) {
    failures.push(`answer is ${text.length} chars, max ${c.answerMaxLength}`);
  }

  // The judge runs only when the free, deterministic layer is green: a case
  // that already failed is red regardless of the verdict, and paying for a
  // quality judgment on an answer we know called the wrong tool buys nothing.
  if (c.judge?.length && !noJudge && failures.length === 0) {
    try {
      const verdicts = await judgeAnswer({
        question: c.turns[c.turns.length - 1],
        answer: text,
        criteria: c.judge,
      });
      for (const verdict of verdicts) {
        if (!verdict.pass) failures.push(formatJudgeFailure(verdict));
      }
    } catch (err) {
      // Never let a broken instrument read as a pass.
      failures.push(`judge crashed: ${err instanceof Error ? err.message : err}`);
    }
  }

  return failures;
}

async function main() {
  // Optional filter by case id: `npm run eval -- trip-plan`
  const { filter, noJudge, unknownFlags } = parseEvalArgs(process.argv.slice(2));
  // A misspelled --no-judge used to run the paid judge in silence. A warning
  // would scroll past; this run costs money, so an unknown flag stops it.
  if (unknownFlags.length > 0) {
    console.log(`unknown flag: ${unknownFlags.join(', ')} (known: ${EVAL_FLAGS.join(', ')})`);
    process.exitCode = 1;
    return;
  }

  const selected = selectById(cases, filter);
  // A filter that matches nothing used to print a green 0/0 and exit 0, which
  // reads as "everything passed" — the one answer an eval must never fake.
  if (selected.length === 0) {
    console.log(`no case id matches "${filter}"`);
    process.exitCode = 1;
    return;
  }

  let passed = 0;
  for (const c of selected) {
    try {
      const failures = await runCase(c, noJudge);
      if (failures.length === 0) {
        passed++;
        console.log(`✅ ${c.id}`);
      } else {
        console.log(`❌ ${c.id}`);
        for (const f of failures) console.log(`   - ${f}`);
      }
    } catch (err) {
      console.log(`❌ ${c.id} (crashed: ${err instanceof Error ? err.message : err})`);
    }
  }

  console.log(`\n${passed}/${selected.length} passed`);
  process.exitCode = passed === selected.length ? 0 : 1;
}

main();
