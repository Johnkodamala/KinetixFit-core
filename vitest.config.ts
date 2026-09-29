// Unit tests for the app's logic in src/lib (npm test). Node environment with an in-memory localStorage
// (src/test/setup.ts): the modules under test save to localStorage and nothing else from the browser.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'api/**/*.test.js'],
    setupFiles: ['src/test/setup.ts'],
  },
});
