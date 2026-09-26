import { defineConfig } from 'vitest/config';

// Run from the repository root with: npx vitest run --root staging/cosmos
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
