import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/coverage/**'],
      coverage: {
        provider: 'v8',
        reporter: ['text-summary', 'html', 'json-summary'],
        include: ['src/**/*.ts'],
        exclude: ['src/**/*.test.ts', 'src/**/__tests__/**', 'src/main.ts', 'src/ui/TrucoApp.ts'],
        thresholds: {
          'src/engine/**': { lines: 90, branches: 85 },
          'src/app/**': { lines: 80, branches: 70 },
          'src/ai/**': { lines: 80, branches: 70 },
          // Historias 1-x y 2-x la usan como runtime de tests; sin umbral propio (1-6).
          'src/sim/**': { lines: 0, branches: 0 },
        },
      },
    },
  }),
);
