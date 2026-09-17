import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    // Vercel ustawia NODE_ENV=production dla całego builda, a `npm run build`
    // odpala vitest w tym samym procesie. React ładuje wtedy bundle
    // produkcyjny, który nie eksportuje `act()` — i każdy render z
    // @testing-library/react wywala się na "React.act is not a function".
    // Wymuszamy 'test', żeby testy zawsze dostały bundle development.
    env: { NODE_ENV: 'test' },
    setupFiles: ['./vitest.setup.ts'],
    // Eval runners hit real APIs and are non-deterministic, so they never run
    // under `npm test` (see NAUKA-agentic-ai.md, Phase 10 — outside this repo);
    // run them by hand with `npm run eval` / `npm run eval:judge`. Pure unit
    // tests living next to eval helpers DO run here — add any new paid runner
    // to this list.
    exclude: ['node_modules', 'evals/run.ts', 'evals/judge-check.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
