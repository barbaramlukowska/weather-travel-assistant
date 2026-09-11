import { Output, generateText } from 'ai';
import { z } from 'zod';
import { getJudgeModel } from '../lib/model';
import { JUDGE_SYSTEM_PROMPT, buildJudgePrompt, type JudgeInput } from './judge-prompt';
import { validateVerdicts, type JudgeVerdict } from './judge-verdicts';

// Field order is load-bearing: the model emits JSON token by token, so naming
// the criterion and the evidence BEFORE the boolean forces "show your work,
// then rule" instead of a guess with a rationalisation appended.
// The .describe() texts reach the model as part of the JSON schema.
const judgeSchema = z.object({
  verdicts: z.array(
    z.object({
      criterion: z.string().describe('The criterion being judged, copied verbatim'),
      reason: z
        .string()
        .describe('One sentence quoting the part of the answer that decides it'),
      pass: z.boolean(),
    }),
  ),
});

export async function judgeAnswer(input: JudgeInput): Promise<JudgeVerdict[]> {
  const { output } = await generateText({
    model: getJudgeModel(),
    // A measuring instrument wants minimum variance, not creativity.
    // Reasoning models ignore this and the SDK says so out loud
    // ("temperature is not supported for reasoning models"); it is kept
    // because JUDGE_PROVIDER=google — the swap the spec promises costs no
    // code change — lands on a model that does honour it.
    temperature: 0,
    system: JUDGE_SYSTEM_PROMPT,
    prompt: buildJudgePrompt(input),
    output: Output.object({ schema: judgeSchema }),
  });

  const problems = validateVerdicts(input.criteria, output.verdicts);
  if (problems.length > 0) throw new Error(problems.join('; '));
  return output.verdicts;
}
