import { defineConfig } from 'vitest/config';

// Integration suite: exercises the SQL migrations, RPCs, and RLS against a
// running Supabase stack (`supabase start`). These tests self-skip when
// SUPABASE_DB_URL / the local stack is not reachable, so this config is only
// invoked deliberately via `npm run test:integration`.
export default defineConfig({
  test: {
    include: ['test/api/**/*.test.mjs'],
    environment: 'node',
    testTimeout: 30000,
  },
});
