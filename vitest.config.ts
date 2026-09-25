import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/** Código legacy: excluido de cobertura hasta que se borre (historias 1-x / 3-5). */
const legacy = [
  'src/App.ts',
  'src/main.ts',
  'src/core/**',
  'src/ui/UIManager.ts',
  'src/ai/AIPlayer.ts',
  'src/ai/DecisionEngine.ts',
  'src/ai/CardEvaluator.ts',
];

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
        exclude: ['src/**/*.test.ts', 'src/**/__tests__/**', ...legacy],
        thresholds: {
          'src/engine/**': { lines: 90, branches: 85 },
          'src/app/**': { lines: 80, branches: 70 },
          // Historias 1-x y 2-x la usan como runtime de tests; sin umbral propio (1-6).
          'src/sim/**': { lines: 0, branches: 0 },
        },
      },
    },
  }),
);
