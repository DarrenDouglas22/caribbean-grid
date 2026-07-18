import { defineConfig } from 'vitest/config';

// Default suite: pure-logic unit tests that need no database or browser.
// Integration tests (which require a running Supabase stack) live under
// test/api/ and run via the separate integration config so `npm test` stays
// green in environments without Supabase installed.
export default defineConfig({
  test: {
    include: ['test/**/*.test.mjs'],
    exclude: ['test/api/**', 'node_modules/**'],
    environment: 'node',
  },
});
