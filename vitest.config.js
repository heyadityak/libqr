import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // ADR-0004: no DOM shim. core/ and ec/ tests must pass in a bare Node
    // environment -- a stray browser reference should fail the run, not be
    // papered over by jsdom.
    environment: 'node',
    include: ['test/**/*.test.js'],
    exclude: ['test/browser/**', 'node_modules/**'],
    benchmark: {
      include: ['bench/**/*.bench.js'],
    },
  },
});
