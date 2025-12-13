import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        // --max-old-space-size: Allow up to 4GB heap for large codebase indexing
        // --expose-gc: Enable global.gc() for explicit garbage collection between tests
        execArgv: ['--max-old-space-size=4096', '--expose-gc'],
      },
    },
    // Run config tests sequentially to avoid race conditions with LanceDB tables
    // When FULL_CODEBASE=true, both test files try to create indexes for the same project
    fileParallelism: false,
    sequence: {
      // Run test files sequentially
      concurrent: false,
    },
  },
});
