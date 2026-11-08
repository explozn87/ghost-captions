/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite + React. Tests run under Vitest with the jsdom environment so that
// pure modules stay browser-free (NFR-5) while UI components can mount.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['test/**/*.test.{ts,tsx}', 'src/**/*.test.{ts,tsx}'],
    // Use the worker-thread pool rather than the default child-process `forks`
    // pool: on this Windows host spawning fork workers fails intermittently
    // (process exit 0xC0000142, "DLL initialization failed"). Threads run the
    // same pure/jsdom tests without that spawn step.
    pool: 'threads',
  },
});
