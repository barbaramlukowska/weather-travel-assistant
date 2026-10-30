// Called once when the Next.js server starts.
export async function register() {
  // AI SDK DevTools writes every prompt, memory and reply in plain text to
  // .devtools/, so it is local and opt-in: `AI_DEVTOOLS=1 pnpm dev`.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NODE_ENV !== 'development' || process.env.AI_DEVTOOLS !== '1') return;
  const { registerTelemetry } = await import('ai');
  const { DevToolsTelemetry } = await import('@ai-sdk/devtools');
  registerTelemetry(DevToolsTelemetry());
  console.log('AI SDK DevTools on: run `pnpm devtools`, open http://localhost:4983');
}
