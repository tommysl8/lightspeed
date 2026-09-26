import { defineConfig } from 'vitest/config';

// Tests for the phase-2 staging modules. Run with:
//   npx vitest run --root staging/phase2
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
