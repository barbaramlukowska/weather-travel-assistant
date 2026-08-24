import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
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
