/**
 * Browser test configuration.
 *
 * These cover what a Node test cannot: that the canvas renderer draws the right
 * pixels, that PNG output is a real image, and that the custom element behaves
 * in a live document. Everything else is tested against `src/` under vitest,
 * which is far faster (ADR-0004 is what makes that possible).
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 8974;

export default defineConfig({
  testDir: './test/browser',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `node scripts/serve.js ${PORT}`,
    url: `http://localhost:${PORT}/test/browser/harness.html`,
    reuseExistingServer: !process.env.CI,
    stdout: 'ignore',
  },
});
