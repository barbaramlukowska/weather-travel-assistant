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
    // Evals hit real APIs and are non-deterministic — kept out of the unit
    // test run entirely (see docs/NAUKA-agentic-ai.md, Phase 10).
    exclude: ['node_modules', 'evals'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
