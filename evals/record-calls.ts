// What the runner keeps of each tool call the model made. A call whose input
// failed the tool's schema stays in step.toolCalls (ai@7 marks it `invalid`)
// but never ran, so it carries the reason and must not count as "called".
export type RecordedCall = {
  toolName: string;
  input: Record<string, unknown>;
  rejected?: string;
};

type StepCalls = {
  toolCalls: readonly { toolName: string; input: unknown; invalid?: boolean; error?: unknown }[];
};

// One line, so the reason fits the runner's failure list.
const reason = (error: unknown) =>
  (error instanceof Error ? error.message : String(error)).replace(/\s+/g, ' ').slice(0, 300);

export function recordCalls(steps: readonly StepCalls[]): RecordedCall[] {
  return steps.flatMap((step) =>
    step.toolCalls.map((tc) => ({
      toolName: tc.toolName,
      input: tc.input as Record<string, unknown>,
      ...(tc.invalid ? { rejected: reason(tc.error) } : {}),
    })),
  );
}
