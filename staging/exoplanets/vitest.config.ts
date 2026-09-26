import { defineConfig } from 'vitest/config';

// Run with: npx vitest run --root staging/exoplanets   (from the repository root)
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
