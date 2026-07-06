import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Web tests only. packages/maestroclaw has its own node:test suite
    // (`npm --prefix packages/maestroclaw test`); collecting it here would run
    // node:test files under vitest and double-execute them.
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
});
