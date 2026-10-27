import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['tests/web/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['tests/web/setup.ts'],
    env: { VITE_DATA_SOURCE: 'local', TZ: 'Asia/Shanghai' },
    coverage: {
      provider: 'v8',
      include: ['src/engine/**', 'src/services/**', 'src/hooks/**', 'src/auth/**', 'src/motion.ts'],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
});
